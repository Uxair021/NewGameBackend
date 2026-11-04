import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import { IUser, User, UserRole } from "../models/User";
import { BalanceAdjustment } from "../models/BalanceAdjustment";
import { signToken } from "../utils/jwt";
import { env } from "../config/env";
import { encryptPassword } from "../utils/passwordVault";

function publicUser(user: {
  _id: unknown;
  email: string | null;
  username: string;
  balance: number;
  role: UserRole;
}) {
  return {
    id: String(user._id),
    email: user.email,
    username: user.username,
    balance: user.balance,
    role: user.role,
  };
}

/** Promotes the user to admin if their email is in ADMIN_EMAILS and they aren't already. */
async function syncAdminRole(user: IUser): Promise<IUser> {
  const shouldBeAdmin = Boolean(user.email) && env.adminEmails.includes(user.email as string);
  if (shouldBeAdmin && user.role !== "admin") {
    user.role = "admin";
    await user.save();
  }
  return user;
}

export async function register(req: Request, res: Response): Promise<void> {
  const { email, username, password } = req.body ?? {};

  if (typeof email !== "string" || typeof username !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "email, username and password are required" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    res.status(409).json({ error: "An account with this email already exists" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({
    email: normalizedEmail,
    username: username.trim(),
    passwordHash,
    passwordEncrypted: encryptPassword(password),
    balance: env.startingBalance,
    role: env.adminEmails.includes(normalizedEmail) ? "admin" : "user",
  });

  if (user.balance > 0) {
    // Not fatal: the account already exists, so failing here would strand the sign-up.
    await BalanceAdjustment.create({
      userId: user._id,
      previousBalance: 0,
      newBalance: user.balance,
      delta: user.balance,
      createdBy: user._id,
      type: "starting_balance",
      username: user.username,
      createdByUsername: user.username,
    }).catch((err) => console.error("Could not record starting balance", err));
  }

  const token = signToken({ userId: String(user._id) });
  res.status(201).json({ token, user: publicUser(user) });
}

/** Accepts either an email or a username as the login identifier (admin-generated accounts have no email). */
export async function login(req: Request, res: Response): Promise<void> {
  const { identifier, password } = req.body ?? {};

  if (typeof identifier !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "identifier and password are required" });
    return;
  }

  const value = identifier.trim();
  const user = await User.findOne({
    $or: [{ email: value.toLowerCase() }, { username: value }],
  });
  if (!user || user.deletedAt) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }
  if (user.disabled) {
    res.status(403).json({ error: "This account has been disabled" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  await syncAdminRole(user);

  const token = signToken({ userId: String(user._id) });
  res.json({ token, user: publicUser(user) });
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ user: publicUser(user) });
}
