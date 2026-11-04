/** Centralized rules for Rubber Duck — a single-line, 1x5 (1 row, 5 reels) bath-time slot.
 * Every number/rule the spec calls out lives here so winCalc.ts/engine.ts never scatter magic
 * numbers; the win-calc/RTP code reads the live admin-tunable PaytableConfig (services/
 * paytableConfig.ts), which starts seeded with these same defaults.
 *
 * Mechanic (confirmed with user): each of the 5 reels draws its symbol *independently* from one
 * shared weighted table (same shape as VegasHits/LifeOfLuxury's reel-strip tiers, not an
 * outcome-first single-tier-per-spin pick like Fruity777/Buffalo777). There is no "3-in-a-row"
 * matching requirement at all — every reel that happens to land a paying symbol adds that
 * symbol's own listed value to the spin's total win, independently, even a single occurrence;
 * landing more than one (whether the same symbol repeated or several different ones) just sums
 * every position's value together. Symbols not in PAYING_SYMBOLS (the 6 fruits) always pay
 * nothing — pure loss cells. 3+ BONUS cells (anywhere in the 5) award free spins instead of cash.
 */

export const PAYING_SYMBOLS = [
  "TRIPLE_7",
  "DOUBLE_7",
  "SEVEN",
  "BOAT",
  "GUN",
  "TOOL",
  "SHAMPOO",
  "TOWEL",
  "BRUSH",
  "SAFEGUARD",
  "CAP",
  "POT",
  "SOAP",
  "SPONGE",
] as const;
export type PayingSymbol = (typeof PAYING_SYMBOLS)[number];

/** Pure loss cells — "Unlisted fruit symbols represent losses" per spec. Never pay, never
 * trigger anything; just filler weight on the shared reel-strip table. */
export const FRUIT_SYMBOLS = ["AVOCADO", "BANANA", "COCONUT", "GRAPES", "LEMON", "STRAWBERRY"] as const;
export type FruitSymbol = (typeof FRUIT_SYMBOLS)[number];

export const BONUS_SYMBOL = "BONUS" as const;

export const SYMBOLS = [...PAYING_SYMBOLS, BONUS_SYMBOL, ...FRUIT_SYMBOLS] as const;
export type Symbol = (typeof SYMBOLS)[number];

export const REEL_COUNT = 5;

export const BET_LEVELS = [0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 20, 25, 30];
export const DEFAULT_BET = 0.1;
export const MIN_BET = BET_LEVELS[0];
export const MAX_BET = BET_LEVELS[BET_LEVELS.length - 1];

/** 3+ BONUS cells anywhere among the 5 reels (rule 2 in the spec) triggers free spins — 15 on a
 * base spin, or +10 more (added to whatever's left, not a fresh batch) if it lands again while
 * already inside a free-spins round. Not admin-tunable (same "fixed feature constants, only the
 * paytable's frequencies/payouts are admin-editable" choice Fruity777's MIN/MAX_FREE_SPINS
 * already makes) — see services/paytableConfig.ts's computeRubberDuckRtpPercent for how these
 * still factor into the live RTP estimate.
 */
export const FREE_SPIN_TRIGGER_COUNT = 3;
export const FREE_SPINS_BASE = 15;
export const FREE_SPINS_RETRIGGER = 10;
/** Rule 3: every win pays 3x while a free-spins round is active. */
export const FREE_SPIN_WIN_MULTIPLIER = 3;

export interface PayoutRow {
  symbol: PayingSymbol;
  payout: number;
}

/** The exact per-hit values from the spec — one flat number per symbol (no 3/4/5-of-a-kind
 * tiers; a single landed cell already pays this in full, see config.ts's doc comment above).
 * Admin-editable afterward via the live PaytableConfig tiers (services/paytableConfig.ts) —
 * these are just the seeded starting point. */
export const DEFAULT_PAYOUTS: Record<PayingSymbol, number> = {
  TRIPLE_7: 10810,
  DOUBLE_7: 6095,
  SEVEN: 3100,
  BOAT: 1000,
  GUN: 500,
  TOOL: 400,
  SHAMPOO: 250,
  TOWEL: 100,
  BRUSH: 75,
  SAFEGUARD: 50,
  CAP: 25,
  POT: 20,
  SOAP: 10,
  SPONGE: 5,
};

export const REFERENCE_PAYTABLE: PayoutRow[] = PAYING_SYMBOLS.map((symbol) => ({
  symbol,
  payout: DEFAULT_PAYOUTS[symbol],
}));

/**
 * Default reel-strip weights (percent, one row per symbol, summing to 100 across all 21) —
 * solved this session so that, independently for each of the 5 reels:
 *   perReelEV = Σ weight_i/100 * payout_i  (over the 14 paying symbols)
 *   baseRTP   = 5 * perReelEV                                    ≈ 78%
 * plus the free-spins feature's own contribution (BONUS at 5.985% per reel, first-order
 * retrigger term folded in — see services/paytableConfig.ts's computeRubberDuckRtpPercent for
 * the exact closed-form derivation) landing at                   ≈ 7%
 * for a total default RTP of                                     ≈ 85% (the requested target).
 * Weights decrease roughly as payout increases (rarer symbol, same shape every other game's
 * reel-strip table uses) — TRIPLE_7 at 10810x is accordingly a true jackpot-rarity cell
 * (~1-in-5.7M per reel) while SPONGE at 5x lands relatively often. The 6 fruit-loss symbols
 * split the remaining ~93.1% evenly since nothing distinguishes them mechanically.
 */
export const DEFAULT_WEIGHTS: Record<Symbol, number> = {
  TRIPLE_7: 0.00001767,
  DOUBLE_7: 0.00003534,
  SEVEN: 0.00010309,
  BOAT: 0.00053016,
  GUN: 0.00117814,
  TOOL: 0.00206174,
  SHAMPOO: 0.00412348,
  TOWEL: 0.01178137,
  BRUSH: 0.01767205,
  SAFEGUARD: 0.02945341,
  CAP: 0.06479751,
  POT: 0.09425092,
  SOAP: 0.20617389,
  SPONGE: 0.4712546,
  BONUS: 5.985059,
  AVOCADO: 15.518585,
  BANANA: 15.518585,
  COCONUT: 15.518585,
  GRAPES: 15.518585,
  LEMON: 15.518585,
  STRAWBERRY: 15.518585,
};
