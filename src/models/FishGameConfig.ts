import { Schema, model, Document } from "mongoose";

export interface IFishGameConfig extends Document {
  gameId: string;
  rtpPercent: number;
  /** speciesId -> admin-set multiplier. Species missing here fall back to FISH_SPECIES defaults. */
  speciesMultipliers: Map<string, number>;
  createdAt: Date;
  updatedAt: Date;
}

const fishGameConfigSchema = new Schema<IFishGameConfig>(
  {
    gameId: { type: String, required: true, unique: true },
    rtpPercent: { type: Number, required: true },
    speciesMultipliers: { type: Map, of: Number, default: {} },
  },
  { timestamps: true }
);

export const FishGameConfig = model<IFishGameConfig>("FishGameConfig", fishGameConfigSchema);
