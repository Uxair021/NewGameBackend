import { PaytableConfig, TierRow, TierKey } from "../models/PaytableConfig";
import { WinTierName } from "../gameTiers";
import { fiveXRewindMeta } from "../games/FiveXRewind/meta";
import {
  calculateWin,
  NON_COIN_SYMBOLS,
  Symbol as FiveXSymbol,
  DEFAULT_BASE_TIERS as FIVEX_DEFAULT_BASE_TIERS,
  DEFAULT_COMBO_MULTIPLIERS as FIVEX_DEFAULT_COMBO_MULTIPLIERS,
  isGenuineLoss,
  isAny3BarOnly,
  isAny3BarWithSevenBar,
  isAny3Sevens,
} from "../games/FiveXRewind/winCalc";
import { crystalCloverMeta } from "../games/CrystalClover/meta";
import { vegasHitsMeta } from "../games/VegasHits/meta";
import {
  VegasHitsSymbol,
  DEFAULT_PAYTABLE as VEGASHITS_DEFAULT_PAYTABLE,
  DEFAULT_WILD_RULES as VEGASHITS_DEFAULT_WILD_RULES,
  WILD_SYMBOL as VEGASHITS_WILD_SYMBOL,
  BONUS_SYMBOL as VEGASHITS_BONUS_SYMBOL,
  REEL_COUNT as VEGASHITS_REEL_COUNT,
  ROW_COUNT as VEGASHITS_ROW_COUNT,
  LINE_COST as VEGASHITS_LINE_COST,
  MAX_TOTAL_FREE_SPINS as VEGASHITS_MAX_TOTAL_FREE_SPINS,
} from "../games/VegasHits/config";
import {
  Grid as VegasHitsGrid,
  Paytable as VegasHitsPaytable,
  WildRules as VegasHitsWildRules,
  calculateSpinWin as vegasHitsCalculateSpinWin,
  triggerFreeGames as vegasHitsTriggerFreeGames,
  pickChiliMultiplier as vegasHitsPickChiliMultiplier,
} from "../games/VegasHits/winCalc";
import { rubberDuckMeta } from "../games/RubberDuck/meta";
import {
  PAYING_SYMBOLS as RD_PAYING_SYMBOLS,
  DEFAULT_PAYOUTS as RD_DEFAULT_PAYOUTS,
  DEFAULT_WEIGHTS as RD_DEFAULT_WEIGHTS,
  BONUS_SYMBOL as RD_BONUS_SYMBOL,
  REEL_COUNT as RD_REEL_COUNT,
  FREE_SPIN_TRIGGER_COUNT as RD_FREE_SPIN_TRIGGER_COUNT,
  FREE_SPINS_BASE as RD_FREE_SPINS_BASE,
  FREE_SPINS_RETRIGGER as RD_FREE_SPINS_RETRIGGER,
  FREE_SPIN_WIN_MULTIPLIER as RD_FREE_SPIN_WIN_MULTIPLIER,
} from "../games/RubberDuck/config";
import { topDollarMeta } from "../games/TopDollar/meta";
import { OFFER_DRAW_COUNT_WEIGHTS, MIN_BET as TD_MIN_BET } from "../games/TopDollar/config";
import { gemsDeluxeMeta } from "../games/GemsDeluxe/meta";
import { OFFER_DRAW_COUNT_WEIGHTS as GD_OFFER_DRAW_COUNT_WEIGHTS, MIN_BET as GD_MIN_BET } from "../games/GemsDeluxe/config";

const FREQUENCY_TOLERANCE = 0.01;
const RTP_TOLERANCE_PERCENT = 0.5;

export interface PaytableConfigDTO {
  gameId: string;
  targetRtpPercent: number;
  /** Sizzling 7s and Crystal Clover only — see models/PaytableConfig.ts's
   * IPaytableConfig.targetLossPercent. null for every other game. */
  targetLossPercent: number | null;
  freeSpinsGranted: number | null;
  tiers: TierRow[];
  ruleTierMap: Record<string, string> | null;
  /** Which celebration overlay (if any) each win tier triggers — admin-editable. A tier
   * missing from the map (or mapped to null) just plays the plain win chime. */
  celebrationMap: Partial<Record<TierKey, WinTierName | null>> | null;
  amountThresholds: {
    simpleWinMax: number;
    bigWinMin: number;
    megaWinMin: number;
    jackpotMin: number;
    zeroRespinMin: number;
    zeroRespinMax: number;
  } | null;
  /** Crazy 777 only — a second, fully independent weighted table (reel 4 / the special reel),
   * summing to 100% on its own, separate from `tiers`' 100% sum. */
  specialReelTiers: TierRow[] | null;
  /** Crazy 777 only — bounds for the RESPIN special-reel feature. */
  respinRange: { min: number; max: number } | null;
  /** Crystal Clover and Vegas Hits only — see models/PaytableConfig.ts's
   * IPaytableConfig.reelStateConfig. */
  reelStateConfig: { centerRowChancePercent: number } | null;
  /** Vegas Hits only — see models/PaytableConfig.ts's IPaytableConfig.wildRules. */
  wildRules: VegasHitsWildRules | null;
  /** Life of Luxury only — see models/PaytableConfig.ts's IPaytableConfig.symbolPayouts. */
  symbolPayouts: Record<string, { x3: number; x4: number; x5: number }> | null;
  /** Life of Luxury only — see models/PaytableConfig.ts's IPaytableConfig.scatterRules. */
  scatterRules: { chancePercent: number; x3: number; x4: number; x5: number; freeSpinsAwarded: number } | null;
}

const DEFAULT_CONFIGS: Record<string, PaytableConfigDTO> = {};

function toDTO(doc: {
  gameId: string;
  targetRtpPercent: number;
  targetLossPercent?: number | null;
  freeSpinsGranted: number | null;
  tiers: TierRow[];
  ruleTierMap: Record<string, string> | null;
  celebrationMap?: PaytableConfigDTO["celebrationMap"];
  amountThresholds: PaytableConfigDTO["amountThresholds"];
  specialReelTiers?: PaytableConfigDTO["specialReelTiers"];
  respinRange?: PaytableConfigDTO["respinRange"];
  reelStateConfig?: PaytableConfigDTO["reelStateConfig"];
  wildRules?: PaytableConfigDTO["wildRules"];
  symbolPayouts?: PaytableConfigDTO["symbolPayouts"];
  scatterRules?: PaytableConfigDTO["scatterRules"];
}): PaytableConfigDTO {
  return {
    gameId: doc.gameId,
    targetRtpPercent: doc.targetRtpPercent,
    // Saved documents created before this feature won't have the field at all.
    targetLossPercent: doc.targetLossPercent ?? null,
    freeSpinsGranted: doc.freeSpinsGranted,
    tiers: doc.tiers,
    ruleTierMap: doc.ruleTierMap,
    celebrationMap: doc.celebrationMap ?? null,
    amountThresholds: doc.amountThresholds,
    specialReelTiers: doc.specialReelTiers ?? null,
    respinRange: doc.respinRange ?? null,
    reelStateConfig: doc.reelStateConfig ?? null,
    wildRules: doc.wildRules ?? null,
    symbolPayouts: doc.symbolPayouts ?? null,
    scatterRules: doc.scatterRules ?? null,
  };
}

export function getDefaultPaytableConfig(gameId: string): PaytableConfigDTO {
  const def = DEFAULT_CONFIGS[gameId];
  if (!def) throw new Error(`No default paytable config for game "${gameId}"`);
  return toDTO(def);
}

export async function getPaytableConfig(gameId: string): Promise<PaytableConfigDTO> {
  const doc = await PaytableConfig.findOne({ gameId }).lean();
  if (!doc) return getDefaultPaytableConfig(gameId);
  return toDTO(doc);
}

/**
 * RTP = sum over win-tiers of (frequency% / 100 * payoutMultiplier), plus — if a "freeSpin"
 * row exists — the expected value of the bonus round it triggers: freeSpin frequency *
 * average spins granted * the same win-tier sum, evaluated with freeSpinPayoutMultiplier
 * instead. Assumes the same tier frequencies apply during a free-spin bonus round as on a
 * base spin (only the payout column differs) — a deliberate simplification, see plan.
 */
/** Crazy 777 only — final win per unit bet for one (line tier, special tier) combination.
 * Multiplier special tiers scale baseWin; dollar-bonus special tiers add a flat bet-scaled
 * amount on top; RESPIN (and any other tier) passes baseWin through unchanged for *this*
 * spin — its extra value is folded in separately below as a first-order retrigger term.
 * specialEmpty never actually pays out as itself — see engine.ts's resolveSpin — a line win
 * always resolves it into a weighted-random pick among the other real special tiers, so its
 * RTP contribution is that same frequency-weighted average, not zero. */
function crazy777FinalWinPerBet(lineTier: TierRow, specialTier: TierRow, specialTiers: TierRow[]): number {
  if (lineTier.key === "loss" || lineTier.payoutMultiplier === null) return 0;
  const baseWin = lineTier.payoutMultiplier;

  if (specialTier.key === "specialEmpty") {
    const realTiers = specialTiers.filter((t) => t.key !== "specialEmpty");
    const realTotal = realTiers.reduce((sum, t) => sum + t.frequencyPercent, 0);
    if (realTotal === 0) return baseWin;
    return realTiers.reduce(
      (sum, t) => sum + (t.frequencyPercent / realTotal) * crazy777FinalWinPerBet(lineTier, t, specialTiers),
      0
    );
  }

  switch (specialTier.key) {
    case "multiplier2x":
    case "multiplier5x":
    case "multiplier10x":
      return baseWin * (specialTier.payoutMultiplier ?? 1);
    case "dollarPlus":
    case "doubleDollarPlus":
      return baseWin + (specialTier.payoutMultiplier ?? 0);
    default:
      return baseWin;
  }
}

/**
 * Crazy 777 has two fully independent weighted tables (line tiers × special-reel tiers), so
 * RTP is the *exact* joint EV over every combination (cheap — a handful of rows each way),
 * plus a first-order term for RESPIN's retrigger value: P(line win) × P(special=RESPIN) ×
 * average respins granted × the same joint EV (treating each awarded respin as worth another
 * full spin's EV — same style of simplification ShamrockSpin's free-spin EV term already uses).
 */
function computeCrazy777RtpPercent(config: PaytableConfigDTO): number {
  const specialTiers = config.specialReelTiers ?? [];
  let jointEV = 0;
  for (const line of config.tiers) {
    for (const special of specialTiers) {
      jointEV +=
        (line.frequencyPercent / 100) * (special.frequencyPercent / 100) * crazy777FinalWinPerBet(line, special, specialTiers);
    }
  }

  const pLineWin =
    config.tiers.filter((t) => t.key !== "loss" && t.payoutMultiplier !== null).reduce((sum, t) => sum + t.frequencyPercent, 0) /
    100;
  const respinTier = specialTiers.find((t) => t.key === "respin");
  const specialEmptyTier = specialTiers.find((t) => t.key === "specialEmpty");
  const realTiers = specialTiers.filter((t) => t.key !== "specialEmpty");
  const realTotal = realTiers.reduce((sum, t) => sum + t.frequencyPercent, 0);
  // A line win can reach RESPIN two ways: rolling it directly, or rolling specialEmpty and
  // having its weighted-random reveal land on respin — see crazy777FinalWinPerBet.
  const pRespinDirect = respinTier ? respinTier.frequencyPercent / 100 : 0;
  const pRespinViaReveal =
    specialEmptyTier && respinTier && realTotal > 0
      ? (specialEmptyTier.frequencyPercent / 100) * (respinTier.frequencyPercent / realTotal)
      : 0;
  const pRespin = pRespinDirect + pRespinViaReveal;
  const range = config.respinRange ?? { min: 0, max: 0 };
  const avgRespins = (range.min + range.max) / 2;
  const extraRtp = pLineWin * pRespin * avgRespins * jointEV;

  return (jointEV + extraRtp) * 100;
}

/** Maps each of 5x Rewind's line-tier TierKeys to its exact-match Symbol — only the 7 tiers
 * that resolve to a single, specific symbol (the 4 "mixed" categories and "loss" instead
 * enumerate every structurally-matching combo, see fiveXLineCombos). Duplicated from
 * games/FiveXRewind/engine.ts's equivalent map since engine.ts itself imports
 * PaytableConfigDTO from this file, so importing engine.ts back here would cycle. */
const FIVEX_EXACT_TIER_TO_SYMBOL: Partial<Record<TierKey, FiveXSymbol>> = {
  whiteBar: "WHITE_BAR",
  sevenBar: "SEVEN_BAR",
  redBar: "RED_BAR",
  purpleBar: "PURPLE_BAR",
  red7: "RED_7",
  purple7: "PURPLE_7",
  blue7: "BLUE_7",
};

const FIVEX_COIN_TIER_TO_SYMBOL: Partial<Record<TierKey, FiveXSymbol>> = {
  coin2x: "COIN_2X",
  coin3x: "COIN_3X",
  coin4x: "COIN_4X",
  coin5x: "COIN_5X",
};

/** Every base (pre-coin) 3-symbol combo that structurally belongs to a given line tier,
 * uniformly weighted within it — a single combo for the 7 exact-match tiers, every
 * structurally-matching combo (from the 7-symbol non-coin alphabet) for "loss" and the 3
 * "mixed" categories. Mirrors exactly what engine.ts's rejection sampler can produce. */
function fiveXLineCombos(tierKey: TierKey): [FiveXSymbol, FiveXSymbol, FiveXSymbol][] {
  const exactSymbol = FIVEX_EXACT_TIER_TO_SYMBOL[tierKey];
  if (exactSymbol) return [[exactSymbol, exactSymbol, exactSymbol]];

  const predicate =
    tierKey === "loss"
      ? isGenuineLoss
      : tierKey === "any3BarOnly"
        ? isAny3BarOnly
        : tierKey === "any3BarWithSevenBar"
          ? isAny3BarWithSevenBar
          : tierKey === "any3Sevens"
            ? isAny3Sevens
            : null;
  if (!predicate) return [];

  const combos: [FiveXSymbol, FiveXSymbol, FiveXSymbol][] = [];
  for (const s1 of NON_COIN_SYMBOLS) {
    for (const s2 of NON_COIN_SYMBOLS) {
      for (const s3 of NON_COIN_SYMBOLS) {
        if (predicate(s1, s2, s3)) combos.push([s1, s2, s3]);
      }
    }
  }
  return combos;
}

/**
 * 5x Rewind rolls one line tier per spin (loss + each named win category, exactly like every
 * other game's `tiers`), then independently rolls the coin-overlay table (`specialReelTiers`,
 * reused from Crazy 777's schema but consumed 3 times — once per reel, not once per spin —
 * see engine.ts) to decide whether a coin replaces each reel's line symbol. RTP is the exact
 * EV: for each line tier, every one of its structurally-valid base combos (uniformly likely
 * within that tier) × every one of the 5×5×5 = 125 coin-overlay combinations, evaluated
 * through the same calculateWin used by real spins.
 */
function computeFiveXRewindRtpPercent(config: PaytableConfigDTO): number {
  const baseTiers: Partial<Record<FiveXSymbol, number>> = { ...FIVEX_DEFAULT_BASE_TIERS };
  for (const tier of config.tiers) {
    const symbol = FIVEX_EXACT_TIER_TO_SYMBOL[tier.key];
    if (symbol && tier.payoutMultiplier !== null) baseTiers[symbol] = tier.payoutMultiplier;
  }
  const comboMultipliers = {
    anyBarOnly: config.tiers.find((t) => t.key === "any3BarOnly")?.payoutMultiplier ?? FIVEX_DEFAULT_COMBO_MULTIPLIERS.anyBarOnly,
    anyBarWithSevenBar:
      config.tiers.find((t) => t.key === "any3BarWithSevenBar")?.payoutMultiplier ?? FIVEX_DEFAULT_COMBO_MULTIPLIERS.anyBarWithSevenBar,
    anySevens: config.tiers.find((t) => t.key === "any3Sevens")?.payoutMultiplier ?? FIVEX_DEFAULT_COMBO_MULTIPLIERS.anySevens,
  };

  const coinTiers = config.specialReelTiers ?? [];
  const coinProb: (number | null)[] = []; // index 0 = "no coin" (null symbol), 1-4 = the 4 coin values
  const coinSymbol: (FiveXSymbol | null)[] = [null];
  const noCoinTier = coinTiers.find((t) => t.key === "noCoin");
  coinProb.push((noCoinTier?.frequencyPercent ?? 0) / 100);
  for (const [key, symbol] of Object.entries(FIVEX_COIN_TIER_TO_SYMBOL) as [TierKey, FiveXSymbol][]) {
    coinSymbol.push(symbol);
    coinProb.push((coinTiers.find((t) => t.key === key)?.frequencyPercent ?? 0) / 100);
  }

  let ev = 0;
  for (const tier of config.tiers) {
    const combos = fiveXLineCombos(tier.key);
    if (combos.length === 0) continue;
    const pCombo = (tier.frequencyPercent / 100) / combos.length;
    if (pCombo === 0) continue;

    for (const [b1, b2, b3] of combos) {
      for (let i1 = 0; i1 < coinProb.length; i1++) {
        if (coinProb[i1] === 0) continue;
        for (let i2 = 0; i2 < coinProb.length; i2++) {
          if (coinProb[i2] === 0) continue;
          for (let i3 = 0; i3 < coinProb.length; i3++) {
            if (coinProb[i3] === 0) continue;
            const reels: [FiveXSymbol, FiveXSymbol, FiveXSymbol] = [
              coinSymbol[i1] ?? b1,
              coinSymbol[i2] ?? b2,
              coinSymbol[i3] ?? b3,
            ];
            const p = pCombo * coinProb[i1]! * coinProb[i2]! * coinProb[i3]!;
            ev += p * calculateWin(reels, 1, baseTiers, comboMultipliers).payout;
          }
        }
      }
    }
  }

  return ev * 100;
}

/** Deterministic seeded PRNG (mulberry32) — Sizzling 7s' RTP can't be exactly enumerated (5
 * reels x 3 rows x 27 overlapping lines x Wild/Bonus/Free-Games is combinatorially far too
 * large), so it's estimated via Monte Carlo simulation instead. A *seeded* generator keeps
 * that estimate a pure, repeatable function of the config — the same tiers always produce the
 * same computed RTP, so the admin panel's validation never flickers between page loads. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function (): number {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}


function vegasHitsWeightedSymbol(tiers: TierRow[], rng: () => number): VegasHitsSymbol {
  const total = tiers.reduce((sum, t) => sum + t.frequencyPercent, 0);
  let roll = rng() * total;
  for (const t of tiers) {
    roll -= t.frequencyPercent;
    if (roll < 0) return t.key as VegasHitsSymbol;
  }
  return tiers[tiers.length - 1].key as VegasHitsSymbol;
}

/** Mirrors games/VegasHits/engine.ts's rollReelState exactly — each reel independently shows
 * either 1 symbol on the middle row (CENTER) or 2 on the top+bottom rows (TOP_BOTTOM), never
 * all 3 (see winCalc.ts's Grid type doc comment). */
function vegasHitsDrawGrid(tiers: TierRow[], centerRowChancePercent: number, rng: () => number): VegasHitsGrid {
  const grid: VegasHitsGrid = [];
  for (let reel = 0; reel < VEGASHITS_REEL_COUNT; reel++) {
    const column: (VegasHitsSymbol | null)[] = new Array(VEGASHITS_ROW_COUNT).fill(null);
    if (rng() * 100 < centerRowChancePercent) {
      column[1] = vegasHitsWeightedSymbol(tiers, rng);
    } else {
      column[0] = vegasHitsWeightedSymbol(tiers, rng);
      column[2] = vegasHitsWeightedSymbol(tiers, rng);
    }
    grid.push(column);
  }
  return grid;
}

function vegasHitsPaytableFrom(tiers: TierRow[]): VegasHitsPaytable {
  const paytable: VegasHitsPaytable = { ...VEGASHITS_DEFAULT_PAYTABLE };
  for (const tier of tiers) {
    if (tier.key === VEGASHITS_WILD_SYMBOL || tier.key === VEGASHITS_BONUS_SYMBOL || tier.payoutMultiplier === null) continue;
    if (tier.key in paytable) (paytable as Record<string, number>)[tier.key] = tier.payoutMultiplier;
  }
  return paytable;
}

/** The admin-configured wild rules (see config.ts's WildRules doc comment), falling back to the
 * built-in defaults if unset. */
function vegasHitsWildRulesFrom(config: PaytableConfigDTO): VegasHitsWildRules {
  return config.wildRules ?? VEGASHITS_DEFAULT_WILD_RULES;
}

const VEGASHITS_SIMS = 200_000;
/** Same safety cap as the real engine's spec-defined lifetime cap (see config.ts's
 * MAX_TOTAL_FREE_SPINS) — astronomically unlikely to ever bind for real weights. */
const VEGASHITS_MAX_SIM_FREE_SPINS = VEGASHITS_MAX_TOTAL_FREE_SPINS;

/** Plays out one full round at a 1-unit bet: a base spin, plus — if it triggers — every free
 * spin in the awarded (and possibly retriggered) Free Games chain. Reuses the exact same
 * calculateSpinWin/triggerFreeGames/pickChiliMultiplier the real engine uses, so this can only
 * diverge from live play in *how many* rounds get sampled, never in the win math itself.
 * `isBaseLoss` reflects only the base spin itself (what the player immediately sees) — a round
 * that triggers Free Games always has scatterWin > 0, so it's never counted as a loss here even
 * though bonus-round wins are folded into `win`. */
function simulateVegasHitsRound(
  tiers: TierRow[],
  paytable: VegasHitsPaytable,
  wildRules: VegasHitsWildRules,
  centerRowChancePercent: number,
  rng: () => number
): { win: number; isBaseLoss: boolean } {
  // A real spin's finalWin scales with betMultiplier = totalBet / LINE_COST (see
  // games/VegasHits/routes.ts) — simulating "at a 1-unit bet" means betMultiplier = 1/LINE_COST
  // (and totalBet = 1, for the scatter win's own flat 1X-total-bet rule), not passing 1 for both.
  const betMultiplier = 1 / VEGASHITS_LINE_COST;
  const totalBet = 1;
  const grid = vegasHitsDrawGrid(tiers, centerRowChancePercent, rng);
  const evaluation = vegasHitsCalculateSpinWin(grid, paytable, wildRules, betMultiplier, totalBet, 1);
  let total = evaluation.finalWin;
  const isBaseLoss = evaluation.finalWin === 0;

  if (evaluation.triggeredFreeGames) {
    let remaining = vegasHitsTriggerFreeGames().freeSpins;
    let totalAwarded = remaining;
    let played = 0;
    while (remaining > 0 && played < VEGASHITS_MAX_SIM_FREE_SPINS) {
      remaining--;
      played++;
      const freeGrid = vegasHitsDrawGrid(tiers, centerRowChancePercent, rng);
      const chiliMultiplier = vegasHitsPickChiliMultiplier(rng);
      const freeEvaluation = vegasHitsCalculateSpinWin(freeGrid, paytable, wildRules, betMultiplier, totalBet, chiliMultiplier);
      total += freeEvaluation.finalWin;
      if (freeEvaluation.triggeredFreeGames) {
        const award = vegasHitsTriggerFreeGames();
        if (totalAwarded + award.freeSpins <= VEGASHITS_MAX_TOTAL_FREE_SPINS) {
          remaining += award.freeSpins;
          totalAwarded += award.freeSpins;
        }
      }
    }
  }

  return { win: total, isBaseLoss };
}

export interface VegasHitsStats {
  rtpPercent: number;
  lossPercent: number;
}

/** Vegas Hits' RTP and loss frequency are estimated (not exactly enumerated — same reason as
 * Sizzling 7s: a real grid, overlapping paylines, a Wild line multiplier, and a Free Games
 * chain are combinatorially far too large) via VEGASHITS_SIMS simulated rounds at a 1-unit bet,
 * using a fixed-seed RNG so the result is a deterministic function of `config` alone. */
export function computeVegasHitsStats(config: PaytableConfigDTO): VegasHitsStats {
  const paytable = vegasHitsPaytableFrom(config.tiers);
  const wildRules = vegasHitsWildRulesFrom(config);
  const centerRowChancePercent = config.reelStateConfig?.centerRowChancePercent ?? 50;
  const rng = mulberry32(0xc0ffee);

  let total = 0;
  let lossCount = 0;
  for (let i = 0; i < VEGASHITS_SIMS; i++) {
    const { win, isBaseLoss } = simulateVegasHitsRound(config.tiers, paytable, wildRules, centerRowChancePercent, rng);
    total += win;
    if (isBaseLoss) lossCount++;
  }
  return {
    rtpPercent: (total / VEGASHITS_SIMS) * 100,
    lossPercent: (lossCount / VEGASHITS_SIMS) * 100,
  };
}

function computeVegasHitsRtpPercent(config: PaytableConfigDTO): number {
  return computeVegasHitsStats(config).rtpPercent;
}

/** 7 Crystal Clover is outcome-first (see games/CrystalClover/engine.ts's doc comment) — one
 * discrete tier rolled from `tiers` (loss/simpleWin/bigWin/megaWin/jackpot), then an independent
 * MULTIPLIER_2X roll from `specialReelTiers` applied as a flat multiplier on top. Both are plain
 * weighted rolls over admin-set frequencies/payouts, so unlike Sizzling 7s (no dedicated loss
 * row, RTP only estimable via simulation), this is exact closed-form arithmetic — no simulation
 * needed: RTP = baseRTP × E[multiplier effect]. */
function computeCrystalCloverRtpPercent(config: PaytableConfigDTO): number {
  const baseRtp = config.tiers.reduce((sum, t) => sum + (t.frequencyPercent / 100) * (t.payoutMultiplier ?? 0), 0);
  const specialTiers = config.specialReelTiers ?? [];
  const multiplierEV = specialTiers.reduce((sum, t) => sum + (t.frequencyPercent / 100) * (t.payoutMultiplier ?? 1), 0) || 1;
  return baseRtp * multiplierEV * 100;
}

function nChooseK(n: number, k: number): number {
  let result = 1;
  for (let i = 0; i < k; i++) result = (result * (n - i)) / (i + 1);
  return result;
}

/**
 * Closed-form, not simulated. Each of the 5 reels independently draws from `tiers` (21 rows: 14
 * payers + BONUS + 6 loss fruits) — no matching/adjacency requirement, every reel that lands a
 * paying symbol adds its own payoutMultiplier to the spin's total (confirmed with user: "even a
 * one symbol hit the win... if more then one then win will be adding all the points"). So:
 *
 *   perReelEV = Σ over the 14 payers of (weight_s/100 * payout_s)
 *   baseRtp   = REEL_COUNT * perReelEV        — reels are independent, so this is exact, not an
 *                                                 approximation (no rejection sampling involved)
 *
 * BONUS contributes no direct cash — 3+ of the 5 reels showing it (probability via the Binomial
 * tail, exact) triggers FREE_SPINS_BASE free spins, each paying FREE_SPIN_WIN_MULTIPLIER×. A
 * free spin can itself retrigger (+FREE_SPINS_RETRIGGER more, added to what's left — see
 * games/RubberDuck/routes.ts) — the expected extra spins from that chain is a first-order
 * approximation (mirrors Crazy 777's RESPIN extraRtp term): with `pTrig` this small by
 * construction (rare BONUS weight), higher-order retrigger-of-a-retrigger chains are negligible.
 */
function computeRubberDuckRtpPercent(config: PaytableConfigDTO): number {
  const weightOf = (symbol: string): number => config.tiers.find((t) => t.key === symbol)?.frequencyPercent ?? 0;
  const payoutOf = (symbol: string): number =>
    config.tiers.find((t) => t.key === symbol)?.payoutMultiplier ??
    (RD_DEFAULT_PAYOUTS as Record<string, number | undefined>)[symbol] ??
    0;

  const perReelEV = RD_PAYING_SYMBOLS.reduce((sum, symbol) => sum + (weightOf(symbol) / 100) * payoutOf(symbol), 0);
  const baseRtp = RD_REEL_COUNT * perReelEV;

  const pBonus = weightOf(RD_BONUS_SYMBOL) / 100;
  let pTrig = 0;
  for (let k = RD_FREE_SPIN_TRIGGER_COUNT; k <= RD_REEL_COUNT; k++) {
    pTrig += nChooseK(RD_REEL_COUNT, k) * Math.pow(pBonus, k) * Math.pow(1 - pBonus, RD_REEL_COUNT - k);
  }

  const avgFreeSpins = RD_FREE_SPINS_BASE * (1 + pTrig * RD_FREE_SPINS_RETRIGGER);
  const freeSpinRtp = pTrig * avgFreeSpins * (RD_FREE_SPIN_WIN_MULTIPLIER * baseRtp);

  return (baseRtp + freeSpinRtp) * 100;
}

/**
 * Outcome-first (same "roll the tier, then build reels to match" shape as Buffalo 777/Crazy
 * 777 — see games/TopDollar/engine.ts), so the base-line part is just the plain generic
 * formula every such game already uses: Σ(frequency% × payoutMultiplier). The bonus round's
 * contribution needs its own term because it isn't a bet-multiple: each of the 4 sequential
 * offers is an i.i.d. draw from the same pool (sum of 1-3 weighted draws from
 * `specialReelTiers` — see engine.ts's generateOffer), so E[whichever offer the player ends up
 * accepting] always equals E[a single offer] regardless of their own Take-It/Try-Again
 * strategy (a fixed-horizon optional-stopping argument — stopping earlier or later can't bias
 * the expectation when every draw comes from the same distribution). That expectation is a
 * FLAT dollar amount (confirmed with user, unlike every other number in this game), so —
 * unlike every other game here — this game's realized RTP genuinely varies by bet size; this
 * function reports it at MIN_BET (the reference `targetRtpPercent` is meant to track).
 */
function computeTopDollarRtpPercent(config: PaytableConfigDTO): number {
  const lineEV = config.tiers.reduce(
    (sum, t) => sum + (t.payoutMultiplier !== null ? (t.frequencyPercent / 100) * t.payoutMultiplier : 0),
    0
  );

  const bonusTier = config.tiers.find((t) => t.key === "dollarBonus");
  const bonusProb = (bonusTier?.frequencyPercent ?? 0) / 100;

  const pool = config.specialReelTiers ?? [];
  const poolTotal = pool.reduce((sum, t) => sum + t.frequencyPercent, 0);
  const poolMean = poolTotal > 0 ? pool.reduce((sum, t) => sum + (t.frequencyPercent / poolTotal) * (t.payoutMultiplier ?? 0), 0) : 0;
  const drawCountTotal = OFFER_DRAW_COUNT_WEIGHTS.reduce((sum, w) => sum + w.weight, 0);
  const eDrawCount = drawCountTotal > 0 ? OFFER_DRAW_COUNT_WEIGHTS.reduce((sum, w) => sum + (w.weight / drawCountTotal) * w.count, 0) : 0;
  const eOffer = eDrawCount * poolMean;

  const referenceBet = TD_MIN_BET;
  const bonusRtp = referenceBet > 0 ? (bonusProb * eOffer) / referenceBet : 0;

  return (lineEV + bonusRtp) * 100;
}

/** Gems Deluxe only — a duplicate of Top Dollar under a new name/id, identical mechanics, so
 * this mirrors computeTopDollarRtpPercent above exactly (see its doc comment for the
 * derivation), just reading from GemsDeluxe's own OFFER_DRAW_COUNT_WEIGHTS/MIN_BET. */
function computeGemsDeluxeRtpPercent(config: PaytableConfigDTO): number {
  const lineEV = config.tiers.reduce(
    (sum, t) => sum + (t.payoutMultiplier !== null ? (t.frequencyPercent / 100) * t.payoutMultiplier : 0),
    0
  );

  const bonusTier = config.tiers.find((t) => t.key === "dollarBonus");
  const bonusProb = (bonusTier?.frequencyPercent ?? 0) / 100;

  const pool = config.specialReelTiers ?? [];
  const poolTotal = pool.reduce((sum, t) => sum + t.frequencyPercent, 0);
  const poolMean = poolTotal > 0 ? pool.reduce((sum, t) => sum + (t.frequencyPercent / poolTotal) * (t.payoutMultiplier ?? 0), 0) : 0;
  const drawCountTotal = GD_OFFER_DRAW_COUNT_WEIGHTS.reduce((sum, w) => sum + w.weight, 0);
  const eDrawCount = drawCountTotal > 0 ? GD_OFFER_DRAW_COUNT_WEIGHTS.reduce((sum, w) => sum + (w.weight / drawCountTotal) * w.count, 0) : 0;
  const eOffer = eDrawCount * poolMean;

  const referenceBet = GD_MIN_BET;
  const bonusRtp = referenceBet > 0 ? (bonusProb * eOffer) / referenceBet : 0;

  return (lineEV + bonusRtp) * 100;
}

export function computeRtpPercent(config: PaytableConfigDTO): number {
  if (config.gameId === rubberDuckMeta.id) {
    return computeRubberDuckRtpPercent(config);
  }

  if (config.gameId === topDollarMeta.id) {
    return computeTopDollarRtpPercent(config);
  }

  if (config.gameId === gemsDeluxeMeta.id) {
    return computeGemsDeluxeRtpPercent(config);
  }

  if (config.gameId === fiveXRewindMeta.id) {
    return computeFiveXRewindRtpPercent(config);
  }

  if (config.gameId === crystalCloverMeta.id) {
    return computeCrystalCloverRtpPercent(config);
  }

  if (config.gameId === vegasHitsMeta.id) {
    return computeVegasHitsRtpPercent(config);
  }

  if (config.specialReelTiers) {
    return computeCrazy777RtpPercent(config);
  }

  const winTiers = config.tiers.filter((t) => t.payoutMultiplier !== null);
  const baseRtp = winTiers.reduce((sum, t) => sum + (t.frequencyPercent / 100) * (t.payoutMultiplier ?? 0), 0);

  const freeSpinRow = config.tiers.find((t) => t.key === "freeSpin");
  if (!freeSpinRow || !config.freeSpinsGranted) {
    return baseRtp * 100;
  }

  const freeSpinTierSum = winTiers.reduce(
    (sum, t) => sum + (t.frequencyPercent / 100) * (t.freeSpinPayoutMultiplier ?? t.payoutMultiplier ?? 0),
    0
  );
  const freeSpinRtp = (freeSpinRow.frequencyPercent / 100) * config.freeSpinsGranted * freeSpinTierSum;

  return (baseRtp + freeSpinRtp) * 100;
}

export interface ValidationResult {
  valid: boolean;
  computedRtpPercent: number;
  frequencySum: number;
  errors: string[];
}

export function validatePaytableConfig(config: PaytableConfigDTO): ValidationResult {
  const errors: string[] = [];
  const frequencySum = config.tiers.reduce((sum, t) => sum + t.frequencyPercent, 0);

  if (Math.abs(frequencySum - 100) > FREQUENCY_TOLERANCE) {
    errors.push(`Frequencies must sum to 100% — currently ${frequencySum.toFixed(2)}%.`);
  }

  const computedRtpPercent = computeRtpPercent(config);
  if (Math.abs(computedRtpPercent - config.targetRtpPercent) > RTP_TOLERANCE_PERCENT) {
    errors.push(
      `Computed RTP is ${computedRtpPercent.toFixed(2)}%, which doesn't match the target of ${config.targetRtpPercent.toFixed(2)}% (±${RTP_TOLERANCE_PERCENT}%). Adjust frequencies or payout multipliers.`
    );
  }

  for (const tier of config.tiers) {
    if (tier.frequencyPercent < 0 || tier.frequencyPercent > 100) {
      errors.push(`"${tier.key}" frequency must be between 0 and 100.`);
    }
    if (tier.payoutMultiplier !== null && tier.payoutMultiplier < 0) {
      errors.push(`"${tier.key}" payout multiplier can't be negative.`);
    }
  }

  if (config.amountThresholds) {
    const { zeroRespinMin, zeroRespinMax } = config.amountThresholds;
    if (zeroRespinMin < 0 || zeroRespinMax < 0) {
      errors.push(`Zero Respin's revealed-value range can't be negative.`);
    } else if (zeroRespinMin > zeroRespinMax) {
      errors.push(`Zero Respin's minimum revealed value must be less than or equal to its maximum.`);
    }
  }

  if (config.specialReelTiers) {
    const specialFrequencySum = config.specialReelTiers.reduce((sum, t) => sum + t.frequencyPercent, 0);
    if (Math.abs(specialFrequencySum - 100) > FREQUENCY_TOLERANCE) {
      errors.push(`Special reel frequencies must sum to 100% — currently ${specialFrequencySum.toFixed(2)}%.`);
    }
    for (const tier of config.specialReelTiers) {
      if (tier.frequencyPercent < 0 || tier.frequencyPercent > 100) {
        errors.push(`"${tier.key}" special reel frequency must be between 0 and 100.`);
      }
      if (tier.payoutMultiplier !== null && tier.payoutMultiplier < 0) {
        errors.push(`"${tier.key}" special reel payout multiplier can't be negative.`);
      }
    }
  }

  if (config.respinRange) {
    const { min, max } = config.respinRange;
    if (min < 0 || max < 0) {
      errors.push(`Respin count range can't be negative.`);
    } else if (min > max) {
      errors.push(`Respin minimum must be less than or equal to its maximum.`);
    }
  }

  if (config.reelStateConfig) {
    const { centerRowChancePercent } = config.reelStateConfig;
    if (centerRowChancePercent < 0 || centerRowChancePercent > 100) {
      errors.push(`Center-row chance must be between 0 and 100.`);
    }
  }

  if (config.wildRules) {
    const { onePureBet, twoPureBet, threePureBet, oneCompleteMultiplier, twoCompleteMultiplier, anyMixBet } = config.wildRules;
    if ([onePureBet, twoPureBet, threePureBet, oneCompleteMultiplier, twoCompleteMultiplier, anyMixBet].some((v) => v < 0)) {
      errors.push("Wild rule values must be 0 or greater.");
    }
  }

  if (config.symbolPayouts) {
    for (const [symbol, row] of Object.entries(config.symbolPayouts)) {
      if (row.x3 < 0 || row.x4 < 0 || row.x5 < 0) {
        errors.push(`"${symbol}" symbol payouts must be 0 or greater.`);
      }
    }
  }

  if (config.scatterRules) {
    const { chancePercent, x3, x4, x5, freeSpinsAwarded } = config.scatterRules;
    if ([x3, x4, x5, freeSpinsAwarded].some((v) => v < 0)) {
      errors.push("Scatter rule values must be 0 or greater.");
    }
    if (chancePercent < 0 || chancePercent > 100) {
      errors.push("Scatter chance % must be between 0 and 100.");
    }
  }

  return { valid: errors.length === 0, computedRtpPercent, frequencySum, errors };
}

export async function savePaytableConfig(config: PaytableConfigDTO): Promise<PaytableConfigDTO> {
  const doc = await PaytableConfig.findOneAndUpdate(
    { gameId: config.gameId },
    {
      $set: {
        targetRtpPercent: config.targetRtpPercent,
        targetLossPercent: config.targetLossPercent,
        freeSpinsGranted: config.freeSpinsGranted,
        tiers: config.tiers,
        ruleTierMap: config.ruleTierMap,
        celebrationMap: config.celebrationMap,
        amountThresholds: config.amountThresholds,
        specialReelTiers: config.specialReelTiers,
        respinRange: config.respinRange,
        reelStateConfig: config.reelStateConfig,
        wildRules: config.wildRules,
        symbolPayouts: config.symbolPayouts,
        scatterRules: config.scatterRules,
      },
    },
    { upsert: true, new: true }
  ).lean();
  return toDTO(doc!);
}
