import { Schema, model, Document } from "mongoose";

export interface IGameSetting extends Document {
  gameId: string;
  rtpMultiplier: number;
  createdAt: Date;
  updatedAt: Date;
}

const gameSettingSchema = new Schema<IGameSetting>(
  {
    gameId: { type: String, required: true, unique: true },
    rtpMultiplier: { type: Number, required: true, default: 1, min: 0.5, max: 1.5 },
  },
  { timestamps: true }
);

export const GameSetting = model<IGameSetting>("GameSetting", gameSettingSchema);
