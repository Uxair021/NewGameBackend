import fs from "fs";
import path from "path";
import zlib from "zlib";
import { Reader, type CountryResponse } from "maxmind";
import { env } from "../config/env";

/**
 * Visitor IP → country (ISO code, e.g. "PK"), from MaxMind's free GeoLite2-Country database: one
 * file on the server, loaded into memory — a lookup takes microseconds and sends nothing anywhere.
 *
 * The file lives at GEOIP_DB_PATH (default backEnd/data/GeoLite2-Country.mmdb — not in git). With
 * MAXMIND_ACCOUNT_ID + MAXMIND_LICENSE_KEY set, the server downloads it by itself when it's missing
 * or older than 7 days (checked at start-up and daily), and the admin dashboard can trigger an
 * update. Without the database every lookup returns null — the country block then lets everyone
 * through (it never blocks by guessing); the dashboard shows that the database is missing.
 */

export interface GeoDbStatus {
  loaded: boolean;
  /** when MaxMind built the loaded database */
  buildDate: string | null;
  /** last load / download problem, if any */
  error: string | null;
  /** whether automatic downloads are configured (account id + license key) */
  autoUpdate: boolean;
}

const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const DOWNLOAD_URL = "https://download.maxmind.com/geoip/databases/GeoLite2-Country/download?suffix=tar.gz";

let reader: Reader<CountryResponse> | null = null;
let status: GeoDbStatus = { loaded: false, buildDate: null, error: null, autoUpdate: false };

function canDownload(): boolean {
  return !!(env.maxmindAccountId && env.maxmindLicenseKey);
}

/** (Re)loads the database file into memory. */
export function loadGeoDb(): boolean {
  try {
    const db = fs.readFileSync(env.geoipDbPath);
    reader = new Reader<CountryResponse>(db);
    status = {
      loaded: true,
      buildDate: new Date(reader.metadata.buildEpoch).toISOString(),
      error: null,
      autoUpdate: canDownload(),
    };
    return true;
  } catch (err) {
    reader = null;
    const missing = (err as NodeJS.ErrnoException)?.code === "ENOENT";
    status = {
      loaded: false,
      buildDate: null,
      error: missing ? "Country database not installed yet" : `Couldn't read the country database: ${(err as Error).message}`,
      autoUpdate: canDownload(),
    };
    return false;
  }
}

export function getGeoDbStatus(): GeoDbStatus {
  return { ...status, autoUpdate: canDownload() };
}

/** ISO country code of an IP, or null (no database, private / local address, unknown IP). */
export function lookupCountry(ip: string): string | null {
  if (!reader || !ip) return null;
  try {
    const hit = reader.get(ip.replace(/^::ffff:/, ""));
    return hit?.country?.iso_code ?? hit?.registered_country?.iso_code ?? null;
  } catch {
    return null; // not a valid IP
  }
}

/** Pulls the .mmdb file out of MaxMind's .tar.gz (a plain tar after gunzip: 512-byte headers). */
export function extractMmdb(tarGz: Buffer): Buffer | null {
  const tar = zlib.gunzipSync(tarGz);
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    const name = header.subarray(0, 100).toString("utf8").replace(/\0.*$/s, "");
    if (!name) break; // end-of-archive blocks
    const size = parseInt(header.subarray(124, 136).toString("utf8").replace(/\0.*$/s, "").trim() || "0", 8);
    const dataStart = offset + 512;
    if (name.endsWith(".mmdb")) return tar.subarray(dataStart, dataStart + size);
    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  return null;
}

/** Downloads the latest GeoLite2-Country database and loads it. Needs the MaxMind credentials. */
export async function downloadGeoDb(): Promise<GeoDbStatus> {
  if (!canDownload()) {
    status = { ...status, error: "MAXMIND_ACCOUNT_ID / MAXMIND_LICENSE_KEY are not set on the server", autoUpdate: false };
    return status;
  }
  try {
    const auth = Buffer.from(`${env.maxmindAccountId}:${env.maxmindLicenseKey}`).toString("base64");
    const res = await fetch(DOWNLOAD_URL, { headers: { Authorization: `Basic ${auth}` }, redirect: "follow" });
    if (!res.ok) throw new Error(`MaxMind download failed (HTTP ${res.status})`);
    const mmdb = extractMmdb(Buffer.from(await res.arrayBuffer()));
    if (!mmdb) throw new Error("No .mmdb file in the MaxMind download");
    // validate before replacing the current file
    new Reader<CountryResponse>(mmdb);
    fs.mkdirSync(path.dirname(env.geoipDbPath), { recursive: true });
    const tmp = `${env.geoipDbPath}.download`;
    fs.writeFileSync(tmp, mmdb);
    fs.renameSync(tmp, env.geoipDbPath);
    loadGeoDb();
    console.log(`[geoip] country database updated (built ${status.buildDate})`);
  } catch (err) {
    status = { ...status, error: (err as Error).message };
    console.error("[geoip] update failed:", (err as Error).message);
  }
  return getGeoDbStatus();
}

function isStale(): boolean {
  try {
    return Date.now() - fs.statSync(env.geoipDbPath).mtimeMs > MAX_AGE_MS;
  } catch {
    return true; // missing
  }
}

/** Start-up: load the database, download it if missing / old, and re-check once a day. */
export function startGeoIp(): void {
  loadGeoDb();
  const refresh = () => {
    if (canDownload() && isStale()) void downloadGeoDb();
  };
  refresh();
  setInterval(refresh, 24 * 60 * 60 * 1000).unref();
}
