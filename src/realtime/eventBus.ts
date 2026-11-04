import { EventEmitter } from "events";

export interface SpinEvent {
  userId: string;
  username: string;
  gameId: string;
  bet: number;
  winAmount: number;
  tier: string | null;
  forced: boolean;
  balanceAfter: number;
  createdAt: string;
}

export interface BalanceEvent {
  userId: string;
  previousBalance: number;
  newBalance: number;
  delta: number;
  createdAt: string;
}

export interface PresenceEvent {
  userId: string;
  online: boolean;
}

export const eventBus = new EventEmitter();
eventBus.setMaxListeners(50);

export function emitSpinEvent(payload: SpinEvent): void {
  eventBus.emit("spin", payload);
}

export function emitBalanceEvent(payload: BalanceEvent): void {
  eventBus.emit("balance", payload);
}

export function emitPresenceEvent(payload: PresenceEvent): void {
  eventBus.emit("presence", payload);
}
