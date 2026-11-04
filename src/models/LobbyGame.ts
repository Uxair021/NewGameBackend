import { Schema, model, Document } from "mongoose";

/** Badges an admin can pin on a lobby card. Keep in sync with GAME_TAGS in the frontend registry. */
export const LOBBY_TAGS = ["HOT", "NEW", "TOP", "JACKPOT", "EXCLUSIVE"] as const;
export type LobbyTag = (typeof LOBBY_TAGS)[number];

/**
 * Admin override for one game's lobby card. A game with no document keeps the frontend
 * registry's defaults (visible, registry tag) — so only games the admin has touched are stored.
 */
export interface ILobbyGame extends Document {
  slug: string;
  visible: boolean;
  /** null = explicitly no badge. */
  tag: LobbyTag | null;
  createdAt: Date;
  updatedAt: Date;
}

const lobbyGameSchema = new Schema<ILobbyGame>(
  {
    slug: { type: String, required: true, unique: true },
    visible: { type: Boolean, required: true, default: true },
    tag: { type: String, enum: [...LOBBY_TAGS, null], default: null },
  },
  { timestamps: true }
);

export const LobbyGame = model<ILobbyGame>("LobbyGame", lobbyGameSchema);
