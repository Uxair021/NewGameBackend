import { Schema, model, Document, Types } from "mongoose";
import { JACKPOT_TIERS, JackpotTierKey } from "./JackpotState";

/**
 * scheduled → the admin can still edit/cancel it.
 * locked    → from 2 minutes before scheduledAt (Auto hits are created locked, the moment their
 *             tier is full); the winner is fixed (a random hit with no one
 *             playing yet keeps userId null until someone shows up in a pool game).
 * paid      → delivered and credited; doubles as the win history.
 * cancelled → cancelled by the admin before it locked.
 */
export type JackpotHitStatus = "scheduled" | "locked" | "paid" | "cancelled";
export type JackpotWinnerMode = "random" | "player";
/** date → scheduled by the admin for a time; auto → created by the system the moment its tier
 * reached its max (in Auto mode), already locked. */
export type JackpotHitTrigger = "date" | "auto";

/** One try at paying a hit — the admin's payout report. */
export interface JackpotPayoutAttempt {
  at: Date;
  gameId: string | null;
  ok: boolean;
  /** What was paid (successful tries only). */
  amount: number | null;
  /** Why it failed (failed tries only). */
  reason: string | null;
}

export interface IJackpotHit extends Document {
  _id: Types.ObjectId;
  tier: JackpotTierKey;
  amount: number;
  scheduledAt: Date;
  winnerMode: JackpotWinnerMode;
  trigger: JackpotHitTrigger;
  userId: Types.ObjectId | null;
  status: JackpotHitStatus;
  lockedAt: Date | null;
  paidAt: Date | null;
  /** Game the jackpot was delivered in. */
  gameId: string | null;
  /** Set when a payout try is rejected: the hit is no longer offered to the winner (so they don't
   * get free bonus after free bonus) until an admin presses Retry. The tier keeps its balance. */
  paymentFailed: boolean;
  attempts: JackpotPayoutAttempt[];
  /** The admin who scheduled it; null for Auto hits. */
  createdBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const jackpotHitSchema = new Schema<IJackpotHit>(
  {
    tier: { type: String, enum: JACKPOT_TIERS, required: true },
    amount: { type: Number, required: true, min: 0 },
    scheduledAt: { type: Date, required: true },
    winnerMode: { type: String, enum: ["random", "player"], required: true },
    trigger: { type: String, enum: ["date", "auto"], default: "date" },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    status: { type: String, enum: ["scheduled", "locked", "paid", "cancelled"], default: "scheduled" },
    lockedAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    gameId: { type: String, default: null },
    paymentFailed: { type: Boolean, default: false },
    attempts: {
      type: [
        new Schema<JackpotPayoutAttempt>(
          {
            at: { type: Date, required: true },
            gameId: { type: String, default: null },
            ok: { type: Boolean, required: true },
            amount: { type: Number, default: null },
            reason: { type: String, default: null },
          },
          { _id: false }
        ),
      ],
      default: [],
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

jackpotHitSchema.index({ status: 1, scheduledAt: 1 });
jackpotHitSchema.index({ userId: 1, status: 1 });

export const JackpotHit = model<IJackpotHit>("JackpotHit", jackpotHitSchema);
