import { Types } from "mongoose";
import { User } from "../models/User";

/**
 * Applies one already-played spin to the player's stored balance: -bet +win, as a single atomic
 * update (rounded to cents) so concurrent spin logs can never overwrite each other. The games
 * resolve spins in the browser and only report them through their /spin-log endpoint, so this is
 * what keeps the server balance — the one read on page load / refresh / account page — in step
 * with what the player saw. Returns the new balance, or null if the user no longer exists.
 */
export async function applySpinToBalance(userId: string | Types.ObjectId, betAmount: number, winAmount: number): Promise<number | null> {
  const delta = Math.round((winAmount - betAmount) * 100) / 100;
  const updated = await User.findByIdAndUpdate(
    userId,
    [{ $set: { balance: { $round: [{ $add: ["$balance", delta] }, 2] } } }],
    { new: true, projection: { balance: 1 } }
  ).lean();
  return updated ? updated.balance : null;
}

/** Credits a payout that isn't a spin (e.g. a jackpot) the same atomic way. */
export async function creditBalance(userId: string | Types.ObjectId, amount: number): Promise<number | null> {
  return applySpinToBalance(userId, 0, amount);
}
