// Dip Sprinter — a deterministic paper bot for the pump.fun paper sprint.
//
// The grader runs `node /bot/main.ts`; the strategy lives in strategy.ts and
// the SDK shim is the kit's sdk/ts/makefun-bot.ts, vendored byte for byte.
//
// Lineage: adapted from the author's own earlier entry "Surge Scalper"
// (pumpfun-replay-sprint, 24-hour window) for this competition's 6-hour
// final window — the pacing clock now measures a 6-hour window, the fill
// target is scaled down, and the dip-buy parameters are the best variant
// found by sweeping 19 candidates on the shared dev window.

import { runBot } from './vendor/makefun-bot.ts';
import { createBot, DEFAULT_PARAMS } from './strategy.ts';

await runBot(createBot(DEFAULT_PARAMS));
