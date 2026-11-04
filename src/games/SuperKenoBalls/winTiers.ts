import { WinTierName, WinTier, getWinTier as getWinTierGeneric } from "../../gameTiers";

export type { WinTierName };

/** Ordered highest -> lowest so getWinTier can short-circuit on the first match. */
export const WIN_TIERS: WinTier[] = [
  { name: "JACKPOT", minAmount: 750 },
  { name: "MEGA WIN", minAmount: 150 },
  { name: "BIG WIN", minAmount: 25 },
];

/** Looks up the celebration tier for a draw's credited win amount. */
export function getWinTier(winAmount: number): WinTierName | null {
  return getWinTierGeneric(WIN_TIERS, winAmount);
}
