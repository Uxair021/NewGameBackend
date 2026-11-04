import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { getMaintenanceState, updateMaintenance } from "../../controllers/maintenanceController";

const router = Router();

router.get("/", asyncHandler(getMaintenanceState));
router.put("/", asyncHandler(updateMaintenance));

export default router;
