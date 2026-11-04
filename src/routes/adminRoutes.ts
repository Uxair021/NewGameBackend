import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth";
import { requireAdmin } from "../middleware/requireAdmin";
import { asyncHandler } from "../utils/asyncHandler";
import { streamEvents } from "../controllers/admin/feedController";
import usersRoutes from "./admin/users";
import balanceReportRoutes from "./admin/balanceReport";
import forcedOutcomesRoutes from "./admin/forcedOutcomes";
import gameSettingsRoutes from "./admin/gameSettings";
import paytableRoutes from "./admin/paytable";
import earningsRoutes from "./admin/earnings";
import statsRoutes from "./admin/stats";
import feedRoutes from "./admin/feed";
import fishGameRoutes from "./admin/fishGame";
import jackpotRoutes from "./admin/jackpot";
import lobbyRoutes from "./admin/lobby";
import rtpConfigRoutes from "./admin/rtpConfig";
import maintenanceRoutes from "./admin/maintenance";
import geoBlockRoutes from "./admin/geoBlock";

const router = Router();

// SSE authenticates itself via a short-lived ticket (EventSource can't send custom
// headers), so this must stay outside the Bearer-token requireAuth/requireAdmin gate below.
router.get("/events", asyncHandler(streamEvents));

router.use(requireAuth, asyncHandler(requireAdmin));
router.use("/users", usersRoutes);
router.use("/balance-report", balanceReportRoutes);
router.use("/forced-outcomes", forcedOutcomesRoutes);
router.use("/game-settings", gameSettingsRoutes);
router.use("/paytable", paytableRoutes);
router.use("/earnings", earningsRoutes);
router.use("/stats", statsRoutes);
router.use("/fish-game", fishGameRoutes);
router.use("/jackpot", jackpotRoutes);
router.use("/lobby", lobbyRoutes);
router.use("/rtp-config", rtpConfigRoutes);
router.use("/maintenance", maintenanceRoutes);
router.use("/geo-block", geoBlockRoutes);
router.use("/", feedRoutes);

export default router;
