import net from "net";
import { Request } from "express";
import { SiteSetting } from "../models/SiteSetting";
import { env } from "../config/env";
import { lookupCountry } from "./geoip";
import { clientIp, isAdminRequest } from "../utils/requestUser";

/**
 * Country block (admin dashboard → Overview): while it's ON, visitors whose IP is in one of the
 * listed countries can't use the site — the API refuses them (middleware/geoBlockGate) and the
 * frontend shows its "not available in your region" page. Admins (valid admin token) and IPs on
 * the allow-list always get through. GEOBLOCK_FORCE_OFF=true on the server overrides the dashboard
 * (emergency off).
 */

export interface GeoBlockState {
  enabled: boolean;
  countries: string[];
  allowIps: string[];
  updatedAt: string | null;
}

export const DEFAULT_BLOCKED_COUNTRIES = ["PK"];

const CACHE_MS = 5000;
let cached: GeoBlockState | null = null;
let cachedAt = 0;

type Doc = {
  geoBlockEnabled?: boolean;
  geoBlockCountries?: string[];
  geoBlockAllowIps?: string[];
  geoBlockUpdatedAt?: Date | null;
} | null;

function toState(doc: Doc): GeoBlockState {
  return {
    enabled: !!doc?.geoBlockEnabled,
    countries: doc?.geoBlockCountries?.length ? doc.geoBlockCountries : DEFAULT_BLOCKED_COUNTRIES,
    allowIps: doc?.geoBlockAllowIps ?? [],
    updatedAt: doc?.geoBlockUpdatedAt ? doc.geoBlockUpdatedAt.toISOString() : null,
  };
}

export async function getGeoBlock(): Promise<GeoBlockState> {
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
  const doc = await SiteSetting.findOne({ key: "site" }).lean();
  cached = toState(doc);
  cachedAt = Date.now();
  return cached;
}

export function normalizeCountries(list: unknown): string[] | null {
  if (!Array.isArray(list)) return null;
  const codes = list.map((c) => String(c).trim().toUpperCase());
  if (codes.some((c) => !/^[A-Z]{2}$/.test(c))) return null;
  return [...new Set(codes)];
}

export function normalizeIps(list: unknown): string[] | null {
  if (!Array.isArray(list)) return null;
  const ips = list.map((ip) => String(ip).trim()).filter(Boolean);
  if (ips.some((ip) => !net.isIP(ip))) return null;
  return [...new Set(ips)];
}

export async function setGeoBlock(
  update: { enabled?: boolean; countries?: string[]; allowIps?: string[] },
  adminId: string
): Promise<GeoBlockState> {
  const set: Record<string, unknown> = { geoBlockUpdatedBy: adminId, geoBlockUpdatedAt: new Date() };
  if (update.enabled !== undefined) set.geoBlockEnabled = update.enabled;
  if (update.countries !== undefined) set.geoBlockCountries = update.countries;
  if (update.allowIps !== undefined) set.geoBlockAllowIps = update.allowIps;
  const doc = await SiteSetting.findOneAndUpdate(
    { key: "site" },
    { $set: set },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();
  cached = toState(doc);
  cachedAt = Date.now();
  return cached;
}

/** Whether this request must be refused by the country block. */
export async function isGeoBlocked(req: Request): Promise<boolean> {
  if (env.geoBlockForceOff) return false;
  const state = await getGeoBlock();
  if (!state.enabled || state.countries.length === 0) return false;
  const ip = clientIp(req);
  if (state.allowIps.includes(ip)) return false;
  const country = lookupCountry(ip);
  if (!country || !state.countries.includes(country)) return false; // unknown → never blocked
  return !(await isAdminRequest(req));
}
