import { Request, Response } from "express";
import { Types } from "mongoose";
import bcrypt from "bcryptjs";
import { User } from "../../models/User";
import { BalanceAdjustment } from "../../models/BalanceAdjustment";
import { SpinHistory } from "../../models/SpinHistory";
import { ForcedOutcome } from "../../models/ForcedOutcome";
import { generateNumericCode } from "../../utils/generateCredentials";
import { isOnline } from "../../realtime/presence";
import { emitBalanceEvent } from "../../realtime/eventBus";
import { env } from "../../config/env";
import { encryptPassword, decryptPassword } from "../../utils/passwordVault";

/** Decrypts the stored password (if present) into a plain `password` field, dropping the raw ciphertext. */
function withPlainPassword<T extends { passwordEncrypted?: string | null }>(
  user: T
): Omit<T, "passwordEncrypted"> & { password: string | null } {
  const { passwordEncrypted, ...rest } = user;
  return { ...rest, password: passwordEncrypted ? decryptPassword(passwordEncrypted) : null };
}

async function generateUniqueUsername(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = generateNumericCode(6);
    const exists = await User.exists({ username: candidate });
    if (!exists) return candidate;
  }
  throw new Error("Could not generate a unique username");
}

export async function listUsers(req: Request, res: Response): Promise<void> {
  const status = String(req.query.status ?? "active");
  const filter =
    status === "deleted" ? { deletedAt: { $ne: null } } : status === "all" ? {} : { deletedAt: null };

  const users = await User.find(filter).sort({ createdAt: -1 }).select("-passwordHash +passwordEncrypted");
  res.json({
    users: users.map((u) => withPlainPassword({ ...u.toObject(), online: isOnline(String(u._id)) })),
  });
}

export async function onlineNow(_req: Request, res: Response): Promise<void> {
  const users = await User.find({ deletedAt: null }).select("-passwordHash");
  const online = users.filter((u) => isOnline(String(u._id)));
  res.json({ users: online });
}

export async function createUser(req: Request, res: Response): Promise<void> {
  const { fullName, phone, email, startingBalance } = req.body ?? {};
  const balance = Number.isFinite(Number(startingBalance)) ? Number(startingBalance) : env.startingBalance;

  if (balance < 0) {
    res.status(400).json({ error: "startingBalance must be non-negative" });
    return;
  }

  const username = await generateUniqueUsername();
  const password = generateNumericCode(6);
  const passwordHash = await bcrypt.hash(password, 10);

  const user = await User.create({
    username,
    email: typeof email === "string" && email.trim() ? email.trim().toLowerCase() : null,
    phone: typeof phone === "string" && phone.trim() ? phone.trim() : null,
    fullName: typeof fullName === "string" && fullName.trim() ? fullName.trim() : null,
    passwordHash,
    passwordEncrypted: encryptPassword(password),
    balance,
    role: "user",
  });

  if (balance > 0) {
    const admin = await User.findById(req.userId).select("username").lean();
    // Not fatal: failing here would lose the one-time credentials in the response below.
    await BalanceAdjustment.create({
      userId: user._id,
      previousBalance: 0,
      newBalance: balance,
      delta: balance,
      createdBy: req.userId,
      type: "starting_balance",
      username,
      createdByUsername: admin?.username ?? null,
    }).catch((err) => console.error("Could not record starting balance", err));
  }

  res.status(201).json({
    user: withPlainPassword({ ...user.toObject(), passwordHash: undefined }),
    credentials: { username, password },
  });
}

export async function getUser(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const user = await User.findById(id).select("-passwordHash +passwordEncrypted");
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const [balanceHistory, spins, pendingForcedOutcomes] = await Promise.all([
    BalanceAdjustment.find({ userId: id }).sort({ createdAt: -1 }).limit(50),
    SpinHistory.find({ userId: id }).sort({ createdAt: -1 }).limit(50),
    ForcedOutcome.find({ userId: id, status: "pending" }).sort({ createdAt: -1 }),
  ]);

  res.json({
    user: withPlainPassword({ ...user.toObject(), online: isOnline(id) }),
    balanceHistory,
    spins,
    pendingForcedOutcomes,
  });
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { fullName, phone, email } = req.body ?? {};

  const update: Record<string, unknown> = {};
  const unset: Record<string, ""> = {};

  if (fullName !== undefined) update.fullName = fullName || null;
  if (phone !== undefined) {
    if (phone) update.phone = phone;
    else unset.phone = "";
  }
  if (email !== undefined) {
    if (email) update.email = String(email).toLowerCase();
    else unset.email = "";
  }

  const user = await User.findByIdAndUpdate(
    id,
    { ...(Object.keys(update).length ? { $set: update } : {}), ...(Object.keys(unset).length ? { $unset: unset } : {}) },
    { new: true }
  ).select("-passwordHash");

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ user });
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const user = await User.findById(id);
  if (!user || user.deletedAt) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const password = generateNumericCode(6);
  user.passwordHash = await bcrypt.hash(password, 10);
  user.passwordEncrypted = encryptPassword(password);
  await user.save();

  res.json({ credentials: { username: user.username, password } });
}

export async function disableUser(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const disabled = Boolean(req.body?.disabled);

  const user = await User.findByIdAndUpdate(id, { disabled }, { new: true }).select("-passwordHash");
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ user });
}

export async function deleteUser(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  // Soft delete: destroy the login credential irreversibly but keep history rows for the record.
  const randomHash = await bcrypt.hash(generateNumericCode(20), 10);

  const user = await User.findByIdAndUpdate(
    id,
    { deletedAt: new Date(), passwordHash: randomHash, passwordEncrypted: null },
    { new: true }
  ).select("-passwordHash");

  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ user });
}

export async function purgeUser(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const user = await User.findById(id);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (!user.deletedAt) {
    res.status(400).json({ error: "Only already-deleted users can be purged" });
    return;
  }

  await Promise.all([
    SpinHistory.deleteMany({ userId: id }),
    // Balance records outlive the account: the report still needs to show this money moved. Rows
    // saved before names were stored get the player's name now, while it's still known.
    BalanceAdjustment.updateMany({ userId: id, username: null }, { $set: { username: user.username } }),
    ForcedOutcome.deleteMany({ userId: id }),
    User.findByIdAndDelete(id),
  ]);

  res.status(204).send();
}

const roundCents = (n: number) => Math.round(n * 100) / 100;

/**
 * Adds to or removes from a player's balance as one atomic update, so it can't overwrite a spin
 * being applied at the same moment (see services/spinBalance.ts). A removal can't take the balance
 * below zero. Every change is recorded with who made it — see balanceReportController.
 */
export async function adjustUserBalance(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { action } = req.body ?? {};
  const amount = Number(req.body?.amount);

  if (action !== "add" && action !== "remove") {
    res.status(400).json({ error: 'action must be "add" or "remove"' });
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0 || Math.abs(roundCents(amount) - amount) > 1e-9) {
    res.status(400).json({ error: "Amount must be above 0 with at most 2 decimal places" });
    return;
  }
  if (!Types.ObjectId.isValid(id)) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const delta = action === "add" ? amount : -amount;
  const applyDelta = (d: number) => [{ $set: { balance: { $round: [{ $add: ["$balance", d] }, 2] } } }];
  const admin = await User.findById(req.userId).select("username").lean();

  const user = await User.findOneAndUpdate(
    { _id: id, deletedAt: null, ...(action === "remove" ? { balance: { $gte: amount } } : {}) },
    applyDelta(delta),
    { new: true }
  ).select("-passwordHash");

  if (!user) {
    const existing = await User.findOne({ _id: id, deletedAt: null }).select("balance").lean();
    if (!existing) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    res.status(400).json({ error: `Can't remove more than the player has ($${existing.balance.toFixed(2)})` });
    return;
  }

  const previousBalance = roundCents(user.balance - delta);
  let adjustment;
  try {
    adjustment = await BalanceAdjustment.create({
      userId: user._id,
      previousBalance,
      newBalance: user.balance,
      delta,
      createdBy: req.userId,
      type: action === "add" ? "admin_add" : "admin_remove",
      username: user.username,
      createdByUsername: admin?.username ?? null,
    });
  } catch (err) {
    // A balance change must never go unrecorded — undo it if the record couldn't be saved.
    await User.findByIdAndUpdate(id, applyDelta(-delta));
    throw err;
  }

  emitBalanceEvent({
    userId: String(user._id),
    previousBalance,
    newBalance: user.balance,
    delta,
    createdAt: adjustment.createdAt.toISOString(),
  });

  res.json({ user: user.toObject() });
}
