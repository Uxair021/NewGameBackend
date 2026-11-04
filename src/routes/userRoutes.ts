import { Router } from "express";
import { getBalance, getSpinHistory, getBalanceHistory, claimDemoCredits } from "../controllers/userController";
import { requireAuth } from "../middleware/requireAuth";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

router.use(requireAuth);
router.get("/balance", asyncHandler(getBalance));
router.get("/spin-history", asyncHandler(getSpinHistory));
router.get("/balance-history", asyncHandler(getBalanceHistory));
router.post("/demo-credits", asyncHandler(claimDemoCredits));

export default router;
