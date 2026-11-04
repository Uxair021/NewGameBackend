import { Router, Request, Response } from "express";
import { ClientRtpConfig } from "../../models/ClientRtpConfig";
import { asyncHandler } from "../../utils/asyncHandler";

/** Every game whose RTP config the admin page stores on the server — ids match each game's
 * /api/games/<id> routes, except "keno", the one config HexaKeno and Super Keno Balls share. */
export const SERVER_RTP_CONFIG_GAMES = new Set([
  "buffalo-777",
  "cash-machine",
  "crazy-777",
  "crystal-clover",
  "5x-rewind",
  "fruity-777",
  "gems-deluxe",
  "life-of-luxury",
  "mega-10x-pay",
  "rubber-duck",
  "shamrock-spin",
  "sizzling-7s",
  "the-finer-thing",
  "top-dollar",
  "vegas-hits",
  "zeus-vs-hades",
  "keno",
]);

/** Loose shape check — each game's config has its own shape, and the game validates it in full
 * when it loads it (falling back to its default if it doesn't fit). */
function isPlausibleConfig(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

const router = Router();

/** The saved config for a game, or { config: null } when the admin hasn't saved one yet. */
router.get(
  "/:gameId",
  asyncHandler(async (req: Request, res: Response) => {
    const { gameId } = req.params;
    if (!SERVER_RTP_CONFIG_GAMES.has(gameId)) {
      res.status(404).json({ error: "This game's RTP config isn't stored on the server" });
      return;
    }
    const doc = await ClientRtpConfig.findOne({ gameId }).lean();
    res.json({ config: doc?.config ?? null, updatedAt: doc?.updatedAt ?? null });
  })
);

/** Saves (replaces) a game's config. Body: { config }. */
router.put(
  "/:gameId",
  asyncHandler(async (req: Request, res: Response) => {
    const { gameId } = req.params;
    if (!SERVER_RTP_CONFIG_GAMES.has(gameId)) {
      res.status(404).json({ error: "This game's RTP config isn't stored on the server" });
      return;
    }
    const { config } = req.body ?? {};
    if (!isPlausibleConfig(config)) {
      res.status(400).json({ error: "config must be an object" });
      return;
    }
    if (JSON.stringify(config).length > 200_000) {
      res.status(400).json({ error: "config is too large" });
      return;
    }
    const doc = await ClientRtpConfig.findOneAndUpdate(
      { gameId },
      { gameId, config, updatedBy: req.userId ? String(req.userId) : null },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    res.json({ config: doc?.config ?? config, updatedAt: doc?.updatedAt ?? null });
  })
);

export default router;
