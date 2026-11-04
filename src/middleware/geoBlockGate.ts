import { Request, Response, NextFunction } from "express";
import { isGeoBlocked } from "../services/geoBlock";

/**
 * Country block (admin dashboard): refuses player requests from blocked countries with
 * 451 { geoBlocked: true } — the frontend then shows its "not available in your region" page.
 * Guards the same routes as maintenance mode (games / spins, wallet & profile, jackpot, lobby);
 * login, the public status endpoint and the admin API stay reachable, and admins always pass.
 */
export async function geoBlockGate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (await isGeoBlocked(req)) {
      res.status(451).json({ error: "This website is not available in your region", geoBlocked: true });
      return;
    }
    next();
  } catch (err) {
    next(err);
  }
}
