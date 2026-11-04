import { SiteSetting } from "../models/SiteSetting";

export interface MaintenanceState {
  enabled: boolean;
  message: string;
  updatedAt: string | null;
}

/** Re-read from the database at most this often — the flag is checked on every player request,
 * and with more than one server instance a change made on one reaches the others within this. */
const CACHE_MS = 5000;

let cached: MaintenanceState | null = null;
let cachedAt = 0;

function toState(doc: { maintenanceEnabled: boolean; maintenanceMessage?: string; maintenanceUpdatedAt?: Date | null } | null): MaintenanceState {
  return {
    enabled: !!doc?.maintenanceEnabled,
    message: doc?.maintenanceMessage ?? "",
    updatedAt: doc?.maintenanceUpdatedAt ? doc.maintenanceUpdatedAt.toISOString() : null,
  };
}

export async function getMaintenance(): Promise<MaintenanceState> {
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
  const doc = await SiteSetting.findOne({ key: "site" }).lean();
  cached = toState(doc);
  cachedAt = Date.now();
  return cached;
}

export async function setMaintenance(enabled: boolean, message: string, adminId: string): Promise<MaintenanceState> {
  const doc = await SiteSetting.findOneAndUpdate(
    { key: "site" },
    {
      $set: {
        maintenanceEnabled: enabled,
        maintenanceMessage: message.trim().slice(0, 500),
        maintenanceUpdatedBy: adminId,
        maintenanceUpdatedAt: new Date(),
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  cached = toState(doc);
  cachedAt = Date.now();
  return cached;
}
