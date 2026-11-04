import express, { Express, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import { env } from "./config/env";
import authRoutes from "./routes/authRoutes";
import userRoutes from "./routes/userRoutes";
import gameRoutes from "./routes/gameRoutes";
import adminRoutes from "./routes/adminRoutes";
import jackpotRoutes from "./routes/jackpotRoutes";
import lobbyRoutes from "./routes/lobbyRoutes";
import siteRoutes from "./routes/siteRoutes";
import { maintenanceGate } from "./middleware/maintenanceGate";
import { geoBlockGate } from "./middleware/geoBlockGate";
import { asyncHandler } from "./utils/asyncHandler";

const LAN_ORIGIN_PATTERN =
  /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?$/;

export function createApp(): Express {
  const app = express();
  // real visitor IP behind a reverse proxy (needed by the country block) — see env.trustProxy
  app.set("trust proxy", env.trustProxy);

  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        // No Origin header (curl, server-to-server, mobile webviews) — allow.
        if (!origin) return callback(null, true);
        if (env.corsOrigins.includes(origin)) return callback(null, true);
        // In development, also allow any localhost/private-LAN origin so the app can be
        // opened from a phone on the same network (e.g. http://192.168.x.x:5173) without
        // hardcoding that IP into CORS_ORIGIN, which changes across networks/DHCP leases.
        if (env.nodeEnv !== "production" && LAN_ORIGIN_PATTERN.test(origin)) {
          return callback(null, true);
        }
        callback(new Error("Not allowed by CORS"));
      },
      credentials: true,
      // Lets the browser cache the preflight OPTIONS response instead of re-sending it
      // before every single authenticated request (e.g. every spin) — without this the
      // default cache window is only a few seconds, so cross-origin prod traffic (frontend
      // and backend on different domains) pays a full extra round-trip almost every time.
      maxAge: 86400,
    })
  );
  app.use(express.json());
  // Keep every API response out of search engines / caches of crawlers (the frontend also has a
  // noindex robots meta tag and robots.txt).
  app.use((_req, res, next) => {
    res.setHeader("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet, noimageindex");
    next();
  });
  // Crawlers asking the API host itself: disallow everything.
  app.get("/robots.txt", (_req, res) => {
    res.type("text/plain").send("User-agent: *\nDisallow: /\n");
  });

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  // Maintenance mode (admin dashboard): player routes are refused while it's on — see
  // middleware/maintenanceGate. Login, site status and the admin API stay reachable.
  // Country block (admin dashboard): same player routes, refused for blocked countries — see
  // middleware/geoBlockGate.
  const gate = asyncHandler(maintenanceGate);
  const geo = asyncHandler(geoBlockGate);
  app.use("/api/site", siteRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/users", geo, gate, userRoutes);
  app.use("/api/games", geo, gate, gameRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/jackpot", geo, gate, jackpotRoutes);
  app.use("/api/lobby", geo, gate, lobbyRoutes);

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Must be registered last and keep all 4 params so Express treats it as an error handler.
  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[error]", err);

    if (err?.name === "CastError") {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    if (err?.code === 11000) {
      res.status(409).json({ error: "Duplicate value" });
      return;
    }
    if (err?.name === "ValidationError") {
      res.status(400).json({ error: err.message });
      return;
    }

    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
