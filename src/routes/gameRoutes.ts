import { requireAuth } from "../middleware/requireAuth";
import { asyncHandler } from "../utils/asyncHandler";
import { ClientRtpConfig } from "../models/ClientRtpConfig";
import { SERVER_RTP_CONFIG_GAMES } from "./admin/rtpConfig";
import { Router, Request, Response } from "express";
import shamrockSpinRoutes from "../games/ShamrockSpin/routes";
import { shamrockSpinMeta } from "../games/ShamrockSpin/meta";
import cashMachineRoutes from "../games/CashMachine/routes";
import { cashMachineMeta } from "../games/CashMachine/meta";
import buffalo777Routes from "../games/Buffalo777/routes";
import { buffalo777Meta } from "../games/Buffalo777/meta";
import crazy777Routes from "../games/Crazy777/routes";
import { crazy777Meta } from "../games/Crazy777/meta";
import fiveXRewindRoutes from "../games/FiveXRewind/routes";
import { fiveXRewindMeta } from "../games/FiveXRewind/meta";
import sizzlingSevensRoutes from "../games/SizzlingSevens/routes";
import { sizzlingSevensMeta } from "../games/SizzlingSevens/meta";
import crystalCloverRoutes from "../games/CrystalClover/routes";
import { crystalCloverMeta } from "../games/CrystalClover/meta";
import fruity777Routes from "../games/Fruity777/routes";
import { fruity777Meta } from "../games/Fruity777/meta";
import mega10xPayRoutes from "../games/Mega10XPay/routes";
import { mega10xPayMeta } from "../games/Mega10XPay/meta";
import vegasHitsRoutes from "../games/VegasHits/routes";
import { vegasHitsMeta } from "../games/VegasHits/meta";
import lifeOfLuxuryRoutes from "../games/LifeOfLuxury/routes";
import { lifeOfLuxuryMeta } from "../games/LifeOfLuxury/meta";
import theFinerThingRoutes from "../games/TheFinerThing/routes";
import { theFinerThingMeta } from "../games/TheFinerThing/meta";
import rubberDuckRoutes from "../games/RubberDuck/routes";
import { rubberDuckMeta } from "../games/RubberDuck/meta";
import topDollarRoutes from "../games/TopDollar/routes";
import { topDollarMeta } from "../games/TopDollar/meta";
import gemsDeluxeRoutes from "../games/GemsDeluxe/routes";
import { gemsDeluxeMeta } from "../games/GemsDeluxe/meta";
import hexaKenoRoutes from "../games/HexaKeno/routes";
import { hexaKenoMeta } from "../games/HexaKeno/meta";
import superKenoBallsRoutes from "../games/SuperKenoBalls/routes";
import { superKenoBallsMeta } from "../games/SuperKenoBalls/meta";
import zeusVsHadesRoutes from "../games/ZeusVsHades/routes";
import { zeusVsHadesMeta } from "../games/ZeusVsHades/meta";
import fishGameRoutes from "../games/FishGame/routes";
import { fishGameMeta } from "../games/FishGame/meta";

// Add each new game's meta + router here as it's built.
const games = [
  { meta: shamrockSpinMeta, router: shamrockSpinRoutes },
  { meta: cashMachineMeta, router: cashMachineRoutes },
  { meta: buffalo777Meta, router: buffalo777Routes },
  { meta: crazy777Meta, router: crazy777Routes },
  { meta: fiveXRewindMeta, router: fiveXRewindRoutes },
  { meta: sizzlingSevensMeta, router: sizzlingSevensRoutes },
  { meta: crystalCloverMeta, router: crystalCloverRoutes },
  { meta: fruity777Meta, router: fruity777Routes },
  { meta: mega10xPayMeta, router: mega10xPayRoutes },
  { meta: vegasHitsMeta, router: vegasHitsRoutes },
  { meta: lifeOfLuxuryMeta, router: lifeOfLuxuryRoutes },
  { meta: theFinerThingMeta, router: theFinerThingRoutes },
  { meta: rubberDuckMeta, router: rubberDuckRoutes },
  { meta: topDollarMeta, router: topDollarRoutes },
  { meta: gemsDeluxeMeta, router: gemsDeluxeRoutes },
  { meta: hexaKenoMeta, router: hexaKenoRoutes },
  { meta: superKenoBallsMeta, router: superKenoBallsRoutes },
  { meta: zeusVsHadesMeta, router: zeusVsHadesRoutes },
  { meta: fishGameMeta, router: fishGameRoutes },
];

const router = Router();

router.get("/", (_req, res) => {
  res.json({ games: games.map((g) => g.meta) });
});

/** The admin-saved RTP config for a game (set from its admin RTP page), read by the game every
 * time it loads — before it finishes loading — so every player plays on it. { config: null }
 * until an admin has saved one; the game then keeps its built-in default. Read-only: saving is
 * admin-only (PUT /api/admin/rtp-config/:gameId). Registered before the per-game routers. */
router.get(
  "/:gameId/rtp-config",
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const { gameId } = req.params;
    if (!SERVER_RTP_CONFIG_GAMES.has(gameId)) {
      res.status(404).json({ error: "This game's RTP config isn't stored on the server" });
      return;
    }
    const doc = await ClientRtpConfig.findOne({ gameId }).lean();
    res.json({ config: doc?.config ?? null, updatedAt: doc?.updatedAt ?? null });
  })
);

for (const game of games) {
  router.use(`/${game.meta.id}`, game.router);
}

export default router;
