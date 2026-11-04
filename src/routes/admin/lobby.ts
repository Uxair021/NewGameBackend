import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { getLobbyGames, updateLobbyGame } from "../../controllers/lobbyController";

const router = Router();

router.get("/", asyncHandler(getLobbyGames));
router.put("/:slug", asyncHandler(updateLobbyGame));

export default router;
