import { Types } from "mongoose";
import { creditBalance } from "./spinBalance";
import {
  JackpotState,
  IJackpotState,
  JACKPOT_TIERS,
  JACKPOT_TIER_LABELS,
  JACKPOT_STATE_KEY,
  JackpotTierKey,
  JackpotTierValues,
} from "../models/JackpotState";
import { JackpotHit, IJackpotHit } from "../models/JackpotHit";
import { secureRandomInt } from "../utils/rng";
import { StreamClient, listStreamClients, sendFrame, sseFrame } from "../realtime/jackpotStream";

/**
 * The shared four-tier jackpot pool (Jackpot / Mega / Major / Mini).
 *
 * - Funding: every bet on a pool game puts the admin's contribution % of the bet into the pool,
 *   split equally between the tiers that aren't full yet (4 filling → 25% each, 3 → 33.33%, ...).
 *   Each tier's admin amount is its MAX: a full tier takes nothing more. When every tier is full
 *   the contribution drops to 0 and pool games play at their full RTP again. Pool games play their
 *   base game at (RTP - contribution %), so total RTP and the house edge are unchanged.
 * - Date mode (Auto off): 2 minutes before a hit's time it locks and its winner is fixed (random
 *   hits pick from players currently playing a pool game). Once its time has passed and the winner
 *   is in a pool game, they're paid whatever the tier has collected by then.
 * - Auto mode: the moment a tier reaches its max, a hit is created already locked to the admin's
 *   picked player or a random one, and is delivered right away. It repeats every time the tier
 *   fills again, until the admin turns Auto off. Each round's pick resets to random.
 * - claimHit pays a hit exactly once.
 * - Live updates: open games hold an SSE stream (realtime/jackpotStream) instead of polling.
 *   Balance changes are coalesced into at most one push per BROADCAST_MS to every pool game.
 *
 * Settings, balances and hits live in MongoDB; the cache and the wager window below are
 * in-memory, which is fine for this single-instance server.
 */

export const LOCK_BEFORE_MS = 2 * 60_000;
const TICK_MS = 15_000;
const BROADCAST_MS = 1_000;
const WAGER_WINDOW_MS = 60 * 60_000;
/** Before an hour of wagers has been seen, the wager rate is averaged over at least this long. */
const MIN_WAGER_SAMPLE_MS = 5 * 60_000;
/** A due hit waits until its tier has at least this much to pay. */
const MIN_PAYOUT = 0.01;

type ActiveHit = Pick<IJackpotHit, "tier" | "amount" | "scheduledAt" | "status" | "winnerMode" | "paymentFailed"> & {
  id: string;
  userId: string | null;
};

let state: IJackpotState | null = null;
let activeHits: ActiveHit[] = [];
const wagers: { at: number; bet: number }[] = [];
const startedAt = Date.now();

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
const floor2 = (n: number) => Math.floor(n * 100 + 1e-6) / 100;
const zeroTiers = (): JackpotTierValues => ({ jackpot: 0, mega: 0, major: 0, mini: 0 });

function toActiveHit(hit: IJackpotHit): ActiveHit {
  return {
    id: String(hit._id),
    tier: hit.tier,
    amount: hit.amount,
    scheduledAt: hit.scheduledAt,
    status: hit.status,
    winnerMode: hit.winnerMode,
    paymentFailed: !!hit.paymentFailed,
    userId: hit.userId ? String(hit.userId) : null,
  };
}

export async function loadJackpotState(): Promise<IJackpotState> {
  const loaded = await JackpotState.findOneAndUpdate(
    { key: JACKPOT_STATE_KEY },
    { $setOnInsert: { key: JACKPOT_STATE_KEY } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  // With upsert + new, this always returns the document.
  state = loaded!;
  return state;
}

export async function refreshActiveHits(): Promise<void> {
  const hits = await JackpotHit.find({ status: { $in: ["scheduled", "locked"] } }).sort({ scheduledAt: 1 });
  activeHits = hits.map(toActiveHit);
}

export function getCachedState(): IJackpotState | null {
  return state;
}

function allTiersFull(s: IJackpotState): boolean {
  return JACKPOT_TIERS.every((t) => needFor(t, s) <= 0);
}

/** Share of every pool-game bet going into the pool right now — 0 while every tier is at its max,
 * so pool games then pay their full RTP. */
export function getCurrentContributionPercent(): number {
  const s = state;
  if (!s || allTiersFull(s)) return 0;
  return s.baseContributionPercent;
}

export function isPoolGame(gameId: string): boolean {
  return !!state && state.poolGames.includes(gameId);
}

// --- Who's playing ---------------------------------------------------------------------------

/** Players with a pool game open right now (one entry per player, even with several tabs). */
export function listPoolPlayers(): { userId: string; gameId: string; canDeliver: boolean }[] {
  const byUser = new Map<string, { userId: string; gameId: string; canDeliver: boolean }>();
  for (const c of listStreamClients()) {
    if (!isPoolGame(c.gameId)) continue;
    const existing = byUser.get(c.userId);
    // Prefer the connection that can deliver, so a player isn't skipped for an extra tab.
    if (!existing || (!existing.canDeliver && c.canDeliver)) {
      byUser.set(c.userId, { userId: c.userId, gameId: c.gameId, canDeliver: c.canDeliver });
    }
  }
  return Array.from(byUser.values());
}

/** Random winners only come from games that can actually deliver the jackpot — otherwise the
 * hit would lock to someone sitting in a game that can't pay it. */
function pickRandomPoolPlayer(): string | null {
  const players = listPoolPlayers().filter((p) => p.canDeliver);
  if (players.length === 0) return null;
  return players[secureRandomInt(players.length)].userId;
}

// --- Funding ---------------------------------------------------------------------------------

/** How much more a tier can take before it reaches its max. */
function needFor(tier: JackpotTierKey, s: IJackpotState): number {
  return Math.max(0, s.amounts[tier] - s.balances[tier]);
}

function activeHitFor(tier: JackpotTierKey): ActiveHit | undefined {
  return activeHits.find((h) => h.tier === tier);
}

/** Splits a contribution equally between the tiers that still have room, without pushing any
 * tier past its max: a tier that fills up passes the rest of its share on to the others.
 * Whatever no tier has room for is dropped (only on the bet that fills the last tier). */
function splitContribution(total: number, s: IJackpotState): JackpotTierValues {
  const split = zeroTiers();
  const room = (t: JackpotTierKey) => Math.max(0, needFor(t, s) - split[t]);
  let remaining = total;

  // Each pass either places everything left or fills at least one more tier, so 4 passes do it.
  for (let pass = 0; pass < JACKPOT_TIERS.length && remaining > 1e-6; pass++) {
    const open = JACKPOT_TIERS.filter((t) => room(t) > 0);
    if (open.length === 0) break;
    const share = remaining / open.length;
    for (const tier of open) {
      const add = Math.min(room(tier), share);
      split[tier] += add;
      remaining -= add;
    }
  }

  for (const tier of JACKPOT_TIERS) split[tier] = round4(split[tier]);
  return split;
}

/** Called for every recorded spin (see SpinHistory's post-save hook). Never throws — a pool
 * update failing must not fail the spin log itself. */
export function recordPoolBet(gameId: string, betAmount: number): void {
  const s = state;
  if (!s || !s.poolGames.includes(gameId) || !(betAmount > 0)) return;

  wagers.push({ at: Date.now(), bet: betAmount });
  const total = round4((betAmount * getCurrentContributionPercent()) / 100);
  if (total <= 0) return;

  const split = splitContribution(total, s);
  const inc: Record<string, number> = {};
  for (const tier of JACKPOT_TIERS) {
    if (split[tier] <= 0) continue;
    inc[`balances.${tier}`] = split[tier];
    // Applied to the cache right away so the next spin's split already sees it.
    s.balances[tier] = round4(s.balances[tier] + split[tier]);
  }
  if (Object.keys(inc).length === 0) return;
  JackpotState.updateOne({ key: JACKPOT_STATE_KEY }, { $inc: inc })
    .then(() => {
      // A tier that just reached its max hits right away in Auto mode.
      if (JACKPOT_TIERS.some((t) => split[t] > 0 && needFor(t, s) <= 0)) return startAutoHits();
    })
    .catch((err) => console.error("[jackpot] failed to add contribution", err));
  scheduleBroadcast();
}

/** Average amount bet per minute on pool games over the last hour. */
export function wagerPerMinute(): number {
  const now = Date.now();
  while (wagers.length > 0 && now - wagers[0].at > WAGER_WINDOW_MS) wagers.shift();
  const total = wagers.reduce((sum, w) => sum + w.bet, 0);
  const windowMs = Math.min(WAGER_WINDOW_MS, Math.max(MIN_WAGER_SAMPLE_MS, now - startedAt));
  return total / (windowMs / 60_000);
}

/** Estimated minutes until a tier reaches its max at the current rate, or null if nothing is
 * coming in. 0 when already full. With the equal split, tiers fill smallest-need first, and each
 * one that fills speeds up the rest. */
export function estimateMinutesToFull(tier: JackpotTierKey): number | null {
  const s = state;
  if (!s) return null;
  const target = needFor(tier, s);
  if (target <= 0) return 0;
  const perMinute = (wagerPerMinute() * getCurrentContributionPercent()) / 100;
  if (perMinute <= 0) return null;

  // Walk through the fill-ups in order: until the next tier fills, every open tier gains
  // perMinute / open per minute.
  const needs = JACKPOT_TIERS.map((t) => needFor(t, s)).filter((n) => n > 0).sort((a, b) => a - b);
  let minutes = 0;
  let filled = 0;
  for (let i = 0; i < needs.length; i++) {
    const open = needs.length - i;
    const step = Math.min(needs[i], target) - filled;
    minutes += (step * open) / perMinute;
    filled += step;
    if (needs[i] >= target) break;
  }
  return minutes;
}

// --- Live stream -----------------------------------------------------------------------------

/** What an open game shows: the four tiers' collected amounts (and maxes) and the contribution
 * % its base game must give up. */
function poolSnapshot(): {
  inPool: true;
  tiers: { key: JackpotTierKey; label: string; amount: number; max: number }[];
  contributionPercent: number;
} | null {
  const s = state;
  if (!s) return null;
  return {
    inPool: true,
    tiers: JACKPOT_TIERS.map((key) => ({
      key,
      label: JACKPOT_TIER_LABELS[key],
      amount: floor2(s.balances[key]),
      max: s.amounts[key],
    })),
    contributionPercent: getCurrentContributionPercent(),
  };
}

const NOT_IN_POOL = { inPool: false, tiers: [], contributionPercent: 0 };

let broadcastTimer: NodeJS.Timeout | null = null;

/** Coalesces balance changes: however many spins land in a second, pool games get one push. */
function scheduleBroadcast(): void {
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    broadcastState(false);
  }, BROADCAST_MS);
  broadcastTimer.unref();
}

/** Pushes the current snapshot to every pool game (serialised once). With `everyone`, games
 * outside the pool are told too — needed when the admin changes which games are in it. */
function broadcastState(everyone: boolean): void {
  const snap = poolSnapshot();
  if (!snap) return;
  const poolFrame = sseFrame("state", snap);
  const offFrame = everyone ? sseFrame("state", NOT_IN_POOL) : null;
  for (const c of listStreamClients()) {
    if (isPoolGame(c.gameId)) sendFrame(c, poolFrame);
    else if (offFrame) sendFrame(c, offFrame);
  }
}

/** A hit that's ready for this player right now: locked to them, due, not waiting on an admin
 * retry after a failed payout, and with something collected to pay. */
export function findDeliverableHit(userId: string, gameId: string): ActiveHit | null {
  const s = state;
  if (!s || !isPoolGame(gameId)) return null;
  const now = Date.now();
  return (
    activeHits.find(
      (h) =>
        h.status === "locked" &&
        h.userId === userId &&
        !h.paymentFailed &&
        h.scheduledAt.getTime() <= now &&
        floor2(s.balances[h.tier]) >= MIN_PAYOUT
    ) ?? null
  );
}

function sendPendingTo(client: StreamClient): void {
  if (!client.canDeliver) return;
  const hit = findDeliverableHit(client.userId, client.gameId);
  if (!hit || !state) return;
  sendFrame(
    client,
    sseFrame("pending", {
      hitId: hit.id,
      tier: hit.tier,
      label: JACKPOT_TIER_LABELS[hit.tier],
      amount: floor2(state.balances[hit.tier]),
    })
  );
}

/** Tells every winner who has a delivering game open that their hit is ready. Only winners get a
 * frame — everyone else gets nothing. */
function pushPendingHits(): void {
  const winners = new Set(activeHits.filter((h) => h.status === "locked" && h.userId).map((h) => h.userId));
  if (winners.size === 0) return;
  for (const c of listStreamClients()) {
    if (winners.has(c.userId)) sendPendingTo(c);
  }
}

/** First frames for a game that just opened its stream. */
export function onStreamOpened(client: StreamClient): void {
  sendFrame(client, sseFrame("state", isPoolGame(client.gameId) ? poolSnapshot() : NOT_IN_POOL));
  sendPendingTo(client);
}

// --- Auto mode -----------------------------------------------------------------------------

const autoStarting = new Set<JackpotTierKey>();

/** Starts an Auto hit for every Auto tier that's full and has no hit going: created already
 * locked to the admin's pick (which is then cleared, so the next round is random) or to a random
 * player playing a pool game — or to nobody yet, in which case the first one to show up gets it
 * (see tick). */
async function startAutoHits(): Promise<void> {
  const s = state;
  if (!s) return;
  let started = false;
  for (const tier of JACKPOT_TIERS) {
    const auto = s.auto?.[tier];
    if (!auto?.enabled || needFor(tier, s) > 0 || activeHitFor(tier) || autoStarting.has(tier)) continue;
    autoStarting.add(tier);
    try {
      if (await JackpotHit.exists({ tier, status: { $in: ["scheduled", "locked"] } })) continue;
      const picked = auto.userId ? String(auto.userId) : null;
      const now = new Date();
      await JackpotHit.create({
        tier,
        amount: s.amounts[tier],
        scheduledAt: now,
        lockedAt: now,
        status: "locked",
        trigger: "auto",
        winnerMode: picked ? "player" : "random",
        userId: picked ?? pickRandomPoolPlayer(),
      });
      if (picked) {
        auto.userId = null;
        await JackpotState.updateOne({ key: JACKPOT_STATE_KEY }, { $set: { [`auto.${tier}.userId`]: null } });
      }
      started = true;
    } finally {
      autoStarting.delete(tier);
    }
  }
  if (started) {
    await refreshActiveHits();
    pushPendingHits();
  }
}

// --- Scheduler -------------------------------------------------------------------------------

async function tick(): Promise<void> {
  await loadJackpotState();
  const now = Date.now();

  const toLock = await JackpotHit.find({ status: "scheduled", scheduledAt: { $lte: new Date(now + LOCK_BEFORE_MS) } });
  for (const hit of toLock) {
    const update: Record<string, unknown> = { status: "locked", lockedAt: new Date() };
    if (hit.winnerMode === "random") update.userId = pickRandomPoolPlayer();
    await JackpotHit.updateOne({ _id: hit._id, status: "scheduled" }, { $set: update });
  }

  // Random hits that locked while nobody was playing take the first player to show up.
  const waiting = await JackpotHit.find({ status: "locked", winnerMode: "random", userId: null });
  for (const hit of waiting) {
    const pick = pickRandomPoolPlayer();
    if (!pick) break;
    await JackpotHit.updateOne({ _id: hit._id, userId: null }, { $set: { userId: new Types.ObjectId(pick) } });
  }

  await refreshActiveHits();
  await startAutoHits();
  pushPendingHits();
}

export function startJackpotScheduler(): void {
  const run = () =>
    tick().catch((err) => {
      console.error("[jackpot] scheduler tick failed", err);
    });
  void run();
  setInterval(run, TICK_MS).unref();
}

// --- Delivery --------------------------------------------------------------------------------

export type ClaimResult = { ok: true; hit: IJackpotHit } | { ok: false; reason: string };

/** Records a rejected payout try on the hit and stops offering it until an admin retries. */
async function recordFailedPayout(hitId: string, gameId: string, reason: string): Promise<void> {
  await JackpotHit.updateOne(
    { _id: hitId, status: "locked" },
    {
      $set: { paymentFailed: true },
      $push: { attempts: { at: new Date(), gameId, ok: false, amount: null, reason } },
    }
  );
  const cached = activeHits.find((h) => h.id === hitId);
  if (cached) cached.paymentFailed = true;
}

/** Pays a hit exactly once, with whatever its tier has collected at that moment: takes the tier's
 * exact balance out only if the tier still holds it, then marks the hit paid (recording the
 * amount, rounded to cents) only if it's still locked to this player — undoing the debit if that
 * second step loses a race. Every try on a real hit lands in its payout report; a rejected one
 * marks it failed so it waits for an admin retry. The tier's balance is only ever taken on
 * success, so it never restarts from 0 until the winner is paid. */
export async function claimHit(userId: string, hitId: string, gameId: string): Promise<ClaimResult> {
  if (!Types.ObjectId.isValid(hitId)) return { ok: false, reason: "Unknown jackpot" };
  const hit = await JackpotHit.findOne({
    _id: hitId,
    userId,
    status: "locked",
    paymentFailed: { $ne: true },
    scheduledAt: { $lte: new Date() },
  });
  // Not this player's hit to claim (or already paid / waiting on a retry) — nothing to record.
  if (!hit) return { ok: false, reason: "This jackpot is not available to claim" };

  const fail = async (reason: string): Promise<ClaimResult> => {
    await recordFailedPayout(hitId, gameId, reason);
    return { ok: false, reason };
  };

  if (!isPoolGame(gameId)) return fail(`${gameId} is no longer in the jackpot pool`);

  // Read from the DB, not the cache: the cache can be a contribution or two ahead of it. The exact
  // stored value is what gets debited — rounding it first could ask for a fraction of a cent more
  // than the tier holds (e.g. 25.499999999999996 → 25.50) and the debit would never match.
  const current = await JackpotState.findOne({ key: JACKPOT_STATE_KEY }).select("balances").lean();
  const raw = current?.balances?.[hit.tier] ?? 0;
  const amount = Math.round(raw * 100) / 100;
  if (amount < MIN_PAYOUT) return fail("The tier has nothing collected to pay");

  const balanceField = `balances.${hit.tier}`;
  const debited = await JackpotState.updateOne(
    { key: JACKPOT_STATE_KEY, [balanceField]: { $gte: raw } },
    { $inc: { [balanceField]: -raw } }
  );
  if (debited.modifiedCount === 0) return fail("The tier balance changed while paying — retry");

  const paid = await JackpotHit.findOneAndUpdate(
    { _id: hit._id, userId, status: "locked" },
    {
      $set: { status: "paid", paidAt: new Date(), gameId, amount },
      $push: { attempts: { at: new Date(), gameId, ok: true, amount, reason: null } },
    },
    { new: true }
  );
  if (!paid) {
    await JackpotState.updateOne({ key: JACKPOT_STATE_KEY }, { $inc: { [balanceField]: raw } });
    return fail("The hit changed while paying — retry");
  }

  // The game shows the win right away; this keeps the player's stored balance (read on every page
  // load / refresh) in step with it.
  await creditBalance(userId, amount);

  if (state) state.balances[hit.tier] = round4(Math.max(0, state.balances[hit.tier] - raw));
  activeHits = activeHits.filter((h) => h.id !== hitId);
  scheduleBroadcast();
  return { ok: true, hit: paid };
}

/** Applies an admin change right away instead of waiting for the next tick, and tells every open
 * game (pool membership or maxes may have changed). */
export async function onJackpotAdminChange(): Promise<void> {
  await loadJackpotState();
  await refreshActiveHits();
  await startAutoHits();
  broadcastState(true);
  pushPendingHits();
}
