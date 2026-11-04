import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { getPaytable, updatePaytable } from "../../controllers/admin/paytableController";

const router = Router();

router.get("/:gameId", asyncHandler(getPaytable));
router.put("/:gameId", asyncHandler(updatePaytable));

export default router;
