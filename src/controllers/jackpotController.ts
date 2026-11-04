import { Request, Response } from "express";
import { JACKPOT_TIERS, JACKPOT_TIER_LABELS } from "../models/JackpotState";
import { JackpotHit } from "../models/JackpotHit";
import { User } from "../models/User";
import { claimHit, onStreamOpened } from "../services/jackpot";
import { openStream } from "../realtime/jackpotStream";
import { consumeSseTicket, mintSseTicket } from "../utils/sseTicket";

/** Short-lived, single-use ticket for opening the stream below (EventSource can't send the
 * Bearer header). */
export async function streamTicket(req: Request, res: Response): Promise<void> {
  res.json({ ticket: mintSseTicket(String(req.userId)) });
}

/** One long-lived SSE connection per open game, replacing the old 20s heartbeat. While it's open
 * the player counts as playing `gameId`; the server pushes `state` (in the pool or not, the four
 * tiers' collected amounts, the contribution % the base game must give up) whenever it changes,
 * and `pending` when a jackpot hit is ready for this player. */
export async function stream(req: Request, res: Response): Promise<void> {
  const claimed = consumeSseTicket(String(req.query.ticket ?? ""));
  const gameId = typeof req.query.gameId === "string" ? req.query.gameId : "";
  if (!claimed) {
    res.status(401).json({ error: "Invalid or expired ticket" });
    return;
  }
  if (!gameId) {
    res.status(400).json({ error: "gameId is required" });
    return;
  }
  const user = await User.findById(claimed.userId).select("disabled deletedAt").lean();
  if (!user || user.disabled || user.deletedAt) {
    res.status(401).json({ error: "Account is no longer active" });
    return;
  }

  // Games that can't deliver a jackpot yet only show the bar; a hit waits for this player to
  // open one that can.
  const client = openStream(res, { userId: claimed.userId, gameId, canDeliver: req.query.canDeliver === "1" });
  onStreamOpened(client);
}

/** Called by the game when the forced feature has finished. Pays whatever the tier has collected
 * at that moment — never anything the client sends. */
export async function claim(req: Request, res: Response): Promise<void> {
  const { hitId, gameId } = req.body ?? {};
  if (typeof hitId !== "string" || typeof gameId !== "string") {
    res.status(400).json({ error: "hitId and gameId are required" });
    return;
  }
  const result = await claimHit(String(req.userId), hitId, gameId);
  if (!result.ok) {
    res.status(409).json({ error: result.reason });
    return;
  }
  const paid = result.hit;
  res.json({ tier: paid.tier, label: JACKPOT_TIER_LABELS[paid.tier], amount: paid.amount });
}

const RECORDS_LIMIT = 50;

/** Hides most of a username so other players' accounts aren't exposed: "jackson42" → "ja*****42". */
function maskUsername(name: string): string {
  if (name.length <= 4) return `${name[0] ?? "*"}***`;
  return `${name.slice(0, 2)}${"*".repeat(name.length - 4)}${name.slice(-2)}`;
}

/** Recent jackpot wins for the player-facing Jackpot Record screen — all tiers, or one when
 * `?tier=` is given. Winners are masked; the caller's own wins are flagged so the screen can show
 * their rank. */
export async function records(req: Request, res: Response): Promise<void> {
  const { tier } = req.query;
  const filter: Record<string, unknown> = { status: "paid" };
  if (typeof tier === "string" && tier !== "total") {
    if (!(JACKPOT_TIERS as readonly string[]).includes(tier)) {
      res.status(400).json({ error: "tier must be total, jackpot, mega, major or mini" });
      return;
    }
    filter.tier = tier;
  }

  const hits = await JackpotHit.find(filter).sort({ paidAt: -1 }).limit(RECORDS_LIMIT).lean();
  const ids = [...new Set(hits.map((h) => (h.userId ? String(h.userId) : null)).filter((id): id is string => !!id))];
  const users = await User.find({ _id: { $in: ids } }).select("username").lean();
  const names = new Map(users.map((u) => [String(u._id), u.username]));
  const me = String(req.userId);

  const list = hits.map((h) => {
    const userId = h.userId ? String(h.userId) : "";
    return {
      tier: h.tier,
      label: JACKPOT_TIER_LABELS[h.tier],
      amount: h.amount,
      paidAt: h.paidAt,
      player: maskUsername(names.get(userId) ?? "player"),
      isMe: userId === me,
    };
  });
  const myIndex = list.findIndex((r) => r.isMe);
  res.json({ records: list, myRank: myIndex >= 0 ? myIndex + 1 : null });
}
