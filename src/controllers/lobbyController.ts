import { Request, Response } from "express";
import { EventEmitter } from "events";
import { LobbyGame, LOBBY_TAGS, LobbyTag } from "../models/LobbyGame";
import { registerSseClient } from "../realtime/sse";

export interface LobbyGameOverride {
  slug: string;
  visible: boolean;
  tag: LobbyTag | null;
}

/** Its own bus (not the shared eventBus) because every open home page holds a listener — that
 * can be far more than the shared bus's listener cap. */
const lobbyBus = new EventEmitter();
lobbyBus.setMaxListeners(0);

const SLUG_PATTERN = /^[a-z0-9-]{1,64}$/;
const VALID_TAGS = new Set<string>(LOBBY_TAGS);

async function listOverrides(): Promise<LobbyGameOverride[]> {
  const docs = await LobbyGame.find().select("slug visible tag").lean();
  return docs.map((d) => ({ slug: d.slug, visible: d.visible, tag: d.tag ?? null }));
}

/** Public: the lobby is browsable signed-out, so no auth. */
export async function getLobbyGames(_req: Request, res: Response): Promise<void> {
  res.json({ games: await listOverrides() });
}

/** Public SSE: sends the full override list on connect, then again on every admin change. */
export async function streamLobbyGames(req: Request, res: Response): Promise<void> {
  registerSseClient(req, res, lobbyBus, ["lobby"]);
  res.write(`event: lobby\ndata: ${JSON.stringify({ games: await listOverrides() })}\n\n`);
}

/** Admin: sets one game's visibility and badge. */
export async function updateLobbyGame(req: Request, res: Response): Promise<void> {
  const { slug } = req.params;
  const { visible, tag } = req.body ?? {};

  if (!SLUG_PATTERN.test(slug)) {
    res.status(400).json({ error: "Invalid game slug" });
    return;
  }
  if (typeof visible !== "boolean") {
    res.status(400).json({ error: "visible must be true or false" });
    return;
  }
  if (tag !== null && !VALID_TAGS.has(tag)) {
    res.status(400).json({ error: `tag must be null or one of ${LOBBY_TAGS.join(", ")}` });
    return;
  }

  const doc = await LobbyGame.findOneAndUpdate(
    { slug },
    { $set: { visible, tag } },
    { upsert: true, new: true }
  );

  const games = await listOverrides();
  lobbyBus.emit("lobby", { games });
  res.json({ game: { slug: doc.slug, visible: doc.visible, tag: doc.tag ?? null } });
}
