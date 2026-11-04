import { secureRandomInt } from "../../utils/rng";
import { FishGameConfig } from "../../models/FishGameConfig";
import { DEFAULT_RTP_PERCENT, FISH_SPECIES } from "./config";
import { fishGameMeta } from "./meta";

export interface ResolvedSpecies {
  id: string;
  name: string;
  multiplier: number;
  defaultMultiplier: number;
}

export interface ResolvedFishConfig {
  rtpPercent: number;
  species: ResolvedSpecies[];
}

const CONFIG_CACHE_MS = 5000;
let cachedConfig: { value: ResolvedFishConfig; expiresAt: number } | null = null;

/** Used on the hot path (every hit batch): skips the DB read if settings were loaded in the last
 * few seconds. Admin saves call invalidateFishConfigCache(), so on this server a change still
 * applies to the very next batch; other server instances pick it up within CONFIG_CACHE_MS. */
export async function getCachedFishConfig(): Promise<ResolvedFishConfig> {
  if (cachedConfig && cachedConfig.expiresAt > Date.now()) return cachedConfig.value;
  const value = await getFishConfig();
  cachedConfig = { value, expiresAt: Date.now() + CONFIG_CACHE_MS };
  return value;
}

export function invalidateFishConfigCache(): void {
  cachedConfig = null;
}

/** Admin overrides merged over the FISH_SPECIES defaults, read fresh from the DB. */
export async function getFishConfig(): Promise<ResolvedFishConfig> {
  const doc = await FishGameConfig.findOne({ gameId: fishGameMeta.id }).lean();
  const overrides = (doc?.speciesMultipliers ?? {}) as Record<string, number>;

  return {
    rtpPercent: doc?.rtpPercent ?? DEFAULT_RTP_PERCENT,
    species: FISH_SPECIES.map((s) => ({
      id: s.id,
      name: s.name,
      multiplier: overrides[s.id] ?? s.multiplier,
      defaultMultiplier: s.multiplier,
    })),
  };
}

const KILL_ROLL_RESOLUTION = 1_000_000_000;

/**
 * Each hit costs one bet and kills with probability rtp / multiplier, paying multiplier × bet —
 * so every single shot's expected return is exactly rtp × bet no matter which creature it
 * hits. That keeps the configured RTP true per species (not just on average across a session)
 * and means a client choosing which creatures to report hits on can't gain an edge.
 */
export function rollKill(multiplier: number, rtpPercent: number): boolean {
  const killChance = Math.min(1, rtpPercent / 100 / multiplier);
  return secureRandomInt(KILL_ROLL_RESOLUTION) < killChance * KILL_ROLL_RESOLUTION;
}
