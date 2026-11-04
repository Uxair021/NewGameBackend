import { Router } from "express";
import { getLobbyGames, streamLobbyGames } from "../controllers/lobbyController";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Public — the home page is browsable signed-out.
router.get("/games", asyncHandler(getLobbyGames));
router.get("/stream", asyncHandler(streamLobbyGames));

export default router;
