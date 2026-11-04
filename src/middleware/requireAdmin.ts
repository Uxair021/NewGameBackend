import { Request, Response, NextFunction } from "express";
import { User } from "../models/User";

export async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const user = await User.findById(req.userId);
  if (!user || user.role !== "admin") {
    res.status(403).json({ error: "Admin access required" });
    return;
  }
  next();
}
