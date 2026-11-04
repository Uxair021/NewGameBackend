import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../utils/jwt";
import { User } from "../models/User";
import { markActive } from "../realtime/presence";

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid Authorization header" });
    return;
  }

  const token = header.slice("Bearer ".length);
  let userId: string;
  try {
    const payload = verifyToken(token);
    userId = payload.userId;
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  try {
    const user = await User.findById(userId).select("disabled deletedAt").lean();
    if (!user || user.disabled || user.deletedAt) {
      res.status(401).json({ error: "Account is no longer active" });
      return;
    }
    req.userId = userId;
    markActive(userId);
    next();
  } catch (err) {
    next(err);
  }
}
