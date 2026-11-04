import { Request, Response } from "express";
import { SpinHistory } from "../../models/SpinHistory";
import { User } from "../../models/User";
import { mintSseTicket, consumeSseTicket } from "../../utils/sseTicket";
import { eventBus } from "../../realtime/eventBus";
import { registerSseClient } from "../../realtime/sse";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

export async function getRecentSpins(req: Request, res: Response): Promise<void> {
  const gameId = typeof req.query.gameId === "string" && req.query.gameId ? req.query.gameId : undefined;
  const username = typeof req.query.username === "string" ? req.query.username.trim() : "";
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_LIMIT));

  const filter: Record<string, unknown> = {};
  if (gameId) filter.gameId = gameId;

  if (username) {
    // Escape regex metacharacters so a literal search string (e.g. containing "+") can't break the query.
    const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const matchingUsers = await User.find({ username: { $regex: escaped, $options: "i" } }).select("_id");
    if (matchingUsers.length === 0) {
      res.json({ spins: [] });
      return;
    }
    filter.userId = { $in: matchingUsers.map((u) => u._id) };
  }

  const spins = await SpinHistory.find(filter).sort({ createdAt: -1 }).limit(limit).populate("userId", "username");
  res.json({ spins });
}

export async function getSseTicket(req: Request, res: Response): Promise<void> {
  res.json({ ticket: mintSseTicket(req.userId as string) });
}

export async function streamEvents(req: Request, res: Response): Promise<void> {
  const ticket = String(req.query.ticket ?? "");
  const claim = consumeSseTicket(ticket);
  if (!claim) {
    res.status(401).json({ error: "Invalid or expired ticket" });
    return;
  }

  const user = await User.findById(claim.userId).select("role disabled deletedAt").lean();
  if (!user || user.role !== "admin" || user.disabled || user.deletedAt) {
    res.status(403).json({ error: "Admin access required" });
    return;
  }

  registerSseClient(req, res, eventBus, ["spin", "balance", "presence"]);
}
