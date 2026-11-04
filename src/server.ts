import { createApp } from "./app";
import { connectDb } from "./config/db";
import { env } from "./config/env";
import { startSessionSweeper } from "./games/FishGame/sessions";
import { startJackpotScheduler } from "./services/jackpot";
import { startGeoIp } from "./services/geoip";

async function main() {
  await connectDb();
  startSessionSweeper();
  startJackpotScheduler();
  startGeoIp(); // country database for the admin-controlled country block
  const app = createApp();
  app.listen(env.port, () => {
    console.log(`[server] listening on port ${env.port}`);
  });
}

main().catch((err) => {
  console.error("[server] failed to start", err);
  process.exit(1);
});
