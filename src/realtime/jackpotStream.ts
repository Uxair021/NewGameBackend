import { Response } from "express";
import { randomUUID } from "crypto";
import { markActive } from "./presence";

const PING_INTERVAL_MS = 20_000;

/**
 * One open game = one SSE connection here. The connection replaces the old 20s heartbeat: while
 * it's open the player counts as playing that game (the jackpot service reads `listStreamClients`
 * to pick random winners), and the server pushes the live tier balances and any jackpot hit
 * that's ready for them — so the game never polls.
 */
export interface StreamClient {
  id: string;
  userId: string;
  gameId: string;
  /** The game can force its feature and pay a jackpot (not every game is wired up yet). */
  canDeliver: boolean;
  res: Response;
}

const clients = new Map<string, StreamClient>();

function write(client: StreamClient, frame: string): void {
  try {
    client.res.write(frame);
  } catch {
    /* socket already gone — its close handler removes it */
  }
}

/** Builds an SSE frame once so a broadcast doesn't re-serialise the payload per client. */
export function sseFrame(event: string, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export function openStream(
  res: Response,
  info: { userId: string; gameId: string; canDeliver: boolean }
): StreamClient {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    // Stops nginx-style proxies from buffering the stream.
    "X-Accel-Buffering": "no",
  });
  res.flushHeaders();

  const client: StreamClient = { id: randomUUID(), ...info, res };
  clients.set(client.id, client);
  markActive(client.userId);

  // Keeps the connection (and the player's online status) alive while they sit in the game.
  const pingId = setInterval(() => {
    write(client, ": ping\n\n");
    markActive(client.userId);
  }, PING_INTERVAL_MS);

  res.on("close", () => {
    clearInterval(pingId);
    clients.delete(client.id);
  });
  return client;
}

export function listStreamClients(): StreamClient[] {
  return Array.from(clients.values());
}

export function sendFrame(client: StreamClient, frame: string): void {
  write(client, frame);
}
