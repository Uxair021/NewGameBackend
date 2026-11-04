import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import { getBalanceReport, exportBalanceReport } from "../../controllers/admin/balanceReportController";

const router = Router();

router.get("/", asyncHandler(getBalanceReport));
router.get("/export", asyncHandler(exportBalanceReport));

export default router;
