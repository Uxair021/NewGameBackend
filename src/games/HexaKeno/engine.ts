import { secureRandomInt } from "../../utils/rng";
import { DRAWN_COUNT, MAX_PICKS, MIN_PICKS, PAYTABLE, POOL_SIZE } from "./config";
import { getWinTier, WinTierName } from "./winTiers";

export interface KenoResult {
  picks: number[];
  drawn: number[];
  matched: number[];
  multiplier: number;
  winAmount: number;
  tier: WinTierName | null;
}

/** Returns an error message if `picks` is malformed, otherwise null. */
export function validatePicks(picks: unknown): string | null {
  if (!Array.isArray(picks) || picks.length < MIN_PICKS || picks.length > MAX_PICKS) {
    return `Pick between ${MIN_PICKS} and ${MAX_PICKS} numbers`;
  }
  if (!picks.every((p) => Number.isInteger(p) && p >= 1 && p <= POOL_SIZE)) {
    return `Picks must be whole numbers between 1 and ${POOL_SIZE}`;
  }
  if (new Set(picks).size !== picks.length) {
    return "Picks must be unique";
  }
  return null;
}

/** Draws DRAWN_COUNT unique numbers from 1..POOL_SIZE via partial Fisher-Yates, using the
 * crypto-secure RNG (not Math.random) since this is what actually decides the payout. */
function drawNumbers(): number[] {
  const pool = Array.from({ length: POOL_SIZE }, (_, i) => i + 1);
  for (let i = 0; i < DRAWN_COUNT; i++) {
    const j = i + secureRandomInt(pool.length - i);
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, DRAWN_COUNT);
}

/**
 * Runs one authoritative draw and applies `rtpMultiplier` (the admin-configurable per-game
 * payout scale, see services/gameSettings.ts) to the credited multiplier before computing
 * winAmount, so the number shown/persisted always matches winAmount / betAmount exactly, even
 * when an admin has scaled payouts on this game.
 */
export function playKeno(picks: number[], betAmount: number, rtpMultiplier: number): KenoResult {
  const drawn = drawNumbers();
  const drawnSet = new Set(drawn);
  const matched = picks.filter((p) => drawnSet.has(p));
  const multiplier = (PAYTABLE[picks.length]?.[matched.length] ?? 0) * rtpMultiplier;
  const winAmount = Math.round(multiplier * betAmount * 100) / 100;

  return { picks, drawn, matched, multiplier, winAmount, tier: winAmount > 0 ? getWinTier(winAmount) : null };
}
