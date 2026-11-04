import { Request, Response } from "express";
import {
  getPaytableConfig,
  validatePaytableConfig,
  savePaytableConfig,
  computeVegasHitsStats,
  PaytableConfigDTO,
} from "../../services/paytableConfig";
import { TierKey, TierRow, TIER_KEYS } from "../../models/PaytableConfig";
import { vegasHitsMeta } from "../../games/VegasHits/meta";

/** Vegas Hits has no dedicated "loss" tier (every row is a real, always-drawn reel symbol), so
 * loss% is a computed simulation stat rather than a tier's own frequencyPercent — see
 * computeVegasHitsStats. */
function computedLossPercent(gameId: string, config: PaytableConfigDTO): number | undefined {
  if (gameId === vegasHitsMeta.id) return computeVegasHitsStats(config).lossPercent;
  return undefined;
}

const VALID_TIER_KEYS: TierKey[] = TIER_KEYS;

export async function getPaytable(req: Request, res: Response): Promise<void> {
  const { gameId } = req.params;
  const config = await getPaytableConfig(gameId);
  const validation = validatePaytableConfig(config);
  const lossPercent = computedLossPercent(gameId, config);
  res.json({ config, computedRtpPercent: validation.computedRtpPercent, valid: validation.valid, lossPercent });
}

const VALID_CELEBRATIONS = ["BIG WIN", "MEGA WIN", "JACKPOT"];

/** `undefined`/absent body.celebrationMap means "keep it null" (feature unused); a present
 * value must be a plain object mapping known tier keys to one of the 3 celebrations or null. */
function parseCelebrationMap(body: unknown): Record<string, string | null> | null | undefined {
  if (body === null || body === undefined) return null;
  if (typeof body !== "object" || Array.isArray(body)) return undefined;
  const entries = Object.entries(body as Record<string, unknown>);
  const result: Record<string, string | null> = {};
  for (const [key, value] of entries) {
    if (!VALID_TIER_KEYS.includes(key as TierKey)) return undefined;
    if (value !== null && !VALID_CELEBRATIONS.includes(value as string)) return undefined;
    result[key] = value as string | null;
  }
  return result;
}

function parseTierRows(body: unknown): TierRow[] | null {
  if (!Array.isArray(body)) return null;
  const rows: TierRow[] = [];
  for (const row of body) {
    if (typeof row !== "object" || row === null) return null;
    const r = row as Record<string, unknown>;
    if (typeof r.key !== "string" || !VALID_TIER_KEYS.includes(r.key as TierKey)) return null;
    if (typeof r.frequencyPercent !== "number" || !Number.isFinite(r.frequencyPercent)) return null;
    const payoutMultiplier = r.payoutMultiplier === null ? null : Number(r.payoutMultiplier);
    if (payoutMultiplier !== null && !Number.isFinite(payoutMultiplier)) return null;
    const freeSpinPayoutMultiplier = r.freeSpinPayoutMultiplier === null ? null : Number(r.freeSpinPayoutMultiplier);
    if (freeSpinPayoutMultiplier !== null && !Number.isFinite(freeSpinPayoutMultiplier)) return null;
    rows.push({
      key: r.key as TierKey,
      frequencyPercent: r.frequencyPercent,
      payoutMultiplier,
      freeSpinPayoutMultiplier,
    });
  }
  return rows;
}

export async function updatePaytable(req: Request, res: Response): Promise<void> {
  const { gameId } = req.params;
  const body = req.body ?? {};

  const targetRtpPercent = Number(body.targetRtpPercent);
  if (!Number.isFinite(targetRtpPercent) || targetRtpPercent < 0) {
    res.status(400).json({ error: "targetRtpPercent must be a non-negative number" });
    return;
  }

  const targetLossPercent =
    body.targetLossPercent === null || body.targetLossPercent === undefined ? null : Number(body.targetLossPercent);
  if (targetLossPercent !== null && (!Number.isFinite(targetLossPercent) || targetLossPercent < 0 || targetLossPercent > 100)) {
    res.status(400).json({ error: "targetLossPercent must be a number between 0 and 100, or null" });
    return;
  }

  const tiers = parseTierRows(body.tiers);
  if (!tiers || tiers.length === 0) {
    res.status(400).json({ error: "tiers must be a non-empty array of valid tier rows" });
    return;
  }

  const freeSpinsGranted =
    body.freeSpinsGranted === null || body.freeSpinsGranted === undefined ? null : Number(body.freeSpinsGranted);
  if (freeSpinsGranted !== null && !Number.isFinite(freeSpinsGranted)) {
    res.status(400).json({ error: "freeSpinsGranted must be a number or null" });
    return;
  }

  const celebrationMap = parseCelebrationMap(body.celebrationMap);
  if (celebrationMap === undefined) {
    res.status(400).json({ error: "celebrationMap must map known tier keys to \"BIG WIN\"/\"MEGA WIN\"/\"JACKPOT\"/null" });
    return;
  }

  let specialReelTiers: TierRow[] | null = null;
  if (body.specialReelTiers !== null && body.specialReelTiers !== undefined) {
    specialReelTiers = parseTierRows(body.specialReelTiers);
    if (!specialReelTiers || specialReelTiers.length === 0) {
      res.status(400).json({ error: "specialReelTiers must be a non-empty array of valid tier rows, or null" });
      return;
    }
  }

  let respinRange: { min: number; max: number } | null = null;
  if (body.respinRange !== null && body.respinRange !== undefined) {
    const min = Number(body.respinRange.min);
    const max = Number(body.respinRange.max);
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      res.status(400).json({ error: "respinRange must be { min, max } numbers, or null" });
      return;
    }
    respinRange = { min, max };
  }

  let reelStateConfig: { centerRowChancePercent: number } | null = null;
  if (body.reelStateConfig !== null && body.reelStateConfig !== undefined) {
    const centerRowChancePercent = Number(body.reelStateConfig.centerRowChancePercent);
    if (!Number.isFinite(centerRowChancePercent)) {
      res.status(400).json({ error: "reelStateConfig must be { centerRowChancePercent } a number, or null" });
      return;
    }
    reelStateConfig = { centerRowChancePercent };
  }

  let wildRules: PaytableConfigDTO["wildRules"] = null;
  if (body.wildRules !== null && body.wildRules !== undefined) {
    const onePureBet = Number(body.wildRules.onePureBet);
    const twoPureBet = Number(body.wildRules.twoPureBet);
    const threePureBet = Number(body.wildRules.threePureBet);
    const oneCompleteMultiplier = Number(body.wildRules.oneCompleteMultiplier);
    const twoCompleteMultiplier = Number(body.wildRules.twoCompleteMultiplier);
    const anyMixBet = Number(body.wildRules.anyMixBet);
    if ([onePureBet, twoPureBet, threePureBet, oneCompleteMultiplier, twoCompleteMultiplier, anyMixBet].some((v) => !Number.isFinite(v))) {
      res.status(400).json({
        error: "wildRules must be { onePureBet, twoPureBet, threePureBet, oneCompleteMultiplier, twoCompleteMultiplier, anyMixBet } numbers, or null",
      });
      return;
    }
    wildRules = { onePureBet, twoPureBet, threePureBet, oneCompleteMultiplier, twoCompleteMultiplier, anyMixBet };
  }

  let symbolPayouts: PaytableConfigDTO["symbolPayouts"] = null;
  if (body.symbolPayouts !== null && body.symbolPayouts !== undefined) {
    if (typeof body.symbolPayouts !== "object" || Array.isArray(body.symbolPayouts)) {
      res.status(400).json({ error: "symbolPayouts must be an object of { x3, x4, x5 } per symbol, or null" });
      return;
    }
    const parsed: Record<string, { x3: number; x4: number; x5: number }> = {};
    for (const [symbol, row] of Object.entries(body.symbolPayouts as Record<string, unknown>)) {
      if (!VALID_TIER_KEYS.includes(symbol as TierKey) || typeof row !== "object" || row === null) {
        res.status(400).json({ error: `Invalid symbolPayouts entry for "${symbol}"` });
        return;
      }
      const r = row as Record<string, unknown>;
      const x3 = Number(r.x3);
      const x4 = Number(r.x4);
      const x5 = Number(r.x5);
      if (![x3, x4, x5].every(Number.isFinite)) {
        res.status(400).json({ error: `"${symbol}" symbolPayouts must be { x3, x4, x5 } numbers` });
        return;
      }
      parsed[symbol] = { x3, x4, x5 };
    }
    symbolPayouts = parsed;
  }

  let scatterRules: PaytableConfigDTO["scatterRules"] = null;
  if (body.scatterRules !== null && body.scatterRules !== undefined) {
    const chancePercent = Number(body.scatterRules.chancePercent);
    const x3 = Number(body.scatterRules.x3);
    const x4 = Number(body.scatterRules.x4);
    const x5 = Number(body.scatterRules.x5);
    const freeSpinsAwarded = Number(body.scatterRules.freeSpinsAwarded);
    if (![chancePercent, x3, x4, x5, freeSpinsAwarded].every(Number.isFinite)) {
      res.status(400).json({ error: "scatterRules must be { chancePercent, x3, x4, x5, freeSpinsAwarded } numbers, or null" });
      return;
    }
    scatterRules = { chancePercent, x3, x4, x5, freeSpinsAwarded };
  }

  const config: PaytableConfigDTO = {
    gameId,
    targetRtpPercent,
    targetLossPercent,
    freeSpinsGranted,
    tiers,
    ruleTierMap: body.ruleTierMap ?? null,
    celebrationMap,
    amountThresholds: body.amountThresholds ?? null,
    specialReelTiers,
    respinRange,
    reelStateConfig,
    wildRules,
    symbolPayouts,
    scatterRules,
  };

  const validation = validatePaytableConfig(config);
  if (!validation.valid) {
    res.status(400).json({ error: "Invalid paytable configuration", errors: validation.errors, computedRtpPercent: validation.computedRtpPercent });
    return;
  }

  const saved = await savePaytableConfig(config);
  const lossPercent = computedLossPercent(gameId, saved);
  res.json({ config: saved, computedRtpPercent: validation.computedRtpPercent, valid: true, lossPercent });
}
