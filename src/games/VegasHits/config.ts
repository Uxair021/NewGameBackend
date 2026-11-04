/** Centralized rules for Vegas Hits (RED HOT 3X) — a classic 3-reel x 3-row, 5-fixed-payline
 * slot. Every number/rule the spec calls out lives here so winCalc.ts/engine.ts never scatter
 * magic numbers; the win-calc/RTP code reads this object, never hardcodes a payout or line
 * pattern. */

export const SYMBOLS = ["GREEN_7", "DOUBLE_GREEN_7", "TRIPLE_GREEN_7", "RED_7", "BLUE_7", "WILD", "BONUS"] as const;
export type VegasHitsSymbol = (typeof SYMBOLS)[number];

export const REEL_COUNT = 3;
export const ROW_COUNT = 3;
/** row 0 = TOP, row 1 = MIDDLE, row 2 = BOTTOM. */
export const TOP = 0;
export const MIDDLE = 1;
export const BOTTOM = 2;

/** Purely an internal normalization constant — every payout in the paytable is expressed as a
 * multiple of this reference bet (see winCalc.ts), not a real player-facing "cost per line".
 * The player instead picks a BET_LEVEL directly (0.10-30, matching every other game's
 * BET_LEVELS convention) as their *total* bet; the actual scale factor fed into the win-calc
 * functions is (selected level / LINE_COST) — see engine.ts's spin()/routes.ts. Same convention
 * as Sizzling 7s (see games/SizzlingSevens/config.ts) so the two games' admin tooling stays
 * consistent. */
export const LINE_COST = 30;
export const BET_LEVELS = [0.1, 0.25, 0.5, 1, 2, 3, 5, 10, 15, 20, 25, 30];
export const MIN_BET = BET_LEVELS[0];
export const MAX_BET = BET_LEVELS[BET_LEVELS.length - 1];

/**
 * The 5 fixed payline patterns — one row index (0/1/2) per reel, per the spec:
 *   1: Middle row
 *   2: Top row
 *   3: Bottom row
 *   4: Diagonal — Top Left -> Center -> Bottom Right
 *   5: Diagonal — Bottom Left -> Center -> Top Right
 */
export const PAYLINES: readonly [number, number, number][] = [
  [MIDDLE, MIDDLE, MIDDLE],
  [TOP, TOP, TOP],
  [BOTTOM, BOTTOM, BOTTOM],
  [TOP, MIDDLE, BOTTOM],
  [BOTTOM, MIDDLE, TOP],
];

/** 3-matching-symbol payouts (as a multiple of the *line* bet, i.e. before the bet-level scale
 * is applied) — admin-editable defaults, see services/paytableConfig.ts. Each of these 5
 * symbols is its own distinct reel icon (not "N matching plain 7s"), per the spec's paytable
 * (TRIPLE_GREEN_7=100, DOUBLE_GREEN_7=50, GREEN_7=20, RED_7=12, BLUE_7=15), scaled down ~0.235x
 * from those originally-requested round numbers — same relative shape, just smaller. The
 * ANY_MIX_BET rule below (see WildRules) pays a flat amount on almost every live non-wild line
 * that isn't an exact match, which floors achievable RTP far above target (~290%+, confirmed
 * empirically even with Wild/Bonus pushed to near-zero weight) no matter how the reel weights
 * are tuned — same "structural ceiling, scale the payout table instead" situation Sizzling 7s'
 * own paytable comment describes. */
export const DEFAULT_PAYTABLE: Record<Exclude<VegasHitsSymbol, "WILD" | "BONUS">, number> = {
  TRIPLE_GREEN_7: 23.5 * 30,
  DOUBLE_GREEN_7: 11.75 * 30,
  GREEN_7: 4.7 * 30,
  RED_7: 2.82 * 30,
  BLUE_7: 3.525 * 30,
};

export const WILD_SYMBOL: VegasHitsSymbol = "WILD";
export const BONUS_SYMBOL: VegasHitsSymbol = "BONUS";

/** Wild (RED HOT 3X) substitutes for every normal paying symbol, never for BONUS. */
export const WILD_SUBSTITUTES_FOR: VegasHitsSymbol[] = ["GREEN_7", "DOUBLE_GREEN_7", "TRIPLE_GREEN_7", "RED_7", "BLUE_7"];

/**
 * The wild's own payout rules — none of these correspond to a reel symbol's draw weight (see
 * models/PaytableConfig.ts's IPaytableConfig.wildRules), so they're admin-edited as their own
 * small panel rather than rows in the reel-strip weight table. For one payline (exactly 3
 * cells), evaluatePayline (see winCalc.ts) picks the best of up to 3 candidates:
 *
 *   A) wild(s) substitute to complete an actual matching real symbol — that symbol's own
 *      payout x oneCompleteMultiplier (1 wild) or x twoCompleteMultiplier (2 wilds). 0 wilds is
 *      just an exact match (implicit x1).
 *   B) a "pure" wild count that doesn't (or can't) complete a real match — flat onePureBet /
 *      twoPureBet / threePureBet. Since a payline is only 3 cells, 2 wilds always trivially
 *      "complete" whatever single real symbol remains (so twoPureBet is a safety-net number
 *      that candidate A almost always beats, same shape as onePureBet losing out whenever the
 *      other 2 cells DO happen to match) — 3 wilds has no real symbol left to anchor to at all,
 *      so threePureBet is always the deciding number there.
 *   C) 0 wilds, but the 3 real symbols don't all match — flat anyMixBet.
 *
 * Defaults are the spec's originally-requested numbers (2/6/500/3/6/3), scaled down the same
 * ~0.235x as DEFAULT_PAYTABLE for the 4 flat bet-amount fields — oneCompleteMultiplier/
 * twoCompleteMultiplier are dimensionless ratios, not bet amounts, so they're kept at the
 * spec's literal 3/6 (see WildRules).
 */
export interface WildRules {
  onePureBet: number;
  twoPureBet: number;
  threePureBet: number;
  oneCompleteMultiplier: number;
  twoCompleteMultiplier: number;
  anyMixBet: number;
}

export const DEFAULT_WILD_RULES: WildRules = {
  onePureBet: 0.47 * 30,
  twoPureBet: 1.41 * 30,
  threePureBet: 117.5 * 30,
  oneCompleteMultiplier: 3,
  twoCompleteMultiplier: 6,
  anyMixBet: 0.705 * 30,
};

export const BONUS_TRIGGER_COUNT = 3;
/** "3 BONUS symbols ... pay a scatter win of 1X total bet" — a fixed rule, not admin-tunable
 * via the paytable (unlike every other symbol's payout here). */
export const SCATTER_PAYOUT_MULTIPLE_OF_BET = 1;

/** "trigger 7 Free Games" (base game) / "7 additional Free Games" (retrigger during Free
 * Games), up to a maximum of 700 Free Games total in one chain. */
export const FREE_SPINS_PER_TRIGGER = 7;
export const MAX_TOTAL_FREE_SPINS = 700;
export const RETRIGGER_ENABLED = true;

/** "Each Free Game triggers a Chili Multiplier between 2X and 7X" — drawn fresh, uniformly,
 * for every free spin played (see winCalc.ts's pickChiliMultiplier). Not admin-tunable — a
 * fixed rule pool straight from the spec. */
export const CHILI_MULTIPLIER_POOL = [2, 3, 4, 5, 6, 7];

export type { VegasHitsSymbol as Symbol };
