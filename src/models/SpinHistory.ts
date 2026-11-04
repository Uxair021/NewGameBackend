import { Schema, model, Document, Types } from "mongoose";
import { recordPoolBet } from "../services/jackpot";

export interface ISpinHistory extends Document {
  userId: Types.ObjectId;
  gameId: string;
  betAmount: number;
  winAmount: number;
  reelSymbols: string[][];
  balanceAfter: number;
  tier: string | null;
  forced: boolean;
  forcedOutcomeId: Types.ObjectId | null;
  createdAt: Date;
}

const spinHistorySchema = new Schema<ISpinHistory>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  gameId: { type: String, required: true },
  betAmount: { type: Number, required: true },
  winAmount: { type: Number, required: true },
  reelSymbols: { type: [[String]], required: true },
  balanceAfter: { type: Number, required: true },
  tier: { type: String, enum: ["BIG WIN", "MEGA WIN", "JACKPOT", null], default: null },
  forced: { type: Boolean, required: true, default: false },
  forcedOutcomeId: { type: Schema.Types.ObjectId, ref: "ForcedOutcome", default: null },
  createdAt: { type: Date, default: () => new Date(), index: true },
});

// Every recorded spin on a pool game feeds the shared jackpot pool — hooked here once rather
// than in each game's /spin-log route. Only fires on create (isNew), never on later updates.
spinHistorySchema.pre("save", function (next) {
  this.$locals.isNewSpin = this.isNew;
  next();
});
spinHistorySchema.post("save", function (doc) {
  if (!doc.$locals.isNewSpin) return;
  recordPoolBet(doc.gameId, doc.betAmount);
});

export const SpinHistory = model<ISpinHistory>("SpinHistory", spinHistorySchema);
