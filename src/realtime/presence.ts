import { emitPresenceEvent } from "./eventBus";

const ONLINE_THRESHOLD_MS = 60_000;
const SWEEP_INTERVAL_MS = 15_000;
const PRUNE_AFTER_MS = 10 * 60_000;

const lastSeen = new Map<string, number>();
const online = new Set<string>();

export function markActive(userId: string): void {
  const now = Date.now();
  lastSeen.set(userId, now);
  if (!online.has(userId)) {
    online.add(userId);
    emitPresenceEvent({ userId, online: true });
  }
}

export function markInactive(userId: string): void {
  lastSeen.delete(userId);
  if (online.has(userId)) {
    online.delete(userId);
    emitPresenceEvent({ userId, online: false });
  }
}

export function isOnline(userId: string): boolean {
  return online.has(userId);
}

export function listOnlineUserIds(): string[] {
  return Array.from(online);
}

setInterval(() => {
  const now = Date.now();
  for (const [userId, seenAt] of lastSeen) {
    if (now - seenAt > ONLINE_THRESHOLD_MS && online.has(userId)) {
      online.delete(userId);
      emitPresenceEvent({ userId, online: false });
    }
    if (now - seenAt > PRUNE_AFTER_MS) {
      lastSeen.delete(userId);
    }
  }
}, SWEEP_INTERVAL_MS).unref();
