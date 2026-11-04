export const POOL_SIZE = 80;
export const DRAWN_COUNT = 20;
export const MIN_PICKS = 1;
export const MAX_PICKS = 10;

export const BET_LEVELS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 20, 25, 30];
export const MIN_BET = BET_LEVELS[0];
export const MAX_BET = BET_LEVELS[BET_LEVELS.length - 1];

/**
 * Multiplier of bet, indexed [picks][matches]. Each row (picks count) is its own independent
 * paytable, hand-tuned against the *exact* hypergeometric probability of landing each match
 * count (not simulated — Keno's odds are closed-form: P(k matches) =
 * C(picks,k)*C(80-picks,20-k)/C(80,20)) to land each row's expected value at ~95% RTP, same
 * target as every other game. Re-tune (recompute expected value per row) if any of these
 * numbers, or POOL_SIZE/DRAWN_COUNT, ever change.
 */
export const PAYTABLE: readonly (readonly number[])[] = [
  [], // index 0 unused (picks is 1-indexed in spirit; row 0 would mean "picked nothing")
  [0, 3.8],
  [0, 1, 16],
  [0, 1, 1.8, 51],
  [0, 1, 1.4, 6, 129],
  [1, 1, 1, 1.5, 2, 150],
  [0, 1, 1, 1.3, 5.2, 117, 2085],
  [0, 1, 1, 1.5, 2.2, 24, 437, 8736],
  [0, 1, 1, 1, 2.1, 12.8, 96, 1600, 12800],
  [0, 1, 1, 1, 2, 6, 53, 303, 3600, 14500],
  [0, 1, 1, 1, 2, 5, 15, 65, 300, 750, 2000],
];
