/** Pure win-evaluation engine for Vegas Hits — no imports from services/ or any other game, so
 * this can be imported by both engine.ts (real spins) and services/paytableConfig.ts (RTP
 * simulation) without creating a circular dependency. */

import {
  VegasHitsSymbol,
  PAYLINES,
  DEFAULT_PAYTABLE,
  DEFAULT_WILD_RULES,
  WildRules,
  WILD_SYMBOL,
  BONUS_SYMBOL,
  WILD_SUBSTITUTES_FOR,
  BONUS_TRIGGER_COUNT,
  SCATTER_PAYOUT_MULTIPLE_OF_BET,
  FREE_SPINS_PER_TRIGGER,
  MAX_TOTAL_FREE_SPINS,
  CHILI_MULTIPLIER_POOL,
} from "./config";

/** grid[reelIndex][rowIndex] — row 0 = TOP, 1 = MIDDLE, 2 = BOTTOM. `null` means that reel has
 * no symbol on this row at all — every reel always shows either 1 symbol on the middle row (top
 * and bottom empty) or 2 symbols on the top+bottom rows (middle empty), never all 3 (mirrors 7
 * Crystal Clover's grid shape exactly — see engine.ts's drawGrid). */
export type Grid = (VegasHitsSymbol | null)[][];

export type Paytable = Record<Exclude<VegasHitsSymbol, "WILD" | "BONUS">, number>;
type PayingSymbol = keyof Paytable;

const WILD_SUB_SET = new Set<VegasHitsSymbol>(WILD_SUBSTITUTES_FOR);
function isPayingSymbol(s: VegasHitsSymbol): s is PayingSymbol {
  return WILD_SUB_SET.has(s);
}

export interface LineWin {
  lineNumber: number;
  /** The symbol this win is displayed/labeled as — a real matched symbol for an exact or
   * wild-completed match, "WILD" for a pure-wild win (see evaluatePayline), or the first
   * non-wild symbol on the line for an Any-Mix win (cosmetic only — Any-Mix pays a flat amount
   * regardless of which symbols actually landed). */
  symbol: VegasHitsSymbol;
  wildCount: number;
  /** The winning candidate's raw payout (already includes any completion multiplier — see
   * evaluatePayline), before betMultiplier. */
  basePayout: number;
  betMultiplier: number;
  finalWin: number;
  /** true when at least 1 RED HOT 3X wild is on this line (whether it substituted to complete a
   * match, or won on its own as a "pure wild" flat payout) — the Chili Multiplier (see
   * calculateSpinWin's chiliMultiplier param) never scales a win flagged true here, per the
   * spec's "except for RED HOT 3X symbols" carve-out. */
  involvesWild: boolean;
  positions: [number, number][]; // [reelIndex, rowIndex] for every winning cell on this line
}

export interface SpinEvaluation {
  lineWins: LineWin[];
  scatterCount: number;
  scatterWin: number;
  /** Sum of every line win that did NOT involve a Wild, plus the scatter win — this is the
   * portion the Chili Multiplier actually scales. */
  chiliEligibleWin: number;
  /** Sum of every line win that DID involve a Wild — carries only its own 3X/9X boost, never
   * scaled further by Chili. */
  wildWin: number;
  chiliMultiplier: number;
  finalWin: number;
  winningPositions: [number, number][];
  triggeredFreeGames: boolean;
}

/** Reads the 3 symbols a payline passes through, one per reel. */
function symbolsOnLine(grid: Grid, line: readonly [number, number, number]): (VegasHitsSymbol | null)[] {
  return line.map((row, reel) => grid[reel][row]);
}

/**
 * Evaluates a single payline. A payline is exactly 3 stops (3 reels). BONUS never participates
 * in a line win (Wild doesn't substitute for it, and a payline showing BONUS in any position
 * simply can't complete a match there); any `null` (empty) cell is likewise an automatic
 * non-match — every reel's 2-state shape (see the Grid type doc comment) always leaves at least
 * one payline's worth of cells empty on it.
 *
 * Otherwise, up to 3 candidates are considered and the highest-paying one wins (mirrors Sizzling
 * 7s' own multi-candidate evaluatePayline):
 *   A) Wild(s) substitute to complete an actual matching real symbol (the non-Wild cells all
 *      agree) — that symbol's own payout x1 (0 wilds, a plain exact match), x
 *      wildRules.oneCompleteMultiplier (1 wild), or x wildRules.twoCompleteMultiplier (2 wilds).
 *      Not available at 3 wilds (no real symbol left to anchor to).
 *   B) A "pure" wild count (1, 2, or 3 Wilds present) — a flat payout from wildRules
 *      (onePureBet/twoPureBet/threePureBet), independent of what the rest of the line shows.
 *      This is what still wins when candidate A can't apply (e.g. 1 Wild + 2 different real
 *      symbols) — see config.ts's WildRules doc comment for why 2 Wilds' flat number rarely
 *      ends up being the actual winner (candidate A almost always beats it).
 *   C) 0 Wilds, but the 3 real symbols don't all match — a flat wildRules.anyMixBet.
 */
export function evaluatePayline(
  grid: Grid,
  line: readonly [number, number, number],
  lineNumber: number,
  paytable: Paytable,
  wildRules: WildRules,
  betMultiplier: number
): LineWin | null {
  const rawSymbols = symbolsOnLine(grid, line);
  if (rawSymbols.some((s) => s === null || s === BONUS_SYMBOL)) return null;
  const symbols = rawSymbols as VegasHitsSymbol[];

  const nonWild = symbols.filter((s) => s !== WILD_SYMBOL);
  const wildCount = symbols.length - nonWild.length;

  let candidateSymbol: VegasHitsSymbol | null = null;
  let candidateA: number | null = null;
  if (nonWild.length > 0 && nonWild.every((s) => s === nonWild[0]) && isPayingSymbol(nonWild[0])) {
    candidateSymbol = nonWild[0];
    const mult = wildCount === 0 ? 1 : wildCount === 1 ? wildRules.oneCompleteMultiplier : wildRules.twoCompleteMultiplier;
    candidateA = paytable[nonWild[0] as PayingSymbol] * mult;
  }

  const candidateB: number | null =
    wildCount === 1 ? wildRules.onePureBet : wildCount === 2 ? wildRules.twoPureBet : wildCount === 3 ? wildRules.threePureBet : null;

  const candidateC: number | null = wildCount === 0 && nonWild.length > 0 && !nonWild.every((s) => s === nonWild[0]) ? wildRules.anyMixBet : null;

  const candidates = [candidateA, candidateB, candidateC].filter((c): c is number => c !== null);
  if (candidates.length === 0) return null;

  const basePayout = Math.max(...candidates);
  const symbol: VegasHitsSymbol = basePayout === candidateA && candidateSymbol ? candidateSymbol : basePayout === candidateC ? nonWild[0] : WILD_SYMBOL;
  const finalWin = basePayout * betMultiplier;
  const positions: [number, number][] = line.map((row, reel) => [reel, row]);

  return {
    lineNumber,
    symbol,
    wildCount,
    basePayout,
    betMultiplier,
    finalWin,
    involvesWild: wildCount > 0,
    positions,
  };
}

export function evaluateAllPaylines(grid: Grid, paytable: Paytable, wildRules: WildRules, betMultiplier: number): LineWin[] {
  return PAYLINES.map((line, i) => evaluatePayline(grid, line, i + 1, paytable, wildRules, betMultiplier)).filter(
    (w): w is LineWin => w !== null
  );
}

/** BONUS can land anywhere on the 3x3 grid, doesn't need a payline, and Wild never substitutes
 * for it. 3+ anywhere pays a flat 1X total bet (not admin-tunable — see config.ts's
 * SCATTER_PAYOUT_MULTIPLE_OF_BET) and triggers Free Games. */
export function calculateScatterWin(grid: Grid, totalBet: number): { scatterCount: number; scatterWin: number } {
  let scatterCount = 0;
  for (const reel of grid) for (const s of reel) if (s === BONUS_SYMBOL) scatterCount++;

  if (scatterCount < BONUS_TRIGGER_COUNT) return { scatterCount, scatterWin: 0 };
  return { scatterCount, scatterWin: SCATTER_PAYOUT_MULTIPLE_OF_BET * totalBet };
}

/**
 * Assembles line + scatter wins for one spin. `chiliMultiplier` is 1 for a normal (base game)
 * spin; pass the multiplier drawn for the current free spin (see pickChiliMultiplier) during
 * Free Games. Per the spec, the Chili Multiplier scales every win *except* one a RED HOT 3X
 * wild substituted into — those keep only their own 3X/9X boost (see LineWin.involvesWild).
 */
export function calculateSpinWin(
  grid: Grid,
  paytable: Paytable,
  wildRules: WildRules,
  betMultiplier: number,
  totalBet: number,
  chiliMultiplier = 1
): SpinEvaluation {
  const lineWins = evaluateAllPaylines(grid, paytable, wildRules, betMultiplier);
  const { scatterCount, scatterWin } = calculateScatterWin(grid, totalBet);

  const chiliEligibleLineWin = lineWins.filter((w) => !w.involvesWild).reduce((sum, w) => sum + w.finalWin, 0);
  const wildWin = lineWins.filter((w) => w.involvesWild).reduce((sum, w) => sum + w.finalWin, 0);
  const chiliEligibleWin = chiliEligibleLineWin + scatterWin;

  const finalWin = chiliEligibleWin * chiliMultiplier + wildWin;

  const winningPositions: [number, number][] = [];
  for (const w of lineWins) winningPositions.push(...w.positions);

  return {
    lineWins,
    scatterCount,
    scatterWin,
    chiliEligibleWin,
    wildWin,
    chiliMultiplier,
    finalWin,
    winningPositions,
    triggeredFreeGames: scatterCount >= BONUS_TRIGGER_COUNT,
  };
}

export interface FreeGamesTrigger {
  freeSpins: number;
}

/** A Bonus trigger (initial or retrigger) always awards a flat FREE_SPINS_PER_TRIGGER — no
 * variable award pool/mystery pick in this game's spec, unlike Sizzling 7s. The 700-spin
 * lifetime cap (see config.ts's MAX_TOTAL_FREE_SPINS) is enforced by the caller, which is the
 * only place that knows how many free spins have already been awarded in the current chain. */
export function triggerFreeGames(): FreeGamesTrigger {
  return { freeSpins: FREE_SPINS_PER_TRIGGER };
}

/** Draws this free spin's Chili Multiplier — fresh every spin, uniform over the fixed 2X-7X
 * pool (see config.ts's CHILI_MULTIPLIER_POOL). */
export function pickChiliMultiplier(rng: () => number = Math.random): number {
  return CHILI_MULTIPLIER_POOL[Math.floor(rng() * CHILI_MULTIPLIER_POOL.length)];
}

export { DEFAULT_PAYTABLE, DEFAULT_WILD_RULES, FREE_SPINS_PER_TRIGGER, MAX_TOTAL_FREE_SPINS };
export type { WildRules };
