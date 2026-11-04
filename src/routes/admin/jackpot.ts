import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  getJackpotOverview,
  updateJackpotSettings,
  createJackpotHit,
  updateJackpotHit,
  cancelJackpotHit,
  listJackpotHistory,
  updateJackpotAuto,
  retryJackpotHit,
} from "../../controllers/admin/jackpotController";

const router = Router();

router.get("/", asyncHandler(getJackpotOverview));
router.put("/settings", asyncHandler(updateJackpotSettings));
router.post("/hits", asyncHandler(createJackpotHit));
router.patch("/hits/:id", asyncHandler(updateJackpotHit));
router.patch("/hits/:id/cancel", asyncHandler(cancelJackpotHit));
router.patch("/hits/:id/retry", asyncHandler(retryJackpotHit));
router.put("/auto/:tier", asyncHandler(updateJackpotAuto));
router.get("/history", asyncHandler(listJackpotHistory));

export default router;
