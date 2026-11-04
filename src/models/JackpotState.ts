import { Schema, model, Document, Types } from "mongoose";

export const JACKPOT_TIERS = ["jackpot", "mega", "major", "mini"] as const;
export type JackpotTierKey = (typeof JACKPOT_TIERS)[number];

export const JACKPOT_TIER_LABELS: Record<JackpotTierKey, string> = {
  jackpot: "Jackpot",
  mega: "Mega",
  major: "Major",
  mini: "Mini",
};

export type JackpotTierValues = Record<JackpotTierKey, number>;

export const JACKPOT_STATE_KEY = "global";

/** Auto mode for one tier: while enabled, the tier hits by itself every time it reaches its max
 * (instead of on an admin-picked date). `userId` is the admin-picked winner for the next round,
 * or null for a random player; it's cleared once that round locks, so each round defaults to
 * random. */
export interface JackpotTierAuto {
  enabled: boolean;
  userId: Types.ObjectId | null;
}

/**
 * The single shared jackpot pool — there's exactly one document (key "global"). `amounts` are
 * each tier's MAX (it stops filling there); `balances` are how much each tier has collected so
 * far (from the contribution % of every bet placed on a pool game) — a winner gets the balance.
 */
export interface IJackpotState extends Document {
  key: string;
  amounts: JackpotTierValues;
  balances: JackpotTierValues;
  /** Share of every pool-game bet that goes into the pool, in percent (0 while every tier is full). */
  baseContributionPercent: number;
  auto: Record<JackpotTierKey, JackpotTierAuto>;
  /** Slugs of the games taking part in the pool. */
  poolGames: string[];
  createdAt: Date;
  updatedAt: Date;
}

const tierValuesSchema = (defaults: JackpotTierValues) =>
  new Schema<JackpotTierValues>(
    {
      jackpot: { type: Number, required: true, min: 0, default: defaults.jackpot },
      mega: { type: Number, required: true, min: 0, default: defaults.mega },
      major: { type: Number, required: true, min: 0, default: defaults.major },
      mini: { type: Number, required: true, min: 0, default: defaults.mini },
    },
    { _id: false }
  );

const tierAutoSchema = new Schema<JackpotTierAuto>(
  {
    enabled: { type: Boolean, default: false },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { _id: false }
);

export const DEFAULT_JACKPOT_AMOUNTS: JackpotTierValues = { jackpot: 2000, mega: 500, major: 100, mini: 25 };

const jackpotStateSchema = new Schema<IJackpotState>(
  {
    key: { type: String, required: true, unique: true, default: JACKPOT_STATE_KEY },
    amounts: { type: tierValuesSchema(DEFAULT_JACKPOT_AMOUNTS), default: () => ({ ...DEFAULT_JACKPOT_AMOUNTS }) },
    // Balances can't use min: 0 validation via $inc anyway, and must never be negative in practice —
    // the payout path only debits with a `$gte: amount` guard.
    balances: {
      type: tierValuesSchema({ jackpot: 0, mega: 0, major: 0, mini: 0 }),
      default: () => ({ jackpot: 0, mega: 0, major: 0, mini: 0 }),
    },
    baseContributionPercent: { type: Number, required: true, min: 0, max: 50, default: 2 },
    auto: {
      type: new Schema(
        Object.fromEntries(JACKPOT_TIERS.map((t) => [t, { type: tierAutoSchema, default: () => ({}) }])),
        { _id: false }
      ),
      default: () => ({}),
    },
    poolGames: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const JackpotState = model<IJackpotState>("JackpotState", jackpotStateSchema);
