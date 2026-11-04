import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { getGeoBlockState, updateGeoBlock, updateGeoDatabase } from "../../controllers/geoBlockController";

const router = Router();

router.get("/", asyncHandler(getGeoBlockState));
router.put("/", asyncHandler(updateGeoBlock));
router.post("/update-database", asyncHandler(updateGeoDatabase));

export default router;
