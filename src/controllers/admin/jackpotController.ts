import { Request, Response } from "express";
import { Types } from "mongoose";
import { JackpotState, JACKPOT_STATE_KEY, JACKPOT_TIERS, JACKPOT_TIER_LABELS, JackpotTierKey } from "../../models/JackpotState";
import { JackpotHit } from "../../models/JackpotHit";
import { User } from "../../models/User";
import {
  LOCK_BEFORE_MS,
  estimateMinutesToFull,
  getCurrentContributionPercent,
  listPoolPlayers,
  loadJackpotState,
  onJackpotAdminChange,
  wagerPerMinute,
} from "../../services/jackpot";

/** Fish Game isn't a spin-based game, so it can't take part in the pool. */
const EXCLUDED_POOL_GAMES = new Set(["fish-game"]);
const VALID_TIERS = new Set<string>(JACKPOT_TIERS);

async function usernamesById(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id && Types.ObjectId.isValid(id)))];
  if (unique.length === 0) return new Map();
  const users = await User.find({ _id: { $in: unique } }).select("username").lean();
  return new Map(users.map((u) => [String(u._id), u.username]));
}

async function isPlayableUser(userId: unknown): Promise<boolean> {
  if (typeof userId !== "string" || !Types.ObjectId.isValid(userId)) return false;
  const user = await User.findById(userId).select("disabled deletedAt").lean();
  return !!user && !user.disabled && !user.deletedAt;
}

function parseFutureDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.getTime() - Date.now() > LOCK_BEFORE_MS ? date : null;
}

const TOO_SOON_ERROR = "scheduledAt must be a valid date more than 2 minutes in the future";

export async function getJackpotOverview(_req: Request, res: Response): Promise<void> {
  const state = await loadJackpotState();
  const hits = await JackpotHit.find({ status: { $in: ["scheduled", "locked"] } }).sort({ scheduledAt: 1 }).lean();
  const poolPlayers = listPoolPlayers();
  const autoUserId = (key: JackpotTierKey) => (state.auto?.[key]?.userId ? String(state.auto[key].userId) : null);
  const names = await usernamesById([
    ...hits.map((h) => (h.userId ? String(h.userId) : null)),
    ...poolPlayers.map((p) => p.userId),
    ...JACKPOT_TIERS.map(autoUserId),
  ]);

  res.json({
    settings: {
      amounts: state.amounts,
      baseContributionPercent: state.baseContributionPercent,
      poolGames: state.poolGames,
    },
    contributionPercent: getCurrentContributionPercent(),
    wagerPerMinute: wagerPerMinute(),
    tiers: JACKPOT_TIERS.map((key) => {
      const hit = hits.find((h) => h.tier === key);
      const userId = hit?.userId ? String(hit.userId) : null;
      const autoUser = autoUserId(key);
      return {
        key,
        label: JACKPOT_TIER_LABELS[key],
        auto: {
          enabled: !!state.auto?.[key]?.enabled,
          userId: autoUser,
          username: autoUser ? (names.get(autoUser) ?? null) : null,
        },
        amount: state.amounts[key],
        balance: state.balances[key],
        fillPercent: state.amounts[key] > 0 ? Math.min(100, (state.balances[key] / state.amounts[key]) * 100) : 100,
        minutesToFull: estimateMinutesToFull(key),
        hit: hit
          ? {
              _id: String(hit._id),
              amount: hit.amount,
              scheduledAt: hit.scheduledAt,
              status: hit.status,
              trigger: hit.trigger ?? "date",
              paymentFailed: !!hit.paymentFailed,
              lastError: hit.attempts?.filter((a) => !a.ok).slice(-1)[0]?.reason ?? null,
              winnerMode: hit.winnerMode,
              userId,
              username: userId ? (names.get(userId) ?? null) : null,
            }
          : null,
      };
    }),
    poolPlayers: poolPlayers.map((p) => ({ ...p, username: names.get(p.userId) ?? p.userId })),
  });
}

export async function updateJackpotSettings(req: Request, res: Response): Promise<void> {
  const { amounts, baseContributionPercent, poolGames } = req.body ?? {};

  if (!amounts || typeof amounts !== "object" || !JACKPOT_TIERS.every((t) => Number.isFinite(amounts[t]) && amounts[t] > 0)) {
    res.status(400).json({ error: "Every tier needs a positive max" });
    return;
  }
  if (!Number.isFinite(baseContributionPercent) || baseContributionPercent < 0 || baseContributionPercent > 50) {
    res.status(400).json({ error: "baseContributionPercent must be between 0 and 50" });
    return;
  }
  if (!Array.isArray(poolGames) || !poolGames.every((g) => typeof g === "string")) {
    res.status(400).json({ error: "poolGames must be an array of game slugs" });
    return;
  }

  const cleanAmounts = Object.fromEntries(JACKPOT_TIERS.map((t) => [t, Math.round(amounts[t] * 100) / 100]));
  await JackpotState.updateOne(
    { key: JACKPOT_STATE_KEY },
    {
      $set: {
        amounts: cleanAmounts,
        baseContributionPercent,
        poolGames: [...new Set(poolGames as string[])].filter((g) => !EXCLUDED_POOL_GAMES.has(g)),
      },
    },
    { upsert: true }
  );

  // Hits not yet locked follow the new prize amounts; locked hits keep the amount they locked at.
  await Promise.all(
    JACKPOT_TIERS.map((tier) =>
      JackpotHit.updateMany({ tier, status: "scheduled" }, { $set: { amount: cleanAmounts[tier] } })
    )
  );

  await onJackpotAdminChange();
  res.json({ ok: true });
}

export async function createJackpotHit(req: Request, res: Response): Promise<void> {
  const { tier, scheduledAt, winnerMode, userId } = req.body ?? {};

  if (typeof tier !== "string" || !VALID_TIERS.has(tier)) {
    res.status(400).json({ error: "tier must be one of jackpot, mega, major, mini" });
    return;
  }
  const date = parseFutureDate(scheduledAt);
  if (!date) {
    res.status(400).json({ error: TOO_SOON_ERROR });
    return;
  }
  if (winnerMode !== "random" && winnerMode !== "player") {
    res.status(400).json({ error: "winnerMode must be random or player" });
    return;
  }
  if (winnerMode === "player" && !(await isPlayableUser(userId))) {
    res.status(400).json({ error: "Select an active player as the winner" });
    return;
  }

  const state = await loadJackpotState();
  if (state.auto?.[tier as JackpotTierKey]?.enabled) {
    res.status(409).json({ error: "Auto is on for this tier — turn it off to schedule a date" });
    return;
  }

  const existing = await JackpotHit.exists({ tier, status: { $in: ["scheduled", "locked"] } });
  if (existing) {
    res.status(409).json({ error: `The current ${JACKPOT_TIER_LABELS[tier as JackpotTierKey]} hit must be won before scheduling the next one` });
    return;
  }

  const hit = await JackpotHit.create({
    tier,
    amount: state.amounts[tier as JackpotTierKey],
    scheduledAt: date,
    winnerMode,
    userId: winnerMode === "player" ? userId : null,
    status: "scheduled",
    trigger: "date",
    createdBy: req.userId,
  });

  await onJackpotAdminChange();
  res.status(201).json({ hit });
}

/** Edits the time and/or winner of a hit — only while it's still more than 2 minutes away. */
export async function updateJackpotHit(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { scheduledAt, winnerMode, userId } = req.body ?? {};
  const set: Record<string, unknown> = {};

  if (scheduledAt !== undefined) {
    const date = parseFutureDate(scheduledAt);
    if (!date) {
      res.status(400).json({ error: TOO_SOON_ERROR });
      return;
    }
    set.scheduledAt = date;
  }
  if (winnerMode !== undefined) {
    if (winnerMode !== "random" && winnerMode !== "player") {
      res.status(400).json({ error: "winnerMode must be random or player" });
      return;
    }
    if (winnerMode === "player" && !(await isPlayableUser(userId))) {
      res.status(400).json({ error: "Select an active player as the winner" });
      return;
    }
    set.winnerMode = winnerMode;
    set.userId = winnerMode === "player" ? userId : null;
  }

  const hit = await JackpotHit.findOneAndUpdate(
    { _id: id, status: "scheduled", scheduledAt: { $gt: new Date(Date.now() + LOCK_BEFORE_MS) } },
    { $set: set },
    { new: true }
  );
  if (!hit) {
    res.status(409).json({ error: "This hit is locked or no longer scheduled and can't be changed" });
    return;
  }

  await onJackpotAdminChange();
  res.json({ hit });
}

export async function cancelJackpotHit(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const hit = await JackpotHit.findOneAndUpdate(
    { _id: id, status: "scheduled", scheduledAt: { $gt: new Date(Date.now() + LOCK_BEFORE_MS) } },
    { $set: { status: "cancelled" } },
    { new: true }
  );
  if (!hit) {
    res.status(409).json({ error: "This hit is locked or no longer scheduled and can't be cancelled" });
    return;
  }

  await onJackpotAdminChange();
  res.json({ hit });
}

/** Turns Auto mode on/off for a tier and sets the next round's winner (null = random). Turning
 * it on cancels a date hit that hasn't locked yet; a locked one still finishes first. The winner
 * can't be changed while a round is locked — that round's winner is final. */
export async function updateJackpotAuto(req: Request, res: Response): Promise<void> {
  const { tier } = req.params;
  const { enabled, userId } = req.body ?? {};

  if (!VALID_TIERS.has(tier)) {
    res.status(400).json({ error: "tier must be one of jackpot, mega, major, mini" });
    return;
  }
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "enabled must be true or false" });
    return;
  }
  if (userId !== null && userId !== undefined && !(await isPlayableUser(userId))) {
    res.status(400).json({ error: "Select an active player as the winner" });
    return;
  }

  const state = await loadJackpotState();
  const currentUser = state.auto?.[tier as JackpotTierKey]?.userId;
  const nextUser = userId ?? null;
  if (String(currentUser ?? "") !== String(nextUser ?? "")) {
    const locked = await JackpotHit.exists({ tier, status: "locked" });
    if (locked) {
      res.status(409).json({ error: "This round's winner is locked and can't be changed" });
      return;
    }
  }

  await JackpotState.updateOne(
    { key: JACKPOT_STATE_KEY },
    { $set: { [`auto.${tier}`]: { enabled, userId: enabled ? nextUser : null } } }
  );
  if (enabled) {
    await JackpotHit.updateMany({ tier, status: "scheduled" }, { $set: { status: "cancelled" } });
  }

  await onJackpotAdminChange();
  res.json({ ok: true });
}

/** Puts a hit whose payout failed back in line: the winner's next spin in a delivering pool game
 * forces the bonus again and pays at the end, as the first time. */
export async function retryJackpotHit(req: Request, res: Response): Promise<void> {
  const hit = await JackpotHit.findOneAndUpdate(
    { _id: req.params.id, status: "locked", paymentFailed: true },
    { $set: { paymentFailed: false } },
    { new: true }
  );
  if (!hit) {
    res.status(409).json({ error: "Only a failed payout can be retried" });
    return;
  }
  await onJackpotAdminChange();
  res.json({ hit });
}

/** The payout report: every paid hit plus every locked hit that has had a payout try, newest
 * first, with the outcome and every try. */
export async function listJackpotHistory(_req: Request, res: Response): Promise<void> {
  const hits = await JackpotHit.find({
    $or: [{ status: "paid" }, { status: "locked", "attempts.0": { $exists: true } }],
  })
    .sort({ updatedAt: -1 })
    .limit(100)
    .lean();
  const names = await usernamesById(hits.map((h) => (h.userId ? String(h.userId) : null)));
  res.json({
    history: hits.map((h) => ({
      _id: String(h._id),
      tier: h.tier,
      label: JACKPOT_TIER_LABELS[h.tier],
      amount: h.amount,
      winnerMode: h.winnerMode,
      trigger: h.trigger ?? "date",
      userId: h.userId ? String(h.userId) : null,
      username: h.userId ? (names.get(String(h.userId)) ?? null) : null,
      gameId: h.gameId ?? h.attempts?.slice(-1)[0]?.gameId ?? null,
      scheduledAt: h.scheduledAt,
      paidAt: h.paidAt,
      result: h.status === "paid" ? "paid" : h.paymentFailed ? "failed" : "retrying",
      attempts: (h.attempts ?? []).map((a) => ({ at: a.at, gameId: a.gameId, ok: a.ok, amount: a.amount, reason: a.reason })),
    })),
  });
}
