import { Types } from "mongoose";
import { User } from "../../models/User";
import { FishSession, FishSessionCloseReason, IFishSession } from "../../models/FishSession";
import { emitSpinEvent } from "../../realtime/eventBus";
import { BET_LEVELS, SESSION_SWEEP_INTERVAL_MS, SESSION_TIMEOUT_MS } from "./config";
import { getCachedFishConfig, rollKill } from "./engine";
import { fishGameMeta } from "./meta";

export interface HitInput {
  speciesId: string;
  betAmount: number;
}

/** Per hit, in the same order as the request. `rejected` = not charged (couldn't afford it). */
export type HitResult = { killed: boolean; winAmount: number } | { rejected: true };

export class SessionError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function roundCents(value: number): number {
  return Math.round(value * 100) / 100;
}

function isStale(session: IFishSession): boolean {
  return Date.now() - session.lastActivityAt.getTime() > SESSION_TIMEOUT_MS;
}

/** Opens a new session, closing any the player still has open (e.g. a second tab). */
export async function startSession(userId: string): Promise<IFishSession> {
  const user = await User.findById(userId).select("balance");
  if (!user) throw new SessionError("User not found", 404);

  const stillOpen = await FishSession.find({ userId, status: "active" });
  await Promise.all(stillOpen.map((s) => closeSession(s, "replaced")));

  return FishSession.create({ userId, gameId: fishGameMeta.id, startBalance: user.balance });
}

/** Finalizes a session with the player's balance at that moment. No-op if already closed. */
export async function closeSession(session: IFishSession, reason: FishSessionCloseReason): Promise<IFishSession> {
  if (session.status === "closed") return session;
  const user = await User.findById(session.userId).select("balance").lean();
  const closed = await FishSession.findOneAndUpdate(
    { _id: session._id, status: "active" },
    { $set: { status: "closed", closeReason: reason, endBalance: user?.balance ?? null, endedAt: new Date() } },
    { new: true }
  );
  return closed ?? session;
}

export async function getOwnActiveSession(sessionId: string, userId: string): Promise<IFishSession> {
  if (!Types.ObjectId.isValid(sessionId)) throw new SessionError("Invalid session", 400);
  const session = await FishSession.findOne({ _id: sessionId, userId });
  if (!session) throw new SessionError("Session not found", 404);
  if (session.status === "closed") throw new SessionError("Session has ended", 409);
  if (isStale(session)) {
    await closeSession(session, "timeout");
    throw new SessionError("Session has ended", 409);
  }
  return session;
}

/** Returns an error message if the batch is malformed, otherwise null. */
export function validateHits(hits: unknown, maxHits: number): string | null {
  if (!Array.isArray(hits)) return "hits must be an array";
  if (hits.length > maxHits) return `At most ${maxHits} hits per batch`;
  for (const hit of hits) {
    if (typeof hit !== "object" || hit === null) return "Each hit must be an object";
    const h = hit as Record<string, unknown>;
    if (typeof h.speciesId !== "string") return "Each hit needs a speciesId";
    if (!BET_LEVELS.includes(Number(h.betAmount))) return `betAmount must be one of ${BET_LEVELS.join(", ")}`;
  }
  return null;
}

/**
 * Resolves a whole batch of hits in one go: every kill is still rolled here on the server, but
 * the balance is written once per batch instead of once per hit. An empty batch is a heartbeat
 * that just keeps the session alive.
 */
export async function processBatch(
  session: IFishSession,
  hits: HitInput[]
): Promise<{ results: HitResult[]; balance: number }> {
  const now = new Date();

  if (hits.length === 0) {
    await FishSession.updateOne({ _id: session._id }, { $set: { lastActivityAt: now } });
    const user = await User.findById(session.userId).select("balance").lean();
    return { results: [], balance: user?.balance ?? 0 };
  }

  const config = await getCachedFishConfig();
  const speciesById = new Map(config.species.map((s) => [s.id, s]));

  // Retried once: the conditional balance update below fails if the balance changed between
  // reading it and writing (e.g. the player is also playing another game in another tab).
  for (let attempt = 0; attempt < 2; attempt++) {
    const user = await User.findById(session.userId).select("balance username").lean();
    if (!user) throw new SessionError("User not found", 404);

    const results: HitResult[] = [];
    const totals: Record<string, { hits: number; kills: number; wagered: number; won: number }> = {};
    let running = user.balance;
    let lowest = 0; // most negative the balance dips below its starting point mid-batch
    let delta = 0;

    for (const hit of hits) {
      const species = speciesById.get(hit.speciesId);
      if (!species || running < hit.betAmount) {
        results.push({ rejected: true });
        continue;
      }
      const killed = rollKill(species.multiplier, config.rtpPercent);
      const winAmount = killed ? roundCents(species.multiplier * hit.betAmount) : 0;

      delta = roundCents(delta - hit.betAmount);
      lowest = Math.min(lowest, delta);
      delta = roundCents(delta + winAmount);
      running = roundCents(user.balance + delta);
      results.push({ killed, winAmount });

      const t = (totals[species.id] ??= { hits: 0, kills: 0, wagered: 0, won: 0 });
      t.hits += 1;
      t.kills += killed ? 1 : 0;
      t.wagered = roundCents(t.wagered + hit.betAmount);
      t.won = roundCents(t.won + winAmount);
    }

    const accepted = Object.values(totals);
    if (accepted.length === 0) return { results, balance: user.balance };

    // Guarded on the balance still covering the batch's lowest point, so a concurrent spend
    // elsewhere can never drive it negative. Rounded to cents in the same atomic step.
    const updated = await User.findOneAndUpdate(
      { _id: session.userId, balance: { $gte: -lowest } },
      [{ $set: { balance: { $round: [{ $add: ["$balance", delta] }, 2] } } }],
      { new: true }
    )
      .select("balance")
      .lean();
    if (!updated) continue;

    const inc: Record<string, number> = { hits: 0, kills: 0, wagered: 0, won: 0 };
    for (const [id, t] of Object.entries(totals)) {
      inc.hits += t.hits;
      inc.kills += t.kills;
      inc.wagered = roundCents(inc.wagered + t.wagered);
      inc.won = roundCents(inc.won + t.won);
      inc[`species.${id}.hits`] = t.hits;
      inc[`species.${id}.kills`] = t.kills;
      inc[`species.${id}.wagered`] = t.wagered;
      inc[`species.${id}.won`] = t.won;
    }
    await FishSession.updateOne({ _id: session._id }, { $inc: inc, $set: { lastActivityAt: now } });

    // One live-feed event per batch with catches (not per hit) keeps the admin feed readable.
    if (inc.kills > 0) {
      emitSpinEvent({
        userId: String(session.userId),
        username: user.username,
        gameId: fishGameMeta.id,
        bet: inc.wagered,
        winAmount: inc.won,
        tier: null,
        forced: false,
        balanceAfter: updated.balance,
        createdAt: now.toISOString(),
      });
    }

    return { results, balance: updated.balance };
  }

  throw new SessionError("Balance changed during play — please try again", 409);
}

/** Closes sessions whose client stopped sending batches/heartbeats (tab closed, crash, offline). */
async function sweepStaleSessions(): Promise<void> {
  const cutoff = new Date(Date.now() - SESSION_TIMEOUT_MS);
  const stale = await FishSession.find({ status: "active", lastActivityAt: { $lt: cutoff } }).limit(200);
  for (const session of stale) await closeSession(session, "timeout");
}

export function startSessionSweeper(): void {
  setInterval(() => {
    sweepStaleSessions().catch((err) => console.error("[fish-game] session sweep failed", err));
  }, SESSION_SWEEP_INTERVAL_MS).unref();
}
