import { Router, Request, Response } from "express";
import { User } from "../../models/User";
import { applySpinToBalance } from "../../services/spinBalance";
import { SpinHistory } from "../../models/SpinHistory";
import { requireAuth } from "../../middleware/requireAuth";
import { asyncHandler } from "../../utils/asyncHandler";
import { getRtpMultiplier } from "../../services/gameSettings";
import { emitSpinEvent } from "../../realtime/eventBus";
import { playKeno, validatePicks } from "./engine";
import { BET_LEVELS, DRAWN_COUNT, MAX_BET, MAX_PICKS, MIN_BET, MIN_PICKS, PAYTABLE, POOL_SIZE } from "./config";
import { hexaKenoMeta } from "./meta";

const router = Router();

router.get("/config", (_req: Request, res: Response) => {
  res.json({
    meta: hexaKenoMeta,
    paytable: PAYTABLE,
    betLevels: BET_LEVELS,
    poolSize: POOL_SIZE,
    drawnCount: DRAWN_COUNT,
    minPicks: MIN_PICKS,
    maxPicks: MAX_PICKS,
  });
});

router.post(
  "/spin",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const betAmount = Number(req.body?.betAmount);
    if (!Number.isFinite(betAmount) || betAmount < MIN_BET || betAmount > MAX_BET) {
      res.status(400).json({ error: `betAmount must be between ${MIN_BET} and ${MAX_BET}` });
      return;
    }

    const picksError = validatePicks(req.body?.picks);
    if (picksError) {
      res.status(400).json({ error: picksError });
      return;
    }
    const picks = req.body.picks as number[];

    const user = await User.findById(req.userId);
    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }
    if (user.balance < betAmount) {
      res.status(400).json({ error: "Insufficient balance" });
      return;
    }

    const rtpMultiplier = await getRtpMultiplier(hexaKenoMeta.id);
    const result = playKeno(picks, betAmount, rtpMultiplier);

    user.balance = Math.round((user.balance - betAmount + result.winAmount) * 100) / 100;

    const [, spinDoc] = await Promise.all([
      user.save(),
      SpinHistory.create({
        userId: user._id,
        gameId: hexaKenoMeta.id,
        betAmount,
        winAmount: result.winAmount,
        reelSymbols: [result.picks.map(String), result.drawn.map(String), result.matched.map(String)],
        balanceAfter: user.balance,
        tier: result.tier,
        forced: false,
        forcedOutcomeId: null,
      }),
    ]);

    emitSpinEvent({
      userId: String(user._id),
      username: user.username,
      gameId: hexaKenoMeta.id,
      bet: betAmount,
      winAmount: result.winAmount,
      tier: result.tier,
      forced: false,
      balanceAfter: user.balance,
      createdAt: spinDoc.createdAt.toISOString(),
    });

    res.json({
      picks: result.picks,
      drawn: result.drawn,
      matched: result.matched,
      multiplier: result.multiplier,
      winAmount: result.winAmount,
      tier: result.tier,
      balance: user.balance,
    });
  })
);

/**
 * The frontend now plays each Keno draw in the browser (see frontEnd/src/games/shared/keno.ts) and
 * reports it here, the same write-only spin-log every other offline game uses: it records the draw
 * in SpinHistory and applies it (-bet +win) to the player's stored balance, so the balance survives
 * a refresh. Nothing here decides or verifies the outcome.
 */
router.post(
  "/spin-log",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { betAmount, winAmount, picks, drawn, matched } = req.body ?? {};
    if (!Number.isFinite(betAmount) || betAmount < 0) {
      res.status(400).json({ error: "betAmount must be a non-negative number" });
      return;
    }
    if (!Number.isFinite(winAmount) || winAmount < 0) {
      res.status(400).json({ error: "winAmount must be a non-negative number" });
      return;
    }
    const isNumberList = (v: unknown): v is number[] => Array.isArray(v) && v.every((n) => Number.isFinite(n));
    if (!isNumberList(picks) || !isNumberList(drawn) || !isNumberList(matched)) {
      res.status(400).json({ error: "picks, drawn and matched must be number arrays" });
      return;
    }

    const serverBalance = await applySpinToBalance(req.userId!, betAmount, winAmount);
    if (serverBalance === null) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    const spinDoc = await SpinHistory.create({
      userId: req.userId,
      gameId: hexaKenoMeta.id,
      betAmount,
      winAmount,
      reelSymbols: [picks.map(String), drawn.map(String), matched.map(String)],
      balanceAfter: serverBalance,
      tier: null,
      forced: false,
      forcedOutcomeId: null,
    });

    const user = await User.findById(req.userId).select("username").lean().catch(() => null);
    if (user) {
      emitSpinEvent({
        userId: String(req.userId),
        username: user.username,
        gameId: hexaKenoMeta.id,
        bet: betAmount,
        winAmount,
        tier: null,
        forced: false,
        balanceAfter: serverBalance,
        createdAt: spinDoc.createdAt.toISOString(),
      });
    }

    res.status(201).json({ ok: true, balance: serverBalance });
  })
);

export default router;
