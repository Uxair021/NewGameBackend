import { Router, Request, Response, NextFunction } from "express";
import { requireAuth } from "../../middleware/requireAuth";
import { asyncHandler } from "../../utils/asyncHandler";
import { FishSession, IFishSession } from "../../models/FishSession";
import { BET_LEVELS, MAX_HITS_PER_BATCH, SESSION_TIMEOUT_MS } from "./config";
import { getFishConfig } from "./engine";
import { fishGameMeta } from "./meta";
import {
  closeSession,
  getOwnActiveSession,
  HitInput,
  processBatch,
  SessionError,
  startSession,
  validateHits,
} from "./sessions";

const router = Router();

/** Turns a SessionError into its HTTP status instead of a generic 500. */
function handleSessionErrors(
  fn: (req: Request, res: Response) => Promise<void>
): (req: Request, res: Response, next: NextFunction) => Promise<void> {
  return async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof SessionError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      next(err);
    }
  };
}

function sessionSummary(session: IFishSession) {
  return {
    sessionId: String(session._id),
    status: session.status,
    closeReason: session.closeReason,
    startBalance: session.startBalance,
    endBalance: session.endBalance,
    hits: session.hits,
    kills: session.kills,
    wagered: session.wagered,
    won: session.won,
    startedAt: session.startedAt,
    endedAt: session.endedAt,
  };
}

router.get(
  "/config",
  asyncHandler(async (_req: Request, res: Response) => {
    const config = await getFishConfig();
    res.json({
      meta: fishGameMeta,
      betLevels: BET_LEVELS,
      maxHitsPerBatch: MAX_HITS_PER_BATCH,
      sessionTimeoutMs: SESSION_TIMEOUT_MS,
      species: config.species.map(({ id, name, multiplier }) => ({ id, name, multiplier })),
    });
  })
);

/** Entering the game: records the player's starting balance for this visit. */
router.post(
  "/session/start",
  requireAuth,
  asyncHandler(
    handleSessionErrors(async (req, res) => {
      const session = await startSession(req.userId as string);
      res.json({ ...sessionSummary(session), balance: session.startBalance });
    })
  )
);

/**
 * A batch of hits (about one second's worth). Bets are only charged for bullets that hit, and
 * every kill is still rolled here — the client only reports which creature each bullet touched.
 * An empty batch is a heartbeat that keeps the session from timing out.
 */
router.post(
  "/session/:sessionId/hits",
  requireAuth,
  asyncHandler(
    handleSessionErrors(async (req, res) => {
      const hitsError = validateHits(req.body?.hits, MAX_HITS_PER_BATCH);
      if (hitsError) {
        res.status(400).json({ error: hitsError });
        return;
      }
      const hits: HitInput[] = (req.body.hits as { speciesId: string; betAmount: unknown }[]).map((h) => ({
        speciesId: h.speciesId,
        betAmount: Number(h.betAmount),
      }));

      const session = await getOwnActiveSession(req.params.sessionId, req.userId as string);
      res.json(await processBatch(session, hits));
    })
  )
);

/** Leaving the game (or the idle countdown ran out): records the end balance. */
router.post(
  "/session/:sessionId/end",
  requireAuth,
  asyncHandler(
    handleSessionErrors(async (req, res) => {
      const reason = req.body?.reason === "idle" ? "idle" : "exit";
      let session: IFishSession;
      try {
        session = await getOwnActiveSession(req.params.sessionId, req.userId as string);
        session = await closeSession(session, reason);
      } catch (err) {
        // Already closed (e.g. timed out while the laptop slept) — still return its summary.
        if (!(err instanceof SessionError) || err.status !== 409) throw err;
        const closed = await FishSession.findOne({ _id: req.params.sessionId, userId: req.userId });
        if (!closed) throw err;
        session = closed;
      }
      res.json(sessionSummary(session));
    })
  )
);

export default router;
