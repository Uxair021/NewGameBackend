import { Request, Response } from "express";
import { GameSetting } from "../../models/GameSetting";

export async function getGameSetting(req: Request, res: Response): Promise<void> {
  const { gameId } = req.params;
  const setting = await GameSetting.findOne({ gameId });
  res.json({ gameId, rtpMultiplier: setting?.rtpMultiplier ?? 1 });
}

export async function updateGameSetting(req: Request, res: Response): Promise<void> {
  const { gameId } = req.params;
  const rtpMultiplier = Number(req.body?.rtpMultiplier);

  if (!Number.isFinite(rtpMultiplier) || rtpMultiplier < 0.5 || rtpMultiplier > 1.5) {
    res.status(400).json({ error: "rtpMultiplier must be between 0.5 and 1.5" });
    return;
  }

  const setting = await GameSetting.findOneAndUpdate(
    { gameId },
    { $set: { rtpMultiplier } },
    { upsert: true, new: true }
  );

  res.json({ gameId, rtpMultiplier: setting.rtpMultiplier });
}
