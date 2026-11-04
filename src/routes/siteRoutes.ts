import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler";
import { getSiteStatus } from "../controllers/maintenanceController";

const router = Router();

// Public — whether the site is in maintenance mode (never behind the maintenance gate).
router.get("/status", asyncHandler(getSiteStatus));

export default router;
