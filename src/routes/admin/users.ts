import { Router } from "express";
import { asyncHandler } from "../../utils/asyncHandler";
import {
  listUsers,
  onlineNow,
  createUser,
  getUser,
  updateUser,
  resetPassword,
  disableUser,
  deleteUser,
  purgeUser,
  adjustUserBalance,
} from "../../controllers/admin/usersController";

const router = Router();

router.get("/online-now", asyncHandler(onlineNow));
router.get("/", asyncHandler(listUsers));
router.post("/", asyncHandler(createUser));
router.get("/:id", asyncHandler(getUser));
router.patch("/:id", asyncHandler(updateUser));
router.post("/:id/reset-password", asyncHandler(resetPassword));
router.patch("/:id/disable", asyncHandler(disableUser));
router.patch("/:id/delete", asyncHandler(deleteUser));
router.delete("/:id/purge", asyncHandler(purgeUser));
router.post("/:id/balance-adjustments", asyncHandler(adjustUserBalance));

export default router;
