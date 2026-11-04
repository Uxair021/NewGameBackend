/** Pure payout logic for 5x Rewind — no imports from services/ or any other game, so this
 * can be safely imported by both engine.ts (real spins) and services/paytableConfig.ts
 * (RTP preview) without creating a circular dependency. */

export const SYMBOLS = [
  "WHITE_BAR",
  "SEVEN_BAR",
  "RED_BAR",
  "PURPLE_BAR",
  "RED_7",
  "PURPLE_7",
  "BLUE_7",
  "COIN_2X",
  "COIN_3X",
  "COIN_4X",
  "COIN_5X",
] as const;

export type Symbol = (typeof SYMBOLS)[number];

export const COIN_VALUE: Partial<Record<Symbol, number>> = {
  COIN_2X: 2,
  COIN_3X: 3,
  COIN_4X: 4,
  COIN_5X: 5,
};

export const COIN_SYMBOLS: ReadonlySet<Symbol> = new Set(["COIN_2X", "COIN_3X", "COIN_4X", "COIN_5X"]);

/** The 7 non-coin symbols — the alphabet a line tier's base (pre-coin-overlay) symbols are
 * drawn from. See games/FiveXRewind/engine.ts. */
export const NON_COIN_SYMBOLS: Symbol[] = SYMBOLS.filter((s) => !COIN_SYMBOLS.has(s));

const BAR_FAMILY: ReadonlySet<Symbol> = new Set(["WHITE_BAR", "RED_BAR", "PURPLE_BAR", "SEVEN_BAR"]);

/** Any mix of the 4 "seven-family" symbols (SEVEN_BAR + the 3 colored sevens) — covers both
 * "SEVEN_BAR with a colored 7" and "3 different colored 7s with no SEVEN_BAR at all". SEVEN_BAR
 * is deliberately also a BAR_FAMILY member (see above) — the two ANY-3 categories never
 * actually overlap for a real spin, since which one applies depends on what SEVEN_BAR is
 * paired *with* (plain bars vs. colored sevens), not on SEVEN_BAR alone. */
const SEVEN_FAMILY: ReadonlySet<Symbol> = new Set(["SEVEN_BAR", "RED_7", "PURPLE_7", "BLUE_7"]);

export interface ComboMultipliers {
  anyBarOnly: number;
  anyBarWithSevenBar: number;
  anySevens: number;
}

/** The 3 "ANY-3 mixed" combo payouts — admin-editable per games/FiveXRewind/engine.ts's line
 * tiers (any3BarOnly/any3BarWithSevenBar/any3Sevens); these are the fallback when a config
 * doesn't set one (e.g. saved before this became editable). */
export const DEFAULT_COMBO_MULTIPLIERS: ComboMultipliers = {
  anyBarOnly: 2,
  anyBarWithSevenBar: 4,
  anySevens: 8,
};

/** Base 3-of-a-kind payout multipliers — admin-editable defaults (see each symbol's
 * TierRow.payoutMultiplier in PaytableConfig; these are the fallback when that's null, e.g.
 * a config saved before this became editable). */
export const DEFAULT_BASE_TIERS: Partial<Record<Symbol, number>> = {
  WHITE_BAR: 1,
  SEVEN_BAR: 10,
  RED_7: 20,
  PURPLE_7: 15,
  BLUE_7: 12,
  PURPLE_BAR: 6,
  RED_BAR: 5,
};

/** Structural predicates for the 4 "mixed" line-tier categories — shared by engine.ts (which
 * rejection-samples a base line matching one of these) and services/paytableConfig.ts (which
 * enumerates every combo matching each one for the exact RTP calculation). Independent of any
 * admin-configured payout values — these only ask "does this triple structurally belong to
 * this category", never "how much does it pay". */
export function isGenuineLoss(s1: Symbol, s2: Symbol, s3: Symbol): boolean {
  if (s1 === s2 && s2 === s3) return false;
  if (BAR_FAMILY.has(s1) && BAR_FAMILY.has(s2) && BAR_FAMILY.has(s3)) return false;
  if (SEVEN_FAMILY.has(s1) && SEVEN_FAMILY.has(s2) && SEVEN_FAMILY.has(s3)) return false;
  return true;
}

const BAR_ONLY: ReadonlySet<Symbol> = new Set(["WHITE_BAR", "RED_BAR", "PURPLE_BAR"]);

export function isAny3BarOnly(s1: Symbol, s2: Symbol, s3: Symbol): boolean {
  if (!BAR_ONLY.has(s1) || !BAR_ONLY.has(s2) || !BAR_ONLY.has(s3)) return false;
  return !(s1 === s2 && s2 === s3);
}

/** WHITE_BAR + SEVEN_BAR only, mixed — confirmed with user: this is NOT "any bar family
 * mixed with SEVEN_BAR" (RED_BAR/PURPLE_BAR don't count here at all, e.g. RED_BAR|PURPLE_BAR|
 * SEVEN_BAR matches no rule and is a genuine loss). */
const WHITE_OR_SEVEN: ReadonlySet<Symbol> = new Set(["WHITE_BAR", "SEVEN_BAR"]);

export function isAny3BarWithSevenBar(s1: Symbol, s2: Symbol, s3: Symbol): boolean {
  if (!WHITE_OR_SEVEN.has(s1) || !WHITE_OR_SEVEN.has(s2) || !WHITE_OR_SEVEN.has(s3)) return false;
  return !(s1 === s2 && s2 === s3);
}

export function isAny3Sevens(s1: Symbol, s2: Symbol, s3: Symbol): boolean {
  if (!SEVEN_FAMILY.has(s1) || !SEVEN_FAMILY.has(s2) || !SEVEN_FAMILY.has(s3)) return false;
  return !(s1 === s2 && s2 === s3);
}

export type WinType =
  | "SPECIAL_JACKPOT"
  | "SYMBOL_MATCH"
  | "SYMBOL_WITH_MULTIPLIERS"
  | "ANY3_MATCH"
  | "MULTIPLIER_ONLY"
  | "NO_WIN";

export interface WinResult {
  isWin: boolean;
  baseCombination: Symbol | "ANY3_BAR_WITH_7BAR" | "ANY3_BAR_ONLY" | "ANY3_SEVENS" | null;
  baseMultiplier: number;
  bonusMultipliers: number[];
  stackedMultiplier: number;
  finalMultiplier: number;
  payout: number;
  winType: WinType;
}

function noWin(): WinResult {
  return {
    isWin: false,
    baseCombination: null,
    baseMultiplier: 0,
    bonusMultipliers: [],
    stackedMultiplier: 1,
    finalMultiplier: 0,
    payout: 0,
    winType: "NO_WIN",
  };
}

export function calculateWin(
  reels: [Symbol, Symbol, Symbol],
  bet: number,
  baseTiers: Partial<Record<Symbol, number>> = DEFAULT_BASE_TIERS,
  comboMultipliers: ComboMultipliers = DEFAULT_COMBO_MULTIPLIERS
): WinResult {
  const [a, b, c] = reels;

  // Special jackpots — exact reel position required (confirmed with user: 5X|2X|2X etc.
  // does NOT qualify, only this literal left-to-right arrangement does).
  if (a === "COIN_2X" && b === "COIN_5X" && c === "COIN_2X") {
    return {
      isWin: true,
      baseCombination: null,
      baseMultiplier: 1000,
      bonusMultipliers: [],
      stackedMultiplier: 1,
      finalMultiplier: 1000,
      payout: bet * 1000,
      winType: "SPECIAL_JACKPOT",
    };
  }
  if (a === "COIN_2X" && b === "COIN_4X" && c === "COIN_2X") {
    return {
      isWin: true,
      baseCombination: null,
      baseMultiplier: 400,
      bonusMultipliers: [],
      stackedMultiplier: 1,
      finalMultiplier: 400,
      payout: bet * 400,
      winType: "SPECIAL_JACKPOT",
    };
  }

  const coins = reels.filter((s) => COIN_SYMBOLS.has(s));
  const nonCoins = reels.filter((s) => !COIN_SYMBOLS.has(s));
  const bonusMultipliers = coins.map((s) => COIN_VALUE[s] ?? 1);
  const stackedMultiplier = bonusMultipliers.reduce((p, v) => p * v, 1);

  // Exact 3-of-a-kind, with coins substituting for any missing copies (covers 0, 1, or 2
  // coins present — confirmed with user: substitution only completes an exact match, never
  // the ANY-3 mixed-bar categories below).
  const allNonCoinsMatch = nonCoins.length > 0 && nonCoins.every((s) => s === nonCoins[0]);
  const baseSymbol = allNonCoinsMatch ? nonCoins[0] : null;
  const baseMultiplier = baseSymbol ? baseTiers[baseSymbol] : undefined;

  if (baseSymbol && baseMultiplier !== undefined) {
    const finalMultiplier = baseMultiplier * stackedMultiplier;
    return {
      isWin: true,
      baseCombination: baseSymbol,
      baseMultiplier,
      bonusMultipliers,
      stackedMultiplier,
      finalMultiplier,
      payout: bet * finalMultiplier,
      winType: coins.length > 0 ? "SYMBOL_WITH_MULTIPLIERS" : "SYMBOL_MATCH",
    };
  }

  // ANY-3 mixed categories — only when there are no coins at all (coins don't extend into
  // these per the user's confirmation). Uses the exact same structural predicates engine.ts
  // and services/paytableConfig.ts use to construct/enumerate these tiers, so the real payout
  // logic can never drift out of sync with what a rolled "any3..." line tier actually produces.
  if (coins.length === 0) {
    if (isAny3BarOnly(a, b, c)) {
      const anyMultiplier = comboMultipliers.anyBarOnly;
      return {
        isWin: true,
        baseCombination: "ANY3_BAR_ONLY",
        baseMultiplier: anyMultiplier,
        bonusMultipliers: [],
        stackedMultiplier: 1,
        finalMultiplier: anyMultiplier,
        payout: bet * anyMultiplier,
        winType: "ANY3_MATCH",
      };
    }
    if (isAny3BarWithSevenBar(a, b, c)) {
      const anyMultiplier = comboMultipliers.anyBarWithSevenBar;
      return {
        isWin: true,
        baseCombination: "ANY3_BAR_WITH_7BAR",
        baseMultiplier: anyMultiplier,
        bonusMultipliers: [],
        stackedMultiplier: 1,
        finalMultiplier: anyMultiplier,
        payout: bet * anyMultiplier,
        winType: "ANY3_MATCH",
      };
    }
    if (isAny3Sevens(a, b, c)) {
      const anyMultiplier = comboMultipliers.anySevens;
      return {
        isWin: true,
        baseCombination: "ANY3_SEVENS",
        baseMultiplier: anyMultiplier,
        bonusMultipliers: [],
        stackedMultiplier: 1,
        finalMultiplier: anyMultiplier,
        payout: bet * anyMultiplier,
        winType: "ANY3_MATCH",
      };
    }
  }

  // Multiplier-only win: 1, 2, or 3 coins present but no valid symbol completion above.
  if (coins.length > 0) {
    return {
      isWin: true,
      baseCombination: null,
      baseMultiplier: 0,
      bonusMultipliers,
      stackedMultiplier,
      finalMultiplier: stackedMultiplier,
      payout: bet * stackedMultiplier,
      winType: "MULTIPLIER_ONLY",
    };
  }

  return noWin();
}
