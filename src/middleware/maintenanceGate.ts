import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt";
import { User } from "../models/User";
import { getMaintenance } from "../services/maintenance";

/**
 * While maintenance mode is on (admin dashboard), refuses every player request on the routes it
 * guards (games / spins, wallet & profile, jackpot, lobby) with 503 { maintenance: true } — the
 * frontend shows its maintenance page on that. Enforced here on the server, so nobody can keep
 * playing by staying on an already-open page. Admins (valid admin token) always pass. Login,
 * the public status endpoint and the admin API are not behind this gate.
 */
export async function maintenanceGate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const state = await getMaintenance();
    if (!state.enabled) return next();

    const header = req.headers.authorization;
    if (header?.startsWith("Bearer ")) {
      try {
        const { userId } = verifyToken(header.slice("Bearer ".length));
        const user = await User.findById(userId).select("role disabled deletedAt").lean();
        if (user && user.role === "admin" && !user.disabled && !user.deletedAt) return next();
      } catch {
        /* invalid / expired token → treated as a player */
      }
    }

    res.status(503).json({ error: "The site is under maintenance", maintenance: true, message: state.message });
  } catch (err) {
    next(err);
  }
}
