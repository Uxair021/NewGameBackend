import { Schema, model, Document, Types } from "mongoose";
import { WinTierName } from "../gameTiers";

export type ForcedOutcomeStatus = "pending" | "consumed" | "cancelled";

export interface IForcedOutcome extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  gameId: string;
  targetTier: WinTierName;
  status: ForcedOutcomeStatus;
  createdBy: Types.ObjectId;
  consumedAt: Date | null;
  consumedSpinId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const forcedOutcomeSchema = new Schema<IForcedOutcome>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    gameId: { type: String, required: true },
    targetTier: { type: String, enum: ["BIG WIN", "MEGA WIN", "JACKPOT"], required: true },
    status: { type: String, enum: ["pending", "consumed", "cancelled"], default: "pending" },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    consumedAt: { type: Date, default: null },
    consumedSpinId: { type: Schema.Types.ObjectId, ref: "SpinHistory", default: null },
  },
  { timestamps: true }
);

forcedOutcomeSchema.index({ userId: 1, gameId: 1, status: 1, createdAt: 1 });

export const ForcedOutcome = model<IForcedOutcome>("ForcedOutcome", forcedOutcomeSchema);
