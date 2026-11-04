import { Router } from "express";
import { streamTicket, stream, claim, records } from "../controllers/jackpotController";
import { requireAuth } from "../middleware/requireAuth";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// The stream authenticates itself via a short-lived ticket (EventSource can't send custom
// headers), so it must stay outside the Bearer-token requireAuth gate below.
router.get("/stream", asyncHandler(stream));

router.use(requireAuth);
router.get("/stream-ticket", asyncHandler(streamTicket));
router.post("/claim", asyncHandler(claim));
router.get("/records", asyncHandler(records));

export default router;
