/** Shared win-tier vocabulary across all games — every game defines its own thresholds
 * (see each game's winTiers.ts) but the tier *names* are shared so ForcedOutcome and
 * SpinHistory don't need per-game schema/enum variants. */
export type WinTierName = "BIG WIN" | "MEGA WIN" | "JACKPOT";
/** The 3 tier names as a plain array — the canonical source for anything that just needs to
 * validate/enumerate them (e.g. forcedOutcomesController.ts) without importing any one game's own
 * winTiers.ts, which is otherwise structurally per-game and shouldn't be a cross-game dependency. */
export const WIN_TIER_NAMES: WinTierName[] = ["BIG WIN", "MEGA WIN", "JACKPOT"];

export interface WinTier {
  name: WinTierName;
  minAmount: number;
}

/** Looks up the celebration tier for a spin's credited amount against a game's own thresholds. */
export function getWinTier(tiers: WinTier[], amount: number): WinTierName | null {
  for (const tier of tiers) {
    if (amount >= tier.minAmount) return tier.name;
  }
  return null;
}
