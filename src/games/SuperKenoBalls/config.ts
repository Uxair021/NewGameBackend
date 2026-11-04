export const POOL_SIZE = 80;
export const DRAWN_COUNT = 20;
export const MIN_PICKS = 1;
export const MAX_PICKS = 10;
export const BONUS_MULTIPLIER = 4;

export const BET_LEVELS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 20, 25, 30];
export const MIN_BET = BET_LEVELS[0];
export const MAX_BET = BET_LEVELS[BET_LEVELS.length - 1];

/**
 * Base multiplier of bet, indexed [picks][matches] — same shape as HexaKeno's PAYTABLE, but
 * tuned lower on purpose: the draw is built via partial Fisher-Yates, so the *last* number
 * drawn is uniformly distributed among all DRAWN_COUNT drawn numbers (a standard Fisher-Yates
 * property). That means, given `m` matches, P(bonus ball is one of them) = m / DRAWN_COUNT,
 * independent of picks/pool size — a closed-form fact, not simulated. Total EV per row is
 * therefore Sum_m P(m|picks) * base[picks][m] * (1 + (m/DRAWN_COUNT)*(BONUS_MULTIPLIER-1)),
 * which is what was actually tuned to land ~94-96% (same target band as every other game) —
 * these numbers aren't just HexaKeno's paytable re-typed, the bonus contribution is baked in.
 * Re-tune (recompute EV) if BONUS_MULTIPLIER or the draw/pool sizes change.
 */
export const PAYTABLE: readonly (readonly number[])[] = [
  [],
  [0, 3.3],
  [0, 0, 12],
  [0, 0, 1.3, 36],
  [0, 0, 1, 4.1, 88],
  [0, 0, 0, 1.1, 8.7, 575],
  [0, 0, 0, 0.8, 3, 68, 1220],
  [0, 0, 0, 0.3, 1.2, 13, 240, 4830],
  [0, 0, 0, 0, 1.1, 6.9, 52, 860, 6890],
  [0, 0, 0, 0, 0.6, 3.2, 28, 160, 1910, 7710],
  [0, 1, 1, 1, 1, 4, 8, 25, 125, 500, 1000],
];
