import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { getEarnings } from "../../controllers/admin/earningsController";

const router = Router();

router.get("/", asyncHandler(getEarnings));

export default router;
