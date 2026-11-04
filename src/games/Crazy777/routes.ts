import { Router, Request, Response } from "express";
import { SpinHistory } from "../../models/SpinHistory";
import { User } from "../../models/User";
import { applySpinToBalance } from "../../services/spinBalance";
import { requireAuth } from "../../middleware/requireAuth";
import { asyncHandler } from "../../utils/asyncHandler";
import { emitSpinEvent } from "../../realtime/eventBus";
import { crazy777Meta } from "./meta";

const WIN_TIERS = ["BIG WIN", "MEGA WIN", "JACKPOT"] as const;
type WinTierName = (typeof WIN_TIERS)[number];

const router = Router();

/**
 * Crazy 777 is a fully offline, client-side test game — RNG, win math, and balance are computed
 * entirely in the browser (see frontEnd/src/games/Crazy777/api.ts), nothing here decides or
 * verifies the outcome. This is a pure write-only logging sink: the client reports what already
 * happened, purely for record-keeping alongside every other game's SpinHistory, and the call is
 * fire-and-forget on the frontend — nothing in gameplay depends on it succeeding. betAmount can be
 * 0 (a respin round stakes nothing, same as a free spin elsewhere).
 */
router.post(
  "/spin-log",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { betAmount, winAmount, reelSymbols, balanceAfter, tier } = req.body ?? {};

    if (!Number.isFinite(betAmount) || betAmount < 0) {
      res.status(400).json({ error: "betAmount must be a non-negative number" });
      return;
    }
    if (!Number.isFinite(winAmount) || winAmount < 0) {
      res.status(400).json({ error: "winAmount must be a non-negative number" });
      return;
    }
    if (!Number.isFinite(balanceAfter) || balanceAfter < 0) {
      res.status(400).json({ error: "balanceAfter must be a non-negative number" });
      return;
    }
    if (
      !Array.isArray(reelSymbols) ||
      reelSymbols.length === 0 ||
      !reelSymbols.every((reel) => Array.isArray(reel) && reel.every((s) => typeof s === "string"))
    ) {
      res.status(400).json({ error: "reelSymbols must be an array of symbol arrays" });
      return;
    }
    if (tier !== null && tier !== undefined && !WIN_TIERS.includes(tier)) {
      res.status(400).json({ error: "tier must be null or one of BIG WIN, MEGA WIN, JACKPOT" });
      return;
    }

    // Persist the spin to the player's stored balance (-bet +win) — the server's balance is what
    // every page load, refresh and the account page read, so it must follow every spin.
    const serverBalance = await applySpinToBalance(req.userId!, betAmount, winAmount);
    if (serverBalance === null) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const spinDoc = await SpinHistory.create({
      userId: req.userId,
      gameId: crazy777Meta.id,
      betAmount,
      winAmount,
      reelSymbols,
      balanceAfter: serverBalance,
      tier: (tier ?? null) as WinTierName | null,
      forced: false,
      forcedOutcomeId: null,
    });

    // Best-effort — a user lookup failing here shouldn't fail the log write itself, just means
    // this one event won't show up in the admin Live Feed.
    const user = await User.findById(req.userId).select("username").lean().catch(() => null);
    if (user) {
      emitSpinEvent({
        userId: String(req.userId),
        username: user.username,
        gameId: crazy777Meta.id,
        bet: betAmount,
        winAmount,
        tier: (tier ?? null) as WinTierName | null,
        forced: false,
        balanceAfter: serverBalance,
        createdAt: spinDoc.createdAt.toISOString(),
      });
    }

    res.status(201).json({ ok: true, balance: serverBalance });
  })
);

export default router;
