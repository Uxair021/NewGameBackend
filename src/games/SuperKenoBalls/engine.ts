import { secureRandomInt } from "../../utils/rng";
import { BONUS_MULTIPLIER, DRAWN_COUNT, MAX_PICKS, MIN_PICKS, PAYTABLE, POOL_SIZE } from "./config";
import { getWinTier, WinTierName } from "./winTiers";

export interface SuperKenoResult {
  picks: number[];
  drawn: number[];
  matched: number[];
  bonusBall: number;
  bonusHit: boolean;
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
 * Runs one authoritative draw, flags the bonus ball (the last number drawn), and applies
 * `rtpMultiplier` (the admin-configurable per-game payout scale, see services/gameSettings.ts)
 * to the base multiplier before the bonus-ball 4x is layered on and winAmount is computed, so
 * the number shown/persisted always matches winAmount / betAmount exactly.
 */
export function playSuperKeno(picks: number[], betAmount: number, rtpMultiplier: number): SuperKenoResult {
  const drawn = drawNumbers();
  const drawnSet = new Set(drawn);
  const matched = picks.filter((p) => drawnSet.has(p));

  const bonusBall = drawn[drawn.length - 1];
  const bonusHit = matched.includes(bonusBall);
  const baseMultiplier = (PAYTABLE[picks.length]?.[matched.length] ?? 0) * rtpMultiplier;
  const multiplier = bonusHit ? baseMultiplier * BONUS_MULTIPLIER : baseMultiplier;
  const winAmount = Math.round(multiplier * betAmount * 100) / 100;

  return {
    picks,
    drawn,
    matched,
    bonusBall,
    bonusHit,
    multiplier,
    winAmount,
    tier: winAmount > 0 ? getWinTier(winAmount) : null,
  };
}
