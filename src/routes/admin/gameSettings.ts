import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { getGameSetting, updateGameSetting } from "../../controllers/admin/gameSettingsController";

const router = Router();

router.get("/:gameId", asyncHandler(getGameSetting));
router.patch("/:gameId", asyncHandler(updateGameSetting));

export default router;
