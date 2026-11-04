import { Schema, model, Document, Types } from "mongoose";

export type FishSessionStatus = "active" | "closed";
/** exit = player left via the game UI; idle = the in-game "still playing?" countdown ran out;
 * timeout = server stopped hearing from the client (tab closed, crash, lost connection);
 * replaced = the player opened the game again elsewhere while this one was still open. */
export type FishSessionCloseReason = "exit" | "idle" | "timeout" | "replaced";

export interface FishSpeciesTotals {
  hits: number;
  kills: number;
  wagered: number;
  won: number;
}

/**
 * One visit to the fish game — from entering to leaving. Replaces one-document-per-bullet: each
 * batch of hits just $inc's these running totals, so the whole visit is a single document no
 * matter how many shots it has.
 */
export interface IFishSession extends Document {
  userId: Types.ObjectId;
  gameId: string;
  status: FishSessionStatus;
  closeReason: FishSessionCloseReason | null;
  startBalance: number;
  endBalance: number | null;
  hits: number;
  kills: number;
  wagered: number;
  won: number;
  /** speciesId -> running totals for that creature within this session. */
  species: Record<string, FishSpeciesTotals>;
  lastActivityAt: Date;
  startedAt: Date;
  endedAt: Date | null;
}

const fishSessionSchema = new Schema<IFishSession>({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  gameId: { type: String, required: true },
  status: { type: String, enum: ["active", "closed"], required: true, default: "active" },
  closeReason: { type: String, enum: ["exit", "idle", "timeout", "replaced", null], default: null },
  startBalance: { type: Number, required: true },
  endBalance: { type: Number, default: null },
  hits: { type: Number, required: true, default: 0 },
  kills: { type: Number, required: true, default: 0 },
  wagered: { type: Number, required: true, default: 0 },
  won: { type: Number, required: true, default: 0 },
  species: { type: Schema.Types.Mixed, default: {} },
  lastActivityAt: { type: Date, required: true, default: () => new Date() },
  startedAt: { type: Date, required: true, default: () => new Date(), index: true },
  endedAt: { type: Date, default: null },
});

fishSessionSchema.index({ userId: 1, status: 1 });
fishSessionSchema.index({ status: 1, lastActivityAt: 1 });

export const FishSession = model<IFishSession>("FishSession", fishSessionSchema);
