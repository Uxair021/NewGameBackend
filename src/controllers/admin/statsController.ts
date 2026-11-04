import { Request, Response } from "express";
import { User } from "../../models/User";
import { SpinHistory } from "../../models/SpinHistory";
import { ForcedOutcome } from "../../models/ForcedOutcome";
import { listOnlineUserIds } from "../../realtime/presence";

export async function getStats(_req: Request, res: Response): Promise<void> {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [totalPlayers, balanceAgg, todayAgg, pendingForcedOutcomes] = await Promise.all([
    User.countDocuments({ deletedAt: null }),
    User.aggregate([{ $group: { _id: null, totalBalance: { $sum: "$balance" } } }]),
    SpinHistory.aggregate([
      { $match: { createdAt: { $gte: startOfToday } } },
      {
        $group: {
          _id: null,
          spinCount: { $sum: 1 },
          wagered: { $sum: "$betAmount" },
          won: { $sum: "$winAmount" },
        },
      },
    ]),
    ForcedOutcome.countDocuments({ status: "pending" }),
  ]);

  const today = todayAgg[0] ?? { spinCount: 0, wagered: 0, won: 0 };

  res.json({
    totalPlayers,
    onlineNow: listOnlineUserIds().length,
    totalBalance: balanceAgg[0]?.totalBalance ?? 0,
    today: { spinCount: today.spinCount, wagered: today.wagered, won: today.won },
    pendingForcedOutcomes,
  });
}
