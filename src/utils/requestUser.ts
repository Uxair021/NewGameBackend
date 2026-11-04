import { Request } from "express";
import { verifyToken } from "./jwt";
import { User } from "../models/User";

/** True when the request carries a valid token of an active admin — admins are never stopped by
 * maintenance mode or the country block. Any missing / invalid token simply means "not an admin". */
export async function isAdminRequest(req: Request): Promise<boolean> {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return false;
  try {
    const { userId } = verifyToken(header.slice("Bearer ".length));
    const user = await User.findById(userId).select("role disabled deletedAt").lean();
    return !!user && user.role === "admin" && !user.disabled && !user.deletedAt;
  } catch {
    return false;
  }
}

/** The visitor's IP as Express sees it (honours the TRUST_PROXY setting), without the
 * "::ffff:" prefix IPv4 addresses get on dual-stack sockets. */
export function clientIp(req: Request): string {
  return (req.ip ?? req.socket.remoteAddress ?? "").replace(/^::ffff:/, "");
}
