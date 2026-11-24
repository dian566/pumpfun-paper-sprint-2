// Dip Sprinter — deterministic paper bot for the pump.fun paper sprint.
//
// The grader runs `node /bot/main.ts`. The trading rules live in
// strategy.ts; the SDK shim is the kit's sdk/ts/makefun-bot.ts, vendored
// byte for byte.
//
// Lineage: adapted from the author's own earlier entry "Surge Scalper"
// (pumpfun-replay-sprint, 24-hour window) for this competition's 6-hour
// final window. The pacing clock measures a 6-hour window, the fill target
// is scaled down, and the dip-buy settings are the best variant from
// sweeping 11 candidates on the shared dev window: an 80-slot window, dips
// of 5-30%, take-profit +30%, stop-loss -5% (dev net PnL -0.117 SOL,
// 92 coins, 139 round trips, 1.5% max drawdown).

import { runBot } from './vendor/makefun-bot.ts';
import { createBot, DEFAULT_PARAMS } from './strategy.ts';

await runBot(createBot(DEFAULT_PARAMS));
