import { GameSetting } from "../models/GameSetting";

/** Always reads fresh from the DB (no caching) so an admin's RTP change applies to the very next spin. */
export async function getRtpMultiplier(gameId: string): Promise<number> {
  const setting = await GameSetting.findOne({ gameId }).lean();
  return setting?.rtpMultiplier ?? 1;
}
