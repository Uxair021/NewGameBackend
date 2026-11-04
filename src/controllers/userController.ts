import { Request, Response } from "express";
import { User } from "../models/User";
import { SpinHistory } from "../models/SpinHistory";
import { BalanceAdjustment } from "../models/BalanceAdjustment";
import { emitBalanceEvent } from "../realtime/eventBus";

export async function getBalance(req: Request, res: Response): Promise<void> {
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json({ balance: user.balance });
}

export async function getSpinHistory(req: Request, res: Response): Promise<void> {
  const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10) || 20, 100);
  const history = await SpinHistory.find({ userId: req.userId })
    .sort({ createdAt: -1 })
    .limit(limit);
  res.json({ history });
}

export async function getBalanceHistory(req: Request, res: Response): Promise<void> {
  const limit = Math.min(parseInt(String(req.query.limit ?? "20"), 10) || 20, 100);
  // Only these fields: the admin's name is internal and never reaches the player.
  const history = await BalanceAdjustment.find({ userId: req.userId })
    .select("previousBalance newBalance delta createdAt")
    .sort({ createdAt: -1 })
    .limit(limit);
  res.json({ history });
}

/** Demo-only faucet so the game is playable without a real payment gateway. */
export async function claimDemoCredits(req: Request, res: Response): Promise<void> {
  const amount = 100;
  const user = await User.findById(req.userId);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }

  const previousBalance = user.balance;
  user.balance += amount;
  await user.save();

  const adjustment = await BalanceAdjustment.create({
    userId: user._id,
    previousBalance,
    newBalance: user.balance,
    delta: amount,
    createdBy: user._id,
    type: "demo_credits",
    username: user.username,
    createdByUsername: user.username,
  });

  emitBalanceEvent({
    userId: String(user._id),
    previousBalance,
    newBalance: user.balance,
    delta: amount,
    createdAt: adjustment.createdAt.toISOString(),
  });

  res.json({ balance: user.balance });
}
