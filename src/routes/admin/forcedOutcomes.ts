import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  createForcedOutcome,
  listForcedOutcomes,
  cancelForcedOutcome,
} from "../../controllers/admin/forcedOutcomesController";

const router = Router();

router.post("/", asyncHandler(createForcedOutcome));
router.get("/", asyncHandler(listForcedOutcomes));
router.patch("/:id/cancel", asyncHandler(cancelForcedOutcome));

export default router;
