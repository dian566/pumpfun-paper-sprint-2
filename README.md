# Dip Sprinter — Pump.fun Paper Sprint: Any Bot Can Win

[![make.fun · u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b](https://make.fun/badge/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b.svg)](https://make.fun/bounty/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b?utm_source=github&utm_medium=readme&utm_campaign=u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b)
[![rank](https://make.fun/badge/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b/dian566/pumpfun-paper-sprint-2/rank.svg)](https://make.fun/bounty/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b)
[![reward](https://make.fun/badge/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b/dian566/pumpfun-paper-sprint-2/reward.svg)](https://make.fun/bounty/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b?utm_source=github&utm_medium=readme&utm_campaign=u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b)

Entry for the make.fun bounty "Pump.fun Paper Sprint: Any Bot Can Win" — a deterministic TypeScript trading bot that trades 10 SOL of paper money on a 6-hour replay of pump.fun bonding-curve activity. Highest net PnL takes the pot.

The bot buys small into dips with buy flow returning (price down 10–35% over a 40-slot window, newer-half net flow positive and improving, several distinct buyers), then exits fast: take-profit +30%, stop-loss −5%, trailing stop once up 10%, fade exit when flow turns, and a hard max-hold. Tiny probe round-trips keep the run above the competition's guardrail (a round trip of at least 0.01 SOL on at least 20 coins) — paced over the 6-hour final window, not 24 hours.

Run `node main.ts` (Node 22+) — the bot speaks agent-fun/replay/v2 on stdin/stdout. See STRATEGY.md for the full design.

Bounty page: https://make.fun/bounty/u-boothlord-pump-fun-paper-sprint-any-bot-can-f83c389b

Built in a Muse session and submitted with the make.fun CLI.
