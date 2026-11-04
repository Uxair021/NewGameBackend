import { Request, Response } from "express";
import { getMaintenance, setMaintenance } from "../services/maintenance";
import { isGeoBlocked } from "../services/geoBlock";

/** Public — the frontend checks this to decide whether to show the maintenance page, or the
 * "not available in your region" page (country block — for THIS visitor's IP). */
export async function getSiteStatus(req: Request, res: Response): Promise<void> {
  const [state, geoBlocked] = await Promise.all([getMaintenance(), isGeoBlocked(req)]);
  res.set("Cache-Control", "no-store");
  res.json({ maintenance: state.enabled, message: state.message, updatedAt: state.updatedAt, geoBlocked });
}

/** Admin — current maintenance state. */
export async function getMaintenanceState(_req: Request, res: Response): Promise<void> {
  res.json(await getMaintenance());
}

/** Admin — switch maintenance mode on / off (optional message for the maintenance page). */
export async function updateMaintenance(req: Request, res: Response): Promise<void> {
  const { enabled, message } = req.body ?? {};
  if (typeof enabled !== "boolean") {
    res.status(400).json({ error: "`enabled` must be true or false" });
    return;
  }
  if (message !== undefined && typeof message !== "string") {
    res.status(400).json({ error: "`message` must be text" });
    return;
  }
  const state = await setMaintenance(enabled, message ?? "", req.userId!);
  console.log(`[maintenance] ${enabled ? "ON" : "OFF"} by admin ${req.userId}`);
  res.json(state);
}
