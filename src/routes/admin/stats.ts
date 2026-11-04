import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { getStats } from "../../controllers/admin/statsController";

const router = Router();

router.get("/", asyncHandler(getStats));

export default router;
