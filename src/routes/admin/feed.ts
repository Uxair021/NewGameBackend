import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { getSseTicket, getRecentSpins } from "../../controllers/admin/feedController";

const router = Router();

router.get("/sse-events-ticket", asyncHandler(getSseTicket));
router.get("/spins/recent", asyncHandler(getRecentSpins));

export default router;
