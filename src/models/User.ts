import { Schema, model, Document, Types } from "mongoose";

export type UserRole = "user" | "admin";

export interface IUser extends Document {
  _id: Types.ObjectId;
  email: string | null;
  username: string;
  passwordHash: string;
  /** AES-256-GCM ciphertext of the current plaintext password — lets admins view it on demand. */
  passwordEncrypted: string | null;
  balance: number;
  role: UserRole;
  fullName: string | null;
  phone: string | null;
  disabled: boolean;
  deletedAt: Date | null;
  createdAt: Date;
}

const userSchema = new Schema<IUser>({
  email: { type: String, default: null, lowercase: true, trim: true },
  username: { type: String, required: true, unique: true, trim: true },
  passwordHash: { type: String, required: true },
  passwordEncrypted: { type: String, default: null, select: false },
  balance: { type: Number, required: true, default: 0 },
  role: { type: String, enum: ["user", "admin"], required: true, default: "user" },
  fullName: { type: String, default: null, trim: true },
  phone: { type: String, default: null, trim: true },
  disabled: { type: Boolean, required: true, default: false },
  deletedAt: { type: Date, default: null },
  createdAt: { type: Date, default: () => new Date() },
});

// Plain `unique: true, sparse: true` on the field would still collide once more than one
// document stores an explicit `null` (our schema defaults email/phone to null rather than
// leaving them unset) — sparse indexes only skip documents missing the field entirely, not
// ones where it's present-but-null. A partial index that only indexes real strings avoids that.
userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: "string" } } });
userSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: "string" } } });

export const User = model<IUser>("User", userSchema);
