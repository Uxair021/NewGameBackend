/** The 6 symbols that can land on the reels. DOLLAR is special — see DOLLAR_REEL_INDEX. */
export const DISPLAY_SYMBOLS = ["SEVEN", "TRIPLE_BAR", "DOUBLE_BAR", "SINGLE_BAR", "DIAMOND", "DOLLAR"] as const;

export type Symbol = (typeof DISPLAY_SYMBOLS)[number];

export const BAR_SYMBOLS: ReadonlySet<Symbol> = new Set(["SINGLE_BAR", "DOUBLE_BAR", "TRIPLE_BAR"]);

/** Where DOLLAR always lands when the "dollarBonus" tier rolls (0-indexed) — confirmed with
 * user ("it will only come in reel 3"). Landing it there triggers the bonus round instead of
 * paying a line amount. Outcome-first (see engine.ts) — this game rolls a named tier first and
 * builds matching reels after, so this is a placement rule for that construction step, not an
 * independent per-reel draw weight. */
export const DOLLAR_REEL_INDEX = 2;

/** Only 4 discrete bet levels for this game (confirmed with user) — no continuous ladder like
 * every other game here. */
export const BET_LEVELS = [10, 25, 50, 100];
export const DEFAULT_BET = BET_LEVELS[0];
export const MIN_BET = BET_LEVELS[0];
export const MAX_BET = BET_LEVELS[BET_LEVELS.length - 1];

/** Static reference paytable — cosmetic/display only (rules popup); the actual credited payout
 * always comes from the live PaytableConfig's `tiers`, which starts seeded with these same
 * values but is admin-tunable afterward (see services/paytableConfig.ts). All of these are
 * multiples of bet — unlike the bonus round's note-bundle values below, which are flat dollar
 * amounts regardless of bet (confirmed with user). */
export interface PayoutRow {
  key: "SEVEN" | "TRIPLE_BAR" | "DOUBLE_BAR" | "SINGLE_BAR" | "ANY_BAR" | "DIAMOND_ONE" | "DIAMOND_TWO" | "DIAMOND_THREE";
  payout: number;
}

export const REFERENCE_PAYTABLE: PayoutRow[] = [
  { key: "SEVEN", payout: 100 },
  { key: "TRIPLE_BAR", payout: 75 },
  { key: "DOUBLE_BAR", payout: 50 },
  { key: "SINGLE_BAR", payout: 25 },
  { key: "ANY_BAR", payout: 10 },
  { key: "DIAMOND_THREE", payout: 20 },
  { key: "DIAMOND_TWO", payout: 10 },
  { key: "DIAMOND_ONE", payout: 4 },
];

/** The bonus round's note-bundle value pool — flat dollar amounts (never scaled by bet). The
 * $1000 bundle always sits at the same fixed board position (confirmed with user) and is the
 * rarest possible draw; the other 9 positions are cosmetic flavor only (see TopDollarScene —
 * the actual offer math draws straight from this pool, not from the bundles' own displayed
 * values, which are just randomized for show each time the bonus triggers). */
export const REFERENCE_BONUS_POOL = [
  { key: "dollarPoolFive", value: 5 },
  { key: "dollarPoolTen", value: 10 },
  { key: "dollarPoolTwenty", value: 20 },
  { key: "dollarPoolFifty", value: 50 },
  { key: "dollarPoolHundred", value: 100 },
  { key: "dollarPoolThousand", value: 1000 },
] as const;

/** How many pool values get summed into a single offer — confirmed with user: "min 1, max 3".
 * Not admin-tunable (kept as an engine constant to keep the RTP panel's scope to money
 * amounts, same as e.g. Crazy 777's fixed RESPIN retrigger-count assumption). */
export const OFFER_DRAW_COUNT_WEIGHTS: { count: 1 | 2 | 3; weight: number }[] = [
  { count: 1, weight: 40 },
  { count: 2, weight: 40 },
  { count: 3, weight: 20 },
];

/** Exactly 4 sequential offers per bonus round (First/Second/Third/Last) — confirmed with user. */
export const OFFER_COUNT = 4;
