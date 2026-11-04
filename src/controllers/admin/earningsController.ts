import { Request, Response } from "express";
import { SpinHistory } from "../../models/SpinHistory";

type Range = "today" | "week" | "month" | "year";

function rangeStart(range: Range): { start: Date; bucketUnit: "hour" | "day" | "month" } {
  const now = new Date();
  switch (range) {
    case "today":
      return { start: new Date(now.getFullYear(), now.getMonth(), now.getDate()), bucketUnit: "hour" };
    case "week":
      return { start: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000), bucketUnit: "day" };
    case "month":
      return { start: new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()), bucketUnit: "day" };
    case "year":
      return { start: new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()), bucketUnit: "month" };
  }
}

export async function getEarnings(req: Request, res: Response): Promise<void> {
  const range = (["today", "week", "month", "year"].includes(String(req.query.range))
    ? req.query.range
    : "today") as Range;

  const { start, bucketUnit } = rangeStart(range);
  const gameId = typeof req.query.gameId === "string" && req.query.gameId ? req.query.gameId : undefined;
  const match: Record<string, unknown> = { createdAt: { $gte: start } };
  if (gameId) match.gameId = gameId;

  const [series, summaryAgg] = await Promise.all([
    SpinHistory.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateTrunc: { date: "$createdAt", unit: bucketUnit } },
          wagered: { $sum: "$betAmount" },
          totalWin: { $sum: "$winAmount" },
          spinCount: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      {
        $project: {
          _id: 0,
          bucket: "$_id",
          wagered: 1,
          totalWin: 1,
          net: { $subtract: ["$wagered", "$totalWin"] },
          spinCount: 1,
        },
      },
    ]),
    SpinHistory.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          wagered: { $sum: "$betAmount" },
          totalWin: { $sum: "$winAmount" },
          spinCount: { $sum: 1 },
        },
      },
    ]),
  ]);

  const summary = summaryAgg[0] ?? { wagered: 0, totalWin: 0, spinCount: 0 };
  const net = summary.wagered - summary.totalWin;
  const holdPercent = summary.wagered > 0 ? (net / summary.wagered) * 100 : 0;
  const rtpActual = summary.wagered > 0 ? (summary.totalWin / summary.wagered) * 100 : 0;

  res.json({
    range,
    gameId: gameId ?? null,
    series,
    summary: {
      wagered: summary.wagered,
      paidOut: summary.totalWin,
      net,
      holdPercent,
      rtpActual,
      spinCount: summary.spinCount,
    },
  });
}
