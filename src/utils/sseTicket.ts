import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import { env } from "../config/env";

const TICKET_TTL_SECONDS = 60;
const usedTickets = new Set<string>();

interface TicketPayload {
  userId: string;
  jti: string;
}

/** Short-lived, single-use ticket so EventSource (no custom headers) can authenticate an SSE connection. */
export function mintSseTicket(userId: string): string {
  const jti = randomUUID();
  return jwt.sign({ userId, jti }, env.jwtSecret, { expiresIn: TICKET_TTL_SECONDS });
}

export function consumeSseTicket(ticket: string): { userId: string } | null {
  try {
    const payload = jwt.verify(ticket, env.jwtSecret) as TicketPayload;
    if (usedTickets.has(payload.jti)) return null;
    usedTickets.add(payload.jti);
    setTimeout(() => usedTickets.delete(payload.jti), TICKET_TTL_SECONDS * 1000 + 5000).unref();
    return { userId: payload.userId };
  } catch {
    return null;
  }
}
