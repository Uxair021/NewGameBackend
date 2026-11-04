import { Schema, model, Document } from "mongoose";

/**
 * The admin-saved RTP config for a game whose spins resolve in the browser. The server never
 * reads or interprets `config` — it only stores what the admin page saved and hands it back to
 * the game when it loads, which validates it and applies its own house rules (see the frontEnd's
 * games/<Game>/api.ts). One document per game.
 */
export interface IClientRtpConfig extends Document {
  gameId: string;
  config: Record<string, unknown>;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const clientRtpConfigSchema = new Schema<IClientRtpConfig>(
  {
    gameId: { type: String, required: true, unique: true },
    config: { type: Schema.Types.Mixed, required: true },
    updatedBy: { type: String, default: null },
  },
  { timestamps: true, minimize: false }
);

export const ClientRtpConfig = model<IClientRtpConfig>("ClientRtpConfig", clientRtpConfigSchema);
