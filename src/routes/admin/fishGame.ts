import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  getFishGameConfig,
  getFishGameStats,
  listFishGameSessions,
  updateFishGameConfig,
} from "../../controllers/admin/fishGameController";

const router = Router();

router.get("/config", asyncHandler(getFishGameConfig));
router.put("/config", asyncHandler(updateFishGameConfig));
router.get("/stats", asyncHandler(getFishGameStats));
router.get("/sessions", asyncHandler(listFishGameSessions));

export default router;
