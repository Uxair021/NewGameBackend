import { Request, Response } from "express";
import { ForcedOutcome } from "../../models/ForcedOutcome";
import { WIN_TIER_NAMES } from "../../gameTiers";

const VALID_TIERS = new Set(WIN_TIER_NAMES);

export async function createForcedOutcome(req: Request, res: Response): Promise<void> {
  const { userId, gameId, targetTier } = req.body ?? {};

  if (
    typeof userId !== "string" ||
    typeof gameId !== "string" ||
    !gameId ||
    typeof targetTier !== "string" ||
    !VALID_TIERS.has(targetTier as never)
  ) {
    res.status(400).json({ error: "userId, gameId, and a valid targetTier are required" });
    return;
  }

  const outcome = await ForcedOutcome.create({
    userId,
    gameId,
    targetTier,
    status: "pending",
    createdBy: req.userId,
  });

  res.status(201).json({ forcedOutcome: outcome });
}

export async function listForcedOutcomes(req: Request, res: Response): Promise<void> {
  const { userId, gameId, status } = req.query;
  const filter: Record<string, unknown> = {};
  if (typeof userId === "string") filter.userId = userId;
  if (typeof gameId === "string") filter.gameId = gameId;
  if (typeof status === "string") filter.status = status;

  const outcomes = await ForcedOutcome.find(filter).sort({ createdAt: -1 }).limit(100);
  res.json({ forcedOutcomes: outcomes });
}

export async function cancelForcedOutcome(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const outcome = await ForcedOutcome.findOneAndUpdate(
    { _id: id, status: "pending" },
    { $set: { status: "cancelled" } },
    { new: true }
  );

  if (!outcome) {
    res.status(404).json({ error: "No pending forced outcome with that id" });
    return;
  }
  res.json({ forcedOutcome: outcome });
}
