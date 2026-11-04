import { Schema, model, Document, Types } from "mongoose";

/** Rows saved before these types existed have `type: null` — see balanceReportController. */
export type BalanceAdjustmentType = "admin_add" | "admin_remove" | "starting_balance" | "demo_credits";

export interface IBalanceAdjustment extends Document {
  userId: Types.ObjectId;
  previousBalance: number;
  newBalance: number;
  delta: number;
  createdBy: Types.ObjectId;
  type: BalanceAdjustmentType | null;
  /** Names as they were at the time, so the record still reads correctly after an account is purged. */
  username: string | null;
  createdByUsername: string | null;
  createdAt: Date;
}

const balanceAdjustmentSchema = new Schema<IBalanceAdjustment>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  previousBalance: { type: Number, required: true },
  newBalance: { type: Number, required: true },
  delta: { type: Number, required: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  type: { type: String, enum: ["admin_add", "admin_remove", "starting_balance", "demo_credits"], default: null },
  username: { type: String, default: null },
  createdByUsername: { type: String, default: null },
  createdAt: { type: Date, default: () => new Date() },
});

balanceAdjustmentSchema.index({ userId: 1, createdAt: -1 });
balanceAdjustmentSchema.index({ createdAt: -1 });

export const BalanceAdjustment = model<IBalanceAdjustment>("BalanceAdjustment", balanceAdjustmentSchema);
