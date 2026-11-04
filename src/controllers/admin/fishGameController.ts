import { Request, Response } from "express";
import { FishGameConfig } from "../../models/FishGameConfig";
import { FishSession } from "../../models/FishSession";
import { getFishConfig, invalidateFishConfigCache } from "../../games/FishGame/engine";
import { fishGameMeta } from "../../games/FishGame/meta";
import {
  FISH_SPECIES,
  MAX_MULTIPLIER,
  MAX_RTP_PERCENT,
  MIN_MULTIPLIER,
  MIN_RTP_PERCENT,
} from "../../games/FishGame/config";

function limits() {
  return {
    minRtpPercent: MIN_RTP_PERCENT,
    maxRtpPercent: MAX_RTP_PERCENT,
    minMultiplier: MIN_MULTIPLIER,
    maxMultiplier: MAX_MULTIPLIER,
  };
}

export async function getFishGameConfig(_req: Request, res: Response): Promise<void> {
  res.json({ ...(await getFishConfig()), limits: limits() });
}

export async function updateFishGameConfig(req: Request, res: Response): Promise<void> {
  const rtpPercent = Number(req.body?.rtpPercent);
  if (!Number.isFinite(rtpPercent) || rtpPercent < MIN_RTP_PERCENT || rtpPercent > MAX_RTP_PERCENT) {
    res.status(400).json({ error: `rtpPercent must be between ${MIN_RTP_PERCENT} and ${MAX_RTP_PERCENT}` });
    return;
  }

  const body = req.body?.speciesMultipliers;
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    res.status(400).json({ error: "speciesMultipliers must be an object of speciesId -> multiplier" });
    return;
  }

  const speciesMultipliers: Record<string, number> = {};
  for (const [id, raw] of Object.entries(body as Record<string, unknown>)) {
    if (!FISH_SPECIES.some((s) => s.id === id)) {
      res.status(400).json({ error: `Unknown species "${id}"` });
      return;
    }
    const multiplier = Number(raw);
    if (!Number.isFinite(multiplier) || multiplier < MIN_MULTIPLIER || multiplier > MAX_MULTIPLIER) {
      res.status(400).json({ error: `Multiplier for "${id}" must be between ${MIN_MULTIPLIER} and ${MAX_MULTIPLIER}` });
      return;
    }
    speciesMultipliers[id] = multiplier;
  }

  await FishGameConfig.findOneAndUpdate(
    { gameId: fishGameMeta.id },
    { $set: { rtpPercent, speciesMultipliers } },
    { upsert: true }
  );
  invalidateFishConfigCache();

  res.json({ ...(await getFishConfig()), limits: limits() });
}

type Range = "today" | "week" | "month" | "all";

function rangeStart(range: Range): Date | null {
  const now = new Date();
  switch (range) {
    case "today":
      return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case "week":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "month":
      return new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
    case "all":
      return null;
  }
}


function parseRange(value: unknown): Range {
  return (["today", "week", "month", "all"].includes(String(value)) ? value : "today") as Range;
}

function sessionMatch(range: Range): Record<string, unknown> {
  const start = rangeStart(range);
  const match: Record<string, unknown> = { gameId: fishGameMeta.id };
  if (start) match.startedAt = { $gte: start };
  return match;
}

/** Actual (observed) results per species, summed over the sessions started in the range, so
 * admins can compare real payout against the configured RTP — with small sample sizes these
 * will swing well away from the target. */
export async function getFishGameStats(req: Request, res: Response): Promise<void> {
  const range = parseRange(req.query.range);
  const match = sessionMatch(range);

  const [rows, sessionCounts]: [
    { _id: string; hits: number; kills: number; wagered: number; paidOut: number }[],
    { _id: null; sessions: number; active: number }[],
  ] = await Promise.all([
    FishSession.aggregate([
      { $match: match },
      { $project: { entry: { $objectToArray: "$species" } } },
      { $unwind: "$entry" },
      {
        $group: {
          _id: "$entry.k",
          hits: { $sum: "$entry.v.hits" },
          kills: { $sum: "$entry.v.kills" },
          wagered: { $sum: "$entry.v.wagered" },
          paidOut: { $sum: "$entry.v.won" },
        },
      },
    ]),
    FishSession.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          sessions: { $sum: 1 },
          active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
        },
      },
    ]),
  ]);

  const totals = rows.reduce(
    (acc, r) => ({
      hits: acc.hits + r.hits,
      kills: acc.kills + r.kills,
      wagered: acc.wagered + r.wagered,
      paidOut: acc.paidOut + r.paidOut,
    }),
    { hits: 0, kills: 0, wagered: 0, paidOut: 0 }
  );

  res.json({
    range,
    totals: {
      ...totals,
      net: totals.wagered - totals.paidOut,
      rtpActual: totals.wagered > 0 ? (totals.paidOut / totals.wagered) * 100 : 0,
      sessions: sessionCounts[0]?.sessions ?? 0,
      activeSessions: sessionCounts[0]?.active ?? 0,
    },
    species: rows.map((r) => ({
      speciesId: r._id,
      hits: r.hits,
      kills: r.kills,
      wagered: r.wagered,
      paidOut: r.paidOut,
      rtpActual: r.wagered > 0 ? (r.paidOut / r.wagered) * 100 : 0,
    })),
  });
}

const DEFAULT_SESSION_LIMIT = 50;
const MAX_SESSION_LIMIT = 200;

/** One row per visit: who played, start/end balance, and what they won or lost. */
export async function listFishGameSessions(req: Request, res: Response): Promise<void> {
  const range = parseRange(req.query.range);
  const limit = Math.min(MAX_SESSION_LIMIT, Math.max(1, Number(req.query.limit) || DEFAULT_SESSION_LIMIT));

  const sessions = await FishSession.find(sessionMatch(range))
    .sort({ startedAt: -1 })
    .limit(limit)
    .populate<{ userId: { _id: unknown; username: string } | null }>("userId", "username")
    .select("-species")
    .lean();

  res.json({
    sessions: sessions.map((s) => ({
      id: String(s._id),
      userId: s.userId ? String(s.userId._id) : null,
      username: s.userId?.username ?? "(deleted user)",
      status: s.status,
      closeReason: s.closeReason,
      startBalance: s.startBalance,
      endBalance: s.endBalance,
      hits: s.hits,
      kills: s.kills,
      wagered: s.wagered,
      won: s.won,
      startedAt: s.startedAt,
      endedAt: s.endedAt,
      lastActivityAt: s.lastActivityAt,
    })),
  });
}
