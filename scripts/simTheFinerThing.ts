/**
 * Monte Carlo RTP check for The Finer Thing — runs the real engine.spin() plus the exact
 * free-spin round logic from routes.ts (wild-count bonus included), which the admin page's
 * closed-form RTP does not model.
 *
 *   npx ts-node --transpile-only scripts/simTheFinerThing.ts [baseSpins] [coinChance%] [payoutScale]
 */
import { spin } from "../src/games/TheFinerThing/engine";
import { getDefaultPaytableConfig, computeRtpPercent } from "../src/services/paytableConfig";
import { WILD_SYMBOL } from "../src/games/TheFinerThing/config";

const baseSpins = Number(process.argv[2] ?? 2_000_000);
const coinChance = process.argv[3] !== undefined ? Number(process.argv[3]) : undefined;
const payoutScale = Number(process.argv[4] ?? 1);

const config = getDefaultPaytableConfig("the-finer-thing");
if (coinChance !== undefined && config.scatterRules) config.scatterRules = { ...config.scatterRules, chancePercent: coinChance };
if (payoutScale !== 1 && config.symbolPayouts) {
  for (const k of Object.keys(config.symbolPayouts)) {
    const p = config.symbolPayouts[k];
    config.symbolPayouts[k] = { x3: p.x3 * payoutScale, x4: p.x4 * payoutScale, x5: p.x5 * payoutScale };
  }
}

const bet = 1;
let staked = 0;
let baseWin = 0;
let freeSpinWin = 0;
let wildBonus = 0;
let rounds = 0;

for (let i = 0; i < baseSpins; i++) {
  staked += bet;
  const r = spin(bet, config, false);
  baseWin += r.winAmount;
  if (r.freeSpinsAwarded) {
    rounds++;
    let total = 0;
    let wilds = 0;
    for (let s = 0; s < r.freeSpinsAwarded; s++) {
      const f = spin(bet, config, true);
      total += f.winAmount;
      wilds += f.grid.reduce((n, reel) => n + reel.filter((x) => x === WILD_SYMBOL).length, 0);
    }
    freeSpinWin += total;
    wildBonus += total * wilds;
  }
}

const pct = (x: number) => ((x / staked) * 100).toFixed(2) + "%";
console.log(`coin chance ${config.scatterRules?.chancePercent}%  payout scale ${payoutScale}`);
console.log(`free-spin rounds: 1 in ${(baseSpins / rounds).toFixed(1)} spins`);
console.log(`base ${pct(baseWin)}  free spins ${pct(freeSpinWin)}  wild bonus ${pct(wildBonus)}`);
console.log(`REAL RTP ${pct(baseWin + freeSpinWin + wildBonus)}   (admin page formula says ${computeRtpPercent(config).toFixed(2)}%)`);
