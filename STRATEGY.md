# Dip Sprinter — strategy notes

## The game

10 SOL of paper money, one **6-hour** replay of pump.fun bonding-curve events
(TradeEvent / CreateEvent / CompleteEvent), scored on final net PnL after
all fees. Two hard constraints shape everything:

- **Guardrail:** a round trip of at least 0.01 SOL on each of at least 20
  coins, max drawdown ≤ 50%. Missing it ranks below every entry that meets it.
- **Determinism:** the entry is executed twice; both action logs must match
  byte for byte. No clock, no randomness, no network, no environment.

Fees are brutal at small size: 1.25% curve fee per side plus ~105,000
lamports of tx fee per order. A 0.03 SOL round trip pays ~4% in fees, so a
trade needs a real move to win — and most pump.fun curves only go down.
The winning move is therefore not to trade a lot, but to trade little,
only into dips with flow returning, and to cut losers fast.

This bot is an adaptation of the author's own earlier entry for the
24-hour sister competition ("Surge Scalper" / dip-buy variant, best of 19
swept variants at −0.14 SOL on the shared dev window). The strategy logic
is unchanged in shape; what changed is the clock: the guardrail pacing is
measured over the 6-hour final window (paceSecs 21600, targetFills 60),
because a 24-hour pacing clock would only reach 25% by the end of a
6-hour window and leave the run at ~7 guardrail coins — below the bar.

## Entry (default: dip mode)

On every batch, for each curve that traded, the bot checks an 80-slot tape:

- curve at least 200 slots old,
- real SOL reserves between 2 and 60,
- price down 5–30% over the window, with buy flow returning: net SOL in
  the newer half of the window positive and above the older half's,
- ≥ 6 buy trades and ≥ 6 distinct buyers in the window,
- no single buyer above 50% of the window's buy SOL.

A surge mode (same tape, but price up ≥ 12% and near its window high
instead of down) is kept behind the `dip` flag; on the dev window it lost
more than dip mode in every variant tried.

At most 2 entries per curve, 150-slot cooldown after an exit, at most 5
positions open, at most 2 SOL of exposure at cost.

## Sizing

First buy 0.03 SOL (capped by the harness rule: one batch's buys on a coin
may spend at most 1% of its real SOL reserve). While the price keeps
stepping up ≥ 8% from the last buy and net flow stays positive, the bot
pyramids +0.03 SOL at a time, up to 0.12 SOL per position. False starts
cost little; runners get size.

## Exits (sell the whole position)

- take-profit: value ≥ cost × 1.30
- stop-loss: value < cost × 0.95
- trailing stop: once peak ≥ cost × 1.10, sell below peak × 0.85
- fade: net flow over 20 slots < −0.30 SOL
- big sell: any single recorded sell ≥ 1.5 SOL
- max hold: 800 slots, unless the position is up ≥ 10%

Sells go out at 10,000 bps slippage so exits always land.

## Guardrail probes (the 6-hour adaptation)

When fills or coins lag the pace — 25 coins / 60 fills by the end of the
6-hour window, measured in block time — the bot opens a 0.012 SOL probe
round trip on a liquid curve it holds nothing on, then sells it as soon as
the buy lands. One probe at a time, ~0.0006 SOL per round trip. Cheap
insurance for the 20-coin bar; on the dev window the main signal already
covers the bar most of the way, so probes fire rarely.

## Dev-window results

The parameter set was chosen by sweeping 19 variants on the kit's dev
window (24h, 2–3 Nov 2026) for the sister competition, then re-swept with
8 more variants for this one; the same dev window ships in this kit. The
window is a down market: every genuine strategy lost money on it, and the
chosen set lost least (−0.117 SOL, 1.5% drawdown, 139 round trips over 92
coins, guardrail met). The final window is a fresh 6 hours after the
deadline, so the dev score is a robustness check, not a forecast — the
entry's edge is a tight stop plus a real shot at a bounce winner, not a
dev-window fit.
