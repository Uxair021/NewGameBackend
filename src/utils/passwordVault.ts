import crypto from "crypto";
import { env } from "../config/env";

// Reversible storage for player passwords, per explicit product decision: admins need to view
// a player's current password on demand (not just at creation), not just be told it once.
// Login itself still checks the bcrypt hash in User.passwordHash — this is a separate,
// admin-only recovery channel. Key is derived (scrypt, domain-separated) from JWT_SECRET so no
// extra .env entry is required; a real deployment should give this its own dedicated secret.
const KEY = crypto.scryptSync(env.jwtSecret, "texas-slots-password-vault", 32);
const IV_LENGTH = 12;

export function encryptPassword(plain: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decryptPassword(encoded: string): string {
  const raw = Buffer.from(encoded, "base64");
  const iv = raw.subarray(0, IV_LENGTH);
  const authTag = raw.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = raw.subarray(IV_LENGTH + 16);
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, iv);
  decipher.setAuthTag(authTag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plain.toString("utf8");
}
