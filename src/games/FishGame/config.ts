export const BET_LEVELS = [0.1, 0.2, 0.5, 1, 2, 5, 10];
export const MIN_BET = BET_LEVELS[0];
export const MAX_BET = BET_LEVELS[BET_LEVELS.length - 1];

/** A session that hasn't sent a batch (the client also sends an empty heartbeat batch every
 * ~30s) for this long is treated as abandoned — tab closed, crash, lost connection — and closed. */
export const SESSION_TIMEOUT_MS = 2 * 60 * 1000;
export const SESSION_SWEEP_INTERVAL_MS = 30 * 1000;
/** The client flushes about once a second at ~5 shots/sec; this leaves room for a batch that got
 * delayed (slow network) without letting one request carry an unbounded amount of work. */
export const MAX_HITS_PER_BATCH = 100;

export const DEFAULT_RTP_PERCENT = 95;
export const MIN_RTP_PERCENT = 50;
export const MAX_RTP_PERCENT = 99;

/** Kill chance per hit is rtp / multiplier, so a multiplier below the RTP would need a kill
 * chance above 100% to hold the target — this floor keeps every species' math valid. */
export const MIN_MULTIPLIER = 2;
export const MAX_MULTIPLIER = 1000;

export interface FishSpeciesDefault {
  /** Matches the species' asset folder under frontEnd/public/symbols/fishGame/ — the frontend
   * sends this back as `speciesId` on every hit. */
  id: string;
  name: string;
  multiplier: number;
}

/** Every species the frontend can spawn, with its default "×N" payout. Admins override the
 * multiplier per species (see models/FishGameConfig.ts); adding a new creature to the game
 * means adding a row here too, or its hits are rejected as an unknown species. */
export const FISH_SPECIES: FishSpeciesDefault[] = [
  { id: "GoldenFish", name: "Golden Fish", multiplier: 2 },
  { id: "AnglusFish", name: "Angler Fish", multiplier: 3 },
  { id: "turtle", name: "Turtle", multiplier: 4 },
  { id: "fish1", name: "Cube-Head Fish", multiplier: 5 },
  { id: "fish2", name: "Fish 2", multiplier: 6 },
  { id: "fish3", name: "Pufferfish", multiplier: 8 },
  { id: "fish4", name: "Spiky Blue Fish", multiplier: 10 },
  { id: "fish5", name: "Angelfish", multiplier: 12 },
  { id: "fish6", name: "Fish 6", multiplier: 15 },
  { id: "fish7", name: "Fish 7", multiplier: 18 },
  { id: "fish8", name: "Green Spotted Fish", multiplier: 20 },
  { id: "fish9", name: "Small Green Fish", multiplier: 22 },
  { id: "fish10", name: "Goggle Dolphin", multiplier: 25 },
  { id: "fish11", name: "Ribbon Fin Fish", multiplier: 28 },
  { id: "fish12", name: "Gold Ribbon Fish", multiplier: 30 },
  { id: "fish13", name: "Spotted Ribbon Fish", multiplier: 35 },
  { id: "fish14", name: "Manta Ray", multiplier: 40 },
  { id: "fish15", name: "Swirl Shark", multiplier: 45 },
  { id: "fish16", name: "Needle Fish", multiplier: 50 },
  { id: "fish17", name: "Armored Fish", multiplier: 55 },
  { id: "fish22", name: "Hammerhead", multiplier: 60 },
  { id: "creature", name: "Rainbow Urchin", multiplier: 65 },
  { id: "shark", name: "Great White Shark", multiplier: 70 },
  { id: "crab1", name: "Jeweled Crab", multiplier: 75 },
  { id: "crab2", name: "Clockwork Crab", multiplier: 80 },
  { id: "crab3", name: "Crab 3", multiplier: 85 },
  { id: "tiger2", name: "Orange Tiger", multiplier: 100 },
  { id: "tiger3", name: "Blue Tiger", multiplier: 110 },
  { id: "tiger1", name: "White Tiger", multiplier: 150 },
  { id: "wheel", name: "Treasure Wheel", multiplier: 200 },
  // Special: catching it freezes every creature's movement for 10–15s (client-side effect only;
  // payout math is the same as any other creature).
  { id: "frozenIce", name: "Frozen Ice", multiplier: 20 },
  { id: "pot", name: "Treasure Chest", multiplier: 60 },
];
