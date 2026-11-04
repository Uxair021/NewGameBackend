import { Request, Response } from "express";
import { env } from "../config/env";
import { User } from "../models/User";
import { SiteSetting } from "../models/SiteSetting";
import { getGeoBlock, normalizeCountries, normalizeIps, setGeoBlock } from "../services/geoBlock";
import { downloadGeoDb, getGeoDbStatus, lookupCountry } from "../services/geoip";
import { clientIp } from "../utils/requestUser";

async function fullState(req: Request) {
  const state = await getGeoBlock();
  const doc = await SiteSetting.findOne({ key: "site" }).select("geoBlockUpdatedBy").lean();
  const by = doc?.geoBlockUpdatedBy ? await User.findById(doc.geoBlockUpdatedBy).select("username").lean() : null;
  const ip = clientIp(req);
  return {
    ...state,
    updatedBy: by?.username ?? null,
    /** GEOBLOCK_FORCE_OFF=true on the server overrides the dashboard */
    forcedOff: env.geoBlockForceOff,
    database: getGeoDbStatus(),
    /** the admin's own connection, so they can see whether the block would affect them */
    you: { ip, country: lookupCountry(ip) },
  };
}

/** Admin — current country-block settings + database status + the admin's own IP / country. */
export async function getGeoBlockState(req: Request, res: Response): Promise<void> {
  res.json(await fullState(req));
}

/** Admin — turn the block on / off, change the countries or the IP allow-list. */
export async function updateGeoBlock(req: Request, res: Response): Promise<void> {
  const { enabled, countries, allowIps } = req.body ?? {};
  const update: { enabled?: boolean; countries?: string[]; allowIps?: string[] } = {};

  if (enabled !== undefined) {
    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "`enabled` must be true or false" });
      return;
    }
    update.enabled = enabled;
  }
  if (countries !== undefined) {
    const list = normalizeCountries(countries);
    if (!list) {
      res.status(400).json({ error: "`countries` must be a list of 2-letter country codes (e.g. PK)" });
      return;
    }
    update.countries = list;
  }
  if (allowIps !== undefined) {
    const list = normalizeIps(allowIps);
    if (!list) {
      res.status(400).json({ error: "`allowIps` must be a list of valid IP addresses" });
      return;
    }
    update.allowIps = list;
  }

  await setGeoBlock(update, req.userId!);
  console.log(`[geo-block] updated by admin ${req.userId}:`, JSON.stringify(update));
  res.json(await fullState(req));
}

/** Admin — download the latest country database now (needs the MaxMind credentials on the server). */
export async function updateGeoDatabase(req: Request, res: Response): Promise<void> {
  await downloadGeoDb();
  res.json(await fullState(req));
}
