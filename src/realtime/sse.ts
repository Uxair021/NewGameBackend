import { Request, Response } from "express";
import { EventEmitter } from "events";

const PING_INTERVAL_MS = 20_000;

/** Subscribes this response to the named events on bus and streams them as SSE until the client disconnects. */
export function registerSseClient(req: Request, res: Response, bus: EventEmitter, eventNames: string[]): void {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  res.flushHeaders();

  const listeners: Array<{ name: string; fn: (payload: unknown) => void }> = eventNames.map((name) => {
    const fn = (payload: unknown) => {
      res.write(`event: ${name}\ndata: ${JSON.stringify(payload)}\n\n`);
    };
    bus.on(name, fn);
    return { name, fn };
  });

  const pingId = setInterval(() => {
    res.write(": ping\n\n");
  }, PING_INTERVAL_MS);

  req.on("close", () => {
    clearInterval(pingId);
    for (const { name, fn } of listeners) bus.off(name, fn);
  });
}
