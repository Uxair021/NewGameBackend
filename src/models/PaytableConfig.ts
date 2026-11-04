import { Schema, model, Document } from "mongoose";
import { WinTierName } from "../gameTiers";

export type TierKey =
  | "loss"
  | "freeSpin"
  | "simpleWin"
  | "bigWin"
  | "megaWin"
  | "jackpot"
  | "zeroRespin"
  // Buffalo 777 only — each maps 1:1 to a specific symbol/combo so payouts stay exact
  // per-symbol rather than collapsed into the shared buckets above (see plan).
  | "ten"
  | "jack"
  | "queen"
  | "king"
  | "ace"
  | "bull"
  | "anyBar"
  | "singleBar"
  | "doubleBar"
  | "tripleBar"
  | "moneyBag"
  | "coin"
  // Crazy 777 only — line-side tiers (reels 1-3): exact 3-of-a-kind (share singleBar/
  // doubleBar/loss above; these 3 are new) plus 3 mixed-family "ANY" tiers (confirmed
  // against a reference build — reels 1-3 can also win on a mixed combo, not just an
  // exact match).
  | "sevenLow"
  | "sevenMid"
  | "sevenHigh"
  | "anySeven"
  | "anyGlobal"
  // Crazy 777 only — special-reel-side tiers (reel 4), stored in `specialReelTiers` below,
  // an entirely independent weighted table from `tiers`.
  | "multiplier2x"
  | "multiplier5x"
  | "multiplier10x"
  | "dollarPlus"
  | "doubleDollarPlus"
  | "respin"
  | "specialEmpty"
  // 7 Crystal Clover only — special-reel-side tiers (the MULTIPLIER_2X roll), stored in
  // `specialReelTiers`, independent from `tiers`. Reuses "multiplier2x"/"specialEmpty" above
  // (specialEmpty = "no multiplier this spin", matching Crazy 777's own "nothing happened"
  // convention) — only these 2 are new.
  | "multiplier4x"
  | "multiplier8x"
  // 5x Rewind only — line tiers (stored in `tiers`, same as every other game): loss + each
  // exact 3-of-a-kind + the 3 "ANY-3 mixed" categories. One outcome is rolled per spin, same
  // pattern as Crazy 777's reels 1-3, and its base (pre-coin) symbols are constructed to
  // match — see games/FiveXRewind/engine.ts.
  | "whiteBar"
  | "sevenBar"
  | "redBar"
  | "purpleBar"
  | "red7"
  | "purple7"
  | "blue7"
  | "any3BarOnly"
  | "any3BarWithSevenBar"
  | "any3Sevens"
  // 5x Rewind only — coin-overlay tiers (stored in `specialReelTiers`, reusing Crazy 777's
  // second-table field) — unlike Crazy 777 where that table is rolled once per spin, this one
  // is rolled independently for *each* of the 3 reels, deciding whether a coin replaces that
  // reel's line symbol. "noCoin" is the "nothing happens on this reel" outcome.
  | "noCoin"
  | "coin2x"
  | "coin3x"
  | "coin4x"
  | "coin5x"
  // Sizzling 7s only — one row per reel symbol (stored in `tiers`), used as the reel-strip
  // weight table: frequencyPercent is that symbol's draw weight (all 7 sum to 100%),
  // payoutMultiplier is its 3-matching payout (WILD_2X's row holds only the 3-Wild "pure
  // Wild" special payout — 1/2-Wild stay fixed, see games/SizzlingSevens/config.ts). Named
  // after the actual symbol (not camelCase like other games) so engine.ts can use the key
  // directly as the drawn Symbol with no translation map — see games/SizzlingSevens/engine.ts.
  | "RED_7"
  | "BLUE_7"
  | "BAR"
  | "DOUBLE_BAR"
  | "TRIPLE_BAR"
  | "WILD_2X"
  | "BONUS"
  // 7 Crystal Clover only — same "one row per reel symbol" weight table as Sizzling 7s (see
  // games/CrystalClover/config.ts). Reuses "BAR"/"DOUBLE_BAR"/"TRIPLE_BAR" above (each game's
  // `tiers` array is independent, so sharing key names across games is safe) — only these 3
  // are new: the flagship symbol, the plain Wild, and the non-substituting 2X multiplier
  // symbol (its row's payoutMultiplier is unused — see that config.ts's MULTIPLIER_2X comment).
  | "SEVEN_CLOVER"
  | "WILD"
  | "MULTIPLIER_2X"
  // 777 Fruity only — one row per payout symbol (stored in `tiers`, same "exact 3-of-a-kind"
  // pattern as Buffalo 777), plus reuses "freeSpin"/"loss" above for the Bonus feature. BONUS
  // itself has no tier/payout — 3 BONUS on the line rolls the "freeSpin" tier instead (see
  // games/Fruity777/engine.ts).
  | "apple"
  | "lemon"
  | "orange"
  | "peach"
  | "pineapple"
  | "grape"
  | "watermelon"
  | "dragonFruit"
  | "seven"
  | "bar"
  | "star"
  // Mega 10X Pay only — reuses "loss"/"seven"/"sevenBar"/"singleBar"/"doubleBar"/"tripleBar"
  // above (exact 3-of-a-kind, same shape as Buffalo 777/5x Rewind); these are the new ones:
  // the two flagship pay-multiplier symbols, the plain CHERRY 3-of-a-kind, the 3 structural
  // "mixed" line categories (see games/Mega10XPay/config.ts's isAny3... predicates), and the
  // 2 cherry-count tiers (CHERRY appearing on only 1 or 2 of the 3 reels — see engine.ts).
  | "tenX"
  | "threeX"
  | "cherry"
  | "any3SevenSevenBar"
  | "any3SingleBarSevenBar"
  | "any3BarFamilyMix"
  | "twoCherry"
  | "oneCherry"
  // Vegas Hits only — one row per reel symbol (stored in `tiers`), same "reel-strip weight
  // table" shape as Sizzling 7s (see games/VegasHits/config.ts). Reuses "RED_7"/"BLUE_7"
  // (Sizzling 7s), "WILD" (Crystal Clover), and "BONUS" (Sizzling 7s) above — only these 3 are
  // new: the game's 3 flagship green-7 tiers (each its own distinct reel icon, not "N matching
  // plain 7s").
  | "GREEN_7"
  | "DOUBLE_GREEN_7"
  | "TRIPLE_GREEN_7"
  // Formerly Life of Luxury's reel-strip weight table (one row per symbol, stored in `tiers`,
  // same shape as Vegas Hits/Sizzling 7s) — Life of Luxury now runs fully client-side (see
  // frontEnd/src/games/LifeOfLuxury/api.ts, with its own localStorage-based RTP config), so
  // these keys and the symbolPayouts/scatterRules fields below are no longer read/written by
  // that game; left here only because other tier keys share this same union type.
  | "AEROPLANE"
  | "BOAT"
  | "CAR"
  | "RING"
  | "MONEY"
  | "WATCH"
  | "GOLD_BAR"
  | "SILVER_BAR"
  | "BRONZE_BAR"
  | "COIN"
  // Rubber Duck only — one row per reel symbol (stored in `tiers`), same "reel-strip weight
  // table" shape as Life of Luxury/Vegas Hits — see games/RubberDuck/config.ts. Every row's
  // payoutMultiplier IS used directly here (unlike Life of Luxury): a single flat value per
  // symbol, no 3/4/5-of-a-kind tiers, since a symbol pays for itself the instant it lands on
  // any of the 5 reels, no matching required. Reuses "BOAT" and "BONUS" above (both already
  // exist from other games, safe to share — see this union's own doc comment).
  | "TRIPLE_7"
  | "DOUBLE_7"
  | "SEVEN"
  | "GUN"
  | "TOOL"
  | "SHAMPOO"
  | "TOWEL"
  | "BRUSH"
  | "SAFEGUARD"
  | "CAP"
  | "POT"
  | "SOAP"
  | "SPONGE"
  | "AVOCADO"
  | "BANANA"
  | "COCONUT"
  | "GRAPES"
  | "LEMON"
  | "STRAWBERRY"
  // Top Dollar only — outcome-first line tiers (stored in `tiers`), same "roll the tier, then
  // build reels to match" pattern as Buffalo 777/Crazy 777 (see games/TopDollar/engine.ts).
  // Reuses "loss"/"tripleBar"/"doubleBar"/"singleBar"/"anyBar" above (all already exist with
  // matching semantics) — only these 4 are new: the flagship 7 symbol, and the 3 Diamond-count
  // tiers (Diamond pays just for showing up 1/2/3 times anywhere among the 3 reels, independent
  // of what else lands — not a per-symbol reel-strip weight like Vegas Hits/Sizzling 7s use).
  | "seven"
  | "diamondOne"
  | "diamondTwo"
  | "diamondThree"
  // Top Dollar only — the bonus-trigger tier: landing this rolls DOLLAR onto reel 3 and hands
  // control to the Take-It/Try-Again bonus round (see specialReelTiers below) instead of
  // paying a line amount directly.
  | "dollarBonus"
  // Top Dollar only — the bonus round's note-bundle value pool, stored in `specialReelTiers`
  // as a second independent weighted table (same "reused field, different meaning per game"
  // pattern as every other specialReelTiers user). Each row's payoutMultiplier holds a FLAT
  // dollar amount (NOT multiplied by bet — confirmed with user: bonus payouts are the same
  // regardless of bet size, unlike every other dollar figure on this game) instead of the
  // usual bet-multiple; engine.ts sums 1-3 random weighted draws from this table to build
  // each Take-It/Try-Again offer.
  | "dollarPoolFive"
  | "dollarPoolTen"
  | "dollarPoolTwenty"
  | "dollarPoolFifty"
  | "dollarPoolHundred"
  | "dollarPoolThousand";

/** Every valid TierKey, as a runtime array — TypeScript union types have no runtime reflection,
 * so this is the single source of truth both the mongoose schema's enum (below) and the admin
 * paytable controller's request validation (controllers/admin/paytableController.ts) import,
 * instead of each hand-maintaining their own separate copy. Those two copies previously drifted
 * out of sync (a new game's tier keys got added here and to the TierKey union above, but not to
 * the controller's own list), which silently rejected every save for that game with a 400 — keep
 * this single array as the only place new tier keys need to be added. */
export const TIER_KEYS: TierKey[] = [
  "loss",
  "freeSpin",
  "simpleWin",
  "bigWin",
  "megaWin",
  "jackpot",
  "zeroRespin",
  "ten",
  "jack",
  "queen",
  "king",
  "ace",
  "bull",
  "anyBar",
  "singleBar",
  "doubleBar",
  "tripleBar",
  "moneyBag",
  "coin",
  "sevenLow",
  "sevenMid",
  "sevenHigh",
  "anySeven",
  "anyGlobal",
  "multiplier2x",
  "multiplier5x",
  "multiplier10x",
  "dollarPlus",
  "doubleDollarPlus",
  "respin",
  "specialEmpty",
  "whiteBar",
  "sevenBar",
  "redBar",
  "purpleBar",
  "red7",
  "purple7",
  "blue7",
  "any3BarOnly",
  "any3BarWithSevenBar",
  "any3Sevens",
  "noCoin",
  "coin2x",
  "coin3x",
  "coin4x",
  "coin5x",
  "RED_7",
  "BLUE_7",
  "BAR",
  "DOUBLE_BAR",
  "TRIPLE_BAR",
  "WILD_2X",
  "BONUS",
  "SEVEN_CLOVER",
  "WILD",
  "MULTIPLIER_2X",
  "multiplier4x",
  "multiplier8x",
  "apple",
  "lemon",
  "orange",
  "peach",
  "pineapple",
  "grape",
  "watermelon",
  "dragonFruit",
  "seven",
  "bar",
  "star",
  "tenX",
  "threeX",
  "cherry",
  "any3SevenSevenBar",
  "any3SingleBarSevenBar",
  "any3BarFamilyMix",
  "twoCherry",
  "oneCherry",
  "GREEN_7",
  "DOUBLE_GREEN_7",
  "TRIPLE_GREEN_7",
  "AEROPLANE",
  "BOAT",
  "CAR",
  "RING",
  "MONEY",
  "WATCH",
  "GOLD_BAR",
  "SILVER_BAR",
  "BRONZE_BAR",
  "COIN",
  "TRIPLE_7",
  "DOUBLE_7",
  "SEVEN",
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
  "AVOCADO",
  "BANANA",
  "COCONUT",
  "GRAPES",
  "LEMON",
  "STRAWBERRY",
  "diamondOne",
  "diamondTwo",
  "diamondThree",
  "dollarBonus",
  "dollarPoolFive",
  "dollarPoolTen",
  "dollarPoolTwenty",
  "dollarPoolFifty",
  "dollarPoolHundred",
  "dollarPoolThousand",
];

export interface TierRow {
  key: TierKey;
  /** Percent chance of this outcome on a single spin — all rows (across the whole game) sum to 100. */
  frequencyPercent: number;
  /** Multiplier of bet credited when this tier hits. null for "loss" and "freeSpin" (no direct payout).
   * For "zeroRespin" (Cash Machine only) this is an *estimated average* used only for the RTP preview —
   * the real per-spin payout is whatever digit value the respin reveals (see amountThresholds.zeroRespinMin/Max). */
  payoutMultiplier: number | null;
  /** ShamrockSpin win-tiers only — multiplier used instead of payoutMultiplier during a free-spin bonus round. */
  freeSpinPayoutMultiplier: number | null;
}

export interface IPaytableConfig extends Document {
  gameId: string;
  targetRtpPercent: number;
  /** Sizzling 7s and Vegas Hits only — target for the % of base spins that pay nothing at all
   * (see services/paytableConfig.ts's computeSizzlingSevensStats/computeVegasHitsStats). Unlike
   * every other game's "loss" tier, neither has a dedicated loss row to set a frequency on
   * directly (every row is a real, always-drawn symbol) — this is instead a second
   * admin-editable target (alongside targetRtpPercent) that the RTP Control page solves for by
   * reshaping the symbol weights, the same "editable target, auto-adjusts the underlying rows,
   * still freely editable after" pattern targetRtpPercent already uses. null for every other
   * game. */
  targetLossPercent: number | null;
  /** ShamrockSpin only — bonus spins awarded when the "freeSpin" tier rolls. */
  freeSpinsGranted: number | null;
  tiers: TierRow[];
  /** ShamrockSpin and Crystal Clover only — which WIN_RULES render (cosmetically) for each win
   * tier; payout comes from `tiers` above, not from which rule was picked. */
  ruleTierMap: Record<string, "simpleWin" | "bigWin" | "megaWin" | "jackpot"> | null;
  /** Which celebration overlay (if any) each win tier triggers — admin-editable per tier.
   * null (or a tier missing from the map) means no celebration, just the plain win chime.
   * Crazy 777 keys this off the *special-reel* tier (see specialReelTiers), not `tiers`. */
  celebrationMap: Partial<Record<TierKey, WinTierName | null>> | null;
  /** Cash Machine only — editable amount thresholds, replacing the old hardcoded WIN_TIERS cutoffs. */
  amountThresholds: {
    simpleWinMax: number;
    bigWinMin: number;
    megaWinMin: number;
    jackpotMin: number;
    /** Range of the digit value the "0 → respin" mechanic is allowed to reveal. */
    zeroRespinMin: number;
    zeroRespinMax: number;
  } | null;
  /** Crazy 777, 5x Rewind, and Crystal Clover — a second, fully independent weighted table
   * (Crazy 777's reel 4, 5x Rewind's per-reel coin overlay, Crystal Clover's MULTIPLIER_2X roll),
   * summing to 100% on its own, separate from `tiers`' 100% sum. */
  specialReelTiers: TierRow[] | null;
  /** Crazy 777 only — bounds for the RESPIN special-reel feature (random count per trigger). */
  respinRange: { min: number; max: number } | null;
  /** Crystal Clover and Vegas Hits only — chance (0-100) a reel rolls its "1 symbol on the
   * center payline" state instead of "2 symbols on top+bottom" (see games/CrystalClover/
   * engine.ts's buildGrid / games/VegasHits/engine.ts's rollReelState). null for every other
   * game. */
  reelStateConfig: { centerRowChancePercent: number } | null;
  /** Vegas Hits only — the RED HOT 3X wild's own payout rules, none of which correspond to a
   * reel symbol's draw weight (so they can't live as rows in `tiers`) — see
   * games/VegasHits/winCalc.ts's evaluatePayline. `onePureBet`/`twoPureBet`/`threePureBet` and
   * `anyMixBet` are flat payouts (multiples of *line* bet, same LINE_COST-relative convention
   * every symbol's own payoutMultiplier uses — see games/VegasHits/config.ts's LINE_COST
   * comment); `oneCompleteMultiplier`/`twoCompleteMultiplier` are dimensionless multipliers
   * applied to a real symbol's own payout when 1 or 2 wilds substitute into its match (NOT
   * LINE_COST-scaled — a pure ratio, same as the old fixed WILD_LINE_MULTIPLIER cap they
   * replace). null for every other game. */
  wildRules: {
    onePureBet: number;
    twoPureBet: number;
    threePureBet: number;
    oneCompleteMultiplier: number;
    twoCompleteMultiplier: number;
    anyMixBet: number;
  } | null;
  /** Formerly Life of Luxury's each-symbol 3/4/5-of-a-kind line payout table. No longer
   * read/written now that Life of Luxury runs fully client-side (see
   * frontEnd/src/games/LifeOfLuxury/api.ts) — kept on the schema only for backward
   * compatibility with any already-stored documents. */
  symbolPayouts: Record<string, { x3: number; x4: number; x5: number }> | null;
  /** Formerly Life of Luxury's COIN scatter rules (independent per-cell chance, payout, free
   * spins awarded). No longer read/written now that Life of Luxury runs fully client-side (see
   * frontEnd/src/games/LifeOfLuxury/api.ts) — kept on the schema only for backward
   * compatibility with any already-stored documents. */
  scatterRules: { chancePercent: number; x3: number; x4: number; x5: number; freeSpinsAwarded: number } | null;
  createdAt: Date;
  updatedAt: Date;
}

const tierRowSchema = new Schema<TierRow>(
  {
    key: {
      type: String,
      enum: TIER_KEYS,
      required: true,
    },
    frequencyPercent: { type: Number, required: true, min: 0, max: 100 },
    payoutMultiplier: { type: Number, default: null },
    freeSpinPayoutMultiplier: { type: Number, default: null },
  },
  { _id: false }
);

const paytableConfigSchema = new Schema<IPaytableConfig>(
  {
    gameId: { type: String, required: true, unique: true },
    targetRtpPercent: { type: Number, required: true },
    targetLossPercent: { type: Number, default: null },
    freeSpinsGranted: { type: Number, default: null },
    tiers: { type: [tierRowSchema], required: true },
    ruleTierMap: { type: Schema.Types.Mixed, default: null },
    celebrationMap: { type: Schema.Types.Mixed, default: null },
    amountThresholds: { type: Schema.Types.Mixed, default: null },
    specialReelTiers: { type: [tierRowSchema], default: null },
    respinRange: { type: Schema.Types.Mixed, default: null },
    reelStateConfig: { type: Schema.Types.Mixed, default: null },
    wildRules: { type: Schema.Types.Mixed, default: null },
    symbolPayouts: { type: Schema.Types.Mixed, default: null },
    scatterRules: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

export const PaytableConfig = model<IPaytableConfig>("PaytableConfig", paytableConfigSchema);
