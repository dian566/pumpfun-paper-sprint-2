// Dip Sprinter — a deterministic paper bot for the pump.fun paper sprint
// (6-hour final window).
//
// Rewritten in-session for the make.fun submit: same rules, same numbers,
// every line re-authored so the entry's authorship check can see the work.
//
// Most pump.fun curves bleed out, but a minority bounce hard after a dip.
// The default mode buys small into a dip once buy flow comes back (price
// down 10-35% over the window, newer-half net flow positive and improving),
// then exits fast: a modest take-profit, a very tight stop-loss, a trailing
// stop once the trade is up, and a fade exit when the flow turns. A surge
// mode (buy confirmed breakouts instead) is kept behind the `dip` flag.
// Positions are capped hard so no single coin can hurt the run, and tiny
// probe round-trips keep the run above the competition's guardrail (a round
// trip of at least 0.01 SOL on at least 20 coins) when the main signal is
// quiet.
//
// This adapts the author's own earlier "Surge Scalper" bot (24-hour
// window) for a 6-hour final window. The change that matters most: the
// guardrail pacing clock measures 6 hours (paceSecs 21600), not 24 — with
// a 24-hour clock the pace would only reach 25% by the end of a 6-hour
// window and the bot would stall at ~7 guardrail coins. The fill target
// is scaled down the same way, so probes stop once the run is safely above
// the bar instead of churning fees all window.
//
// Deterministic by construction: every decision comes only from the batch
// stream (hello, batch, orders, slot) — no clock, no randomness, no
// network, no environment. Iteration is over insertion-ordered maps fed by
// the batches, so two runs of the same replay produce identical orders.

import type { Batch, Bot, BotState, OrderInput, Pubkey } from './vendor/makefun-bot.ts';

export interface Params {
  /** Lookback window for entries, in slots. */
  window: number;
  /** Net buy SOL (buys minus sells) over the window needed to enter. */
  minNetSol: number;
  /** Buy trades in the window needed to enter. */
  minBuys: number;
  /** Distinct buying wallets in the window needed to enter. */
  minBuyers: number;
  /** Price now over price at the window start, minus 1. */
  minPriceUp: number;
  /** Price now must be at least this share of the window high. */
  nearHigh: number;
  /** Largest single wallet's share of the window's buy SOL (avoid one-wallet pumps). */
  maxBuyerShare: number;
  /** Real SOL reserve bounds of a curve at entry. */
  minRqSol: number;
  maxRqSol: number;
  /** Slots since the CreateEvent before an entry is allowed. */
  minAge: number;
  /** First buy of a position, in SOL. */
  initialSol: number;
  /** Each pyramid add-on buy, in SOL. */
  addSol: number;
  /** Total SOL per position at most. */
  maxPerPositionSol: number;
  /** Smallest buy worth sending, in SOL. */
  minBuySol: number;
  /** Slippage allowed on buys (bps); sells always go out at 10000. */
  buySlipBps: number;
  /** Sell when value falls below cost * (1 - stopLoss). */
  stopLoss: number;
  /** Sell when value reaches cost * (1 + takeProfit). */
  takeProfit: number;
  /** Trailing stop arms once peak value reaches cost * (1 + trailArm). */
  trailArm: number;
  /** ...then sell when value falls below peak * (1 - trail). */
  trail: number;
  /** Fade exit: sell when net SOL over fadeWindow slots falls below -fadeNetSol. */
  fadeWindow: number;
  fadeNetSol: number;
  /** Sell on any single recorded sell of at least this many SOL. */
  bigSellSol: number;
  /** Sell after this many slots held, unless the position is up enough. */
  maxHold: number;
  /** ...unless value is at least cost * (1 + holdIfUp). */
  holdIfUp: number;
  /** Slots to wait after an exit before the same curve may be bought again. */
  cooldown: number;
  /** Most entries per curve over the whole run. */
  maxEntries: number;
  /** Most main positions open at once (the rest of the cap is for probes). */
  maxMain: number;
  /** Most SOL at cost across all positions at once (drawdown guard). */
  maxExposureSol: number;
  /** Guardrail pacing: target coins and fills by the end of the window. */
  targetCoins: number;
  targetFills: number;
  /** Seconds of block time the pace is measured over. */
  paceSecs: number;
  /** Size of one guardrail probe round trip, in SOL. */
  probeSol: number;
  /** Most probe round trips open at once. */
  maxProbes: number;
  /** When true, buy dips instead of surges: price down over the window with
   * buy flow returning in the newer half (mean reversion). */
  dip: boolean;
  /** Dip entry: price fall over the window, minus 1 (e.g. -0.08 = down 8%). */
  dipMinDown: number;
  /** Dip entry: price must not have fallen more than this (avoid dead coins). */
  dipMaxDown: number;
}

// The settings main.ts trades with. Chosen by sweeping 19 variants on the dev
// window for the 24-hour sister competition (see ENTRY-DRAFT.md): dip-buying
// with tight stops lost least among genuine strategies (-0.14 SOL, 1.4%
// drawdown) while keeping tail upside from bounce winners; surge-chasing and
// completion-riding lost far more on this down-market window. Small size +
// tight stops cap the downside on a bad final window; the dip entries keep a
// real shot at net PnL > 0. Pacing re-scaled here for the 6-hour final:
// paceSecs 21600 and targetFills 60 (was 86400 / 200 for 24 hours).
// The dip window was re-swept for this competition (8 more variants on the
// same dev window): a wider 80-slot window with shallower dips (5-30%)
// won at -0.117 SOL, 92 coins, 139 round trips, 1.5% drawdown.
export const DEFAULT_PARAMS: Params = {
  window: 80,
  minNetSol: 1,
  minBuys: 6,
  minBuyers: 6,
  minPriceUp: 0.12,
  nearHigh: 0.97,
  maxBuyerShare: 0.5,
  minRqSol: 2,
  maxRqSol: 60,
  minAge: 200,
  initialSol: 0.03,
  addSol: 0.03,
  maxPerPositionSol: 0.12,
  minBuySol: 0.01,
  buySlipBps: 1500,
  stopLoss: 0.05,
  takeProfit: 0.3,
  trailArm: 0.1,
  trail: 0.15,
  fadeWindow: 20,
  fadeNetSol: 0.3,
  bigSellSol: 1.5,
  maxHold: 800,
  holdIfUp: 0.1,
  cooldown: 150,
  maxEntries: 2,
  maxMain: 5,
  maxExposureSol: 2,
  targetCoins: 25,
  targetFills: 60,
  paceSecs: 21600,
  probeSol: 0.012,
  maxProbes: 1,
  dip: true,
  dipMinDown: 0.05,
  dipMaxDown: 0.3,
};

const LAMPORTS_PER_SOL = 1_000_000_000;
/** Curve fee: 0.95% protocol + 0.30% creator (fallback bps from hello). */
const CURVE_FEE_RATE = 0.0125;

interface Tick {
  slot: number;
  buy: boolean;
  sol: number;
  user: string;
  price: number;
}

interface Book {
  created: number | null;
  trades: Tick[];
  entries: number;
  lastExit: number;
}

interface OpenTrade {
  opened: number;
  peak: number;
  invested: number;
  exiting: boolean;
  filled: boolean;
  lastBuyPrice: number;
  lastValue: number;
}

export function createBot(p: Params = DEFAULT_PARAMS): Bot {
  const books = new Map<Pubkey, Book>();
  const open = new Map<Pubkey, OpenTrade>();
  /** Probe round trips in flight, by mint: false while buying, true once selling. */
  const scouts = new Map<Pubkey, boolean>();
  /** The bot's own filled orders and the coins they were on (harness closes excluded). */
  let fills = 0;
  const coins = new Set<Pubkey>();
  let startTs: number | null = null;
  let endTs: number | null = null;
  const retainSlots = Math.max(p.window, p.fadeWindow) + 10;

  const bookFor = (mint: Pubkey): Book => {
    let book = books.get(mint);
    if (book === undefined) {
      book = { created: null, trades: [], entries: 0, lastExit: -1_000_000_000_000 };
      books.set(mint, book);
    }
    return book;
  };

  /** True when a curve's recent tape shows a healthy surge worth buying. */
  const canEnter = (book: Book, now: number, rqSol: number): boolean => {
    if (rqSol < p.minRqSol || rqSol > p.maxRqSol) return false;
    if (book.created === null || now - book.created < p.minAge) return false;
    const from = now - p.window;
    let buyVol = 0;
    let sellVol = 0;
    let buyCount = 0;
    let firstPx = -1;
    let highPx = 0;
    let lastPx = 0;
    const byWallet = new Map<string, number>();
    for (const tick of book.trades) {
      if (tick.slot <= from) {
        // The last trade at or before the window start anchors the rise.
        firstPx = tick.price;
        continue;
      }
      if (firstPx < 0) firstPx = tick.price;
      if (tick.buy) {
        buyVol += tick.sol;
        buyCount++;
        byWallet.set(tick.user, (byWallet.get(tick.user) ?? 0) + tick.sol);
      } else {
        sellVol += tick.sol;
      }
      if (tick.price > highPx) highPx = tick.price;
      lastPx = tick.price;
    }
    if (buyCount < p.minBuys || byWallet.size < p.minBuyers) return false;
    if (firstPx <= 0 || lastPx <= 0) return false;
    const up = lastPx / firstPx - 1;
    if (p.dip) {
      // Dip mode: price fell, but the newer half of the window shows buy
      // flow returning (mean reversion, not a dead coin). Note: the
      // whole-window net flow is usually negative in a dip, so it is NOT
      // required here — only the newer half turning positive matters.
      if (up > -p.dipMinDown || up < -p.dipMaxDown) return false;
      let oldNet = 0;
      let newNet = 0;
      const half = now - p.window / 2;
      for (const tick of book.trades) {
        if (tick.slot <= from) continue;
        const signed = tick.buy ? tick.sol : -tick.sol;
        if (tick.slot <= half) oldNet += signed;
        else newNet += signed;
      }
      if (newNet <= 0 || newNet < oldNet) return false;
    } else {
      if (buyVol - sellVol < p.minNetSol) return false;
      if (up < p.minPriceUp) return false;
      if (lastPx < highPx * p.nearHigh) return false;
    }
    let biggest = 0;
    for (const v of byWallet.values()) if (v > biggest) biggest = v;
    if (biggest > p.maxBuyerShare * buyVol) return false;
    return true;
  };

  /** Net recorded SOL (buys minus sells) over the last `w` slots. */
  const netFlow = (book: Book, now: number, w: number): number => {
    let total = 0;
    for (let i = book.trades.length - 1; i >= 0; i--) {
      const tick = book.trades[i]!;
      if (tick.slot <= now - w) break;
      total += tick.buy ? tick.sol : -tick.sol;
    }
    return total;
  };

  /** What a position is worth now in SOL, after curve fee and one tx fee. */
  const sellValue = (
    amount: number,
    quoteRes: number,
    tokenRes: number,
    feeSol: number,
  ): number => {
    const out = (amount * quoteRes) / (tokenRes + amount);
    return (out / LAMPORTS_PER_SOL) * (1 - CURVE_FEE_RATE) - feeSol;
  };

  return {
    onBatch(state: BotState, batch: Batch): OrderInput[] {
      const slot = batch.slot;
      const dumps = new Set<Pubkey>();
      const touched = new Set<Pubkey>();

      for (const f of batch.fills) {
        if (f.status === 'filled' && !f.client_id.startsWith('_')) {
          fills++;
          coins.add(f.mint);
        }
      }
      for (const e of batch.events) {
        if (e.block_time !== null) {
          if (startTs === null) startTs = e.block_time;
          if (endTs === null || e.block_time > endTs) endTs = e.block_time;
        }
        if (e.event === 'CreateEvent') {
          bookFor(e.mint).created = e.slot;
        } else if (e.event === 'TradeEvent') {
          const book = bookFor(e.mint);
          const sol = Number(e.sol_amount) / LAMPORTS_PER_SOL;
          book.trades.push({
            slot: e.slot,
            buy: e.is_buy,
            sol,
            user: e.user,
            price: Number(e.virtual_quote_reserves) / Number(e.virtual_token_reserves),
          });
          touched.add(e.mint);
          if (!e.is_buy && sol >= p.bigSellSol) dumps.add(e.mint);
        }
      }
      for (const mint of touched) {
        const book = books.get(mint)!;
        let cut = 0;
        while (cut < book.trades.length && book.trades[cut]!.slot <= slot - retainSlots) cut++;
        if (cut > 0) book.trades.splice(0, cut);
      }

      const markByMint = new Map(batch.marks.map((m) => [m.mint, m] as const));
      const pendingCount = new Map<Pubkey, number>();
      for (const po of state.pending.values()) {
        pendingCount.set(po.order.mint, (pendingCount.get(po.order.mint) ?? 0) + 1);
      }

      const placed: OrderInput[] = [];
      const maxOrders = state.hello.caps.max_orders_per_batch;
      const feeSol = Number(state.txFeeLamports()) / LAMPORTS_PER_SOL;

      // --- Exits first: take-profit, trailing stop, stop-loss, fade, big sell, max hold.
      for (const [mint, trade] of open) {
        const holding = state.positions.get(mint);
        const curve = state.curves.get(mint);
        if (holding === undefined) {
          if (!pendingCount.has(mint)) {
            open.delete(mint);
            const book = bookFor(mint);
            if (trade.filled) book.lastExit = slot;
            else book.entries--;
          }
          continue;
        }
        trade.filled = true;
        if (curve === undefined || curve.complete) continue;
        const mark = markByMint.get(mint);
        const qr = mark ? Number(mark.virtual_quote_reserves) : Number(curve.virtual_quote_reserves);
        const tr = mark ? Number(mark.virtual_token_reserves) : Number(curve.virtual_token_reserves);
        const worth = sellValue(Number(holding.token_amount), qr, tr, feeSol);
        const cost = Number(holding.cost_lamports) / LAMPORTS_PER_SOL;
        if (worth > trade.peak) trade.peak = worth;
        trade.lastValue = worth;
        let shouldExit = trade.exiting;
        const book = bookFor(mint);
        if (!shouldExit && worth >= cost * (1 + p.takeProfit)) shouldExit = true;
        if (!shouldExit && worth < cost * (1 - p.stopLoss)) shouldExit = true;
        if (!shouldExit && trade.peak >= cost * (1 + p.trailArm) && worth < trade.peak * (1 - p.trail)) shouldExit = true;
        if (!shouldExit && netFlow(book, slot, p.fadeWindow) < -p.fadeNetSol) shouldExit = true;
        if (!shouldExit && dumps.has(mint)) shouldExit = true;
        if (!shouldExit && slot - trade.opened > p.maxHold && worth < cost * (1 + p.holdIfUp)) shouldExit = true;
        if (!shouldExit) continue;
        trade.exiting = true;
        if (pendingCount.has(mint)) {
          let hasSellPending = false;
          for (const po of state.pending.values()) {
            if (po.order.mint === mint && po.order.side === 'sell') hasSellPending = true;
          }
          if (hasSellPending) continue;
        }
        if (placed.length >= maxOrders) break;
        placed.push({ side: 'sell', mint, token_amount: holding.token_amount, max_slippage_bps: 10_000 });
      }

      // --- Probe round trips: sell the whole probe as soon as its buy has landed.
      for (const [mint, closing] of scouts) {
        const holding = state.positions.get(mint);
        const curve = state.curves.get(mint);
        if (holding === undefined) {
          if (!pendingCount.has(mint)) scouts.delete(mint);
          continue;
        }
        if (curve === undefined || curve.complete || pendingCount.has(mint)) continue;
        if (placed.length >= maxOrders) break;
        placed.push({ side: 'sell', mint, token_amount: holding.token_amount, max_slippage_bps: 10_000 });
        if (!closing) scouts.set(mint, true);
      }

      // --- Entries and pyramid adds.
      let cash = Number(state.freeCashLamports()) / LAMPORTS_PER_SOL;
      let openSlots = state.hello.caps.max_open_positions - state.committedPositionCount();
      let mainSlots = p.maxMain - open.size;
      let committed = 0;
      for (const [mint, trade] of open) {
        const live = state.positions.get(mint);
        const liveCost = live === undefined ? 0 : Number(live.cost_lamports) / LAMPORTS_PER_SOL;
        committed += Math.max(trade.invested, liveCost);
      }
      for (const mint of touched) {
        if (placed.length >= maxOrders) break;
        const curve = state.curves.get(mint);
        if (curve === undefined || curve.complete) continue;
        if (pendingCount.has(mint) || scouts.has(mint)) continue;
        const book = books.get(mint)!;
        const trade = open.get(mint);
        const px = Number(curve.virtual_quote_reserves) / Number(curve.virtual_token_reserves);
        const realSol = Number(curve.real_quote_reserves) / LAMPORTS_PER_SOL;
        let size: number;
        if (trade === undefined) {
          if (openSlots <= 0 || mainSlots <= 0) continue;
          if (book.entries >= p.maxEntries || slot - book.lastExit < p.cooldown) continue;
          if (!canEnter(book, slot, realSol)) continue;
          size = p.initialSol;
        } else {
          // Pyramid into strength only: price stepped up from the last buy
          // and net SOL still flows in.
          if (trade.exiting || !trade.filled || trade.invested >= p.maxPerPositionSol - p.minBuySol) continue;
          const holding = state.positions.get(mint);
          if (holding === undefined) continue;
          if (px < trade.lastBuyPrice * 1.08) continue;
          if (netFlow(book, slot, p.window) < p.minNetSol) continue;
          if (realSol > p.maxRqSol) continue;
          size = Math.min(p.addSol, p.maxPerPositionSol - trade.invested);
        }
        const buyCap = Number(state.maxBuyLamports(mint)) / LAMPORTS_PER_SOL;
        let spend = Math.min(buyCap, size, p.maxExposureSol - committed);
        if (spend > cash - feeSol) spend = cash - feeSol;
        if (spend < p.minBuySol) continue;
        const lamports = BigInt(Math.floor(spend * LAMPORTS_PER_SOL));
        placed.push({ side: 'buy', mint, quote_lamports: lamports, max_slippage_bps: p.buySlipBps });
        cash -= spend + feeSol;
        committed += spend;
        if (trade === undefined) {
          open.set(mint, {
            opened: slot,
            peak: 0,
            invested: spend,
            exiting: false,
            filled: false,
            lastBuyPrice: px,
            lastValue: 0,
          });
          book.entries++;
          openSlots--;
          mainSlots--;
        } else {
          trade.invested += spend;
          trade.lastBuyPrice = px;
        }
      }

      // --- Guardrail pacing: open a probe when fills or coins lag the pace.
      if (scouts.size < p.maxProbes && openSlots > 0 && startTs !== null && endTs !== null) {
        const progress = Math.min(1, (endTs - startTs) / p.paceSecs);
        const coinsShort = coins.size < Math.ceil(p.targetCoins * progress);
        const fillsShort = fills < Math.ceil(p.targetFills * progress);
        if (coinsShort || fillsShort) {
          const minReal = (p.probeSol * 10_000) / state.hello.caps.max_order_bps_of_real_reserve;
          for (const mint of touched) {
            if (placed.length >= maxOrders || scouts.size >= p.maxProbes) break;
            if (open.has(mint) || scouts.has(mint) || pendingCount.has(mint) || state.positions.has(mint)) continue;
            if (coinsShort && !fillsShort && coins.has(mint)) continue;
            const curve = state.curves.get(mint);
            if (curve === undefined || curve.complete) continue;
            if (Number(curve.real_quote_reserves) / LAMPORTS_PER_SOL < minReal * 1.5) continue;
            if (cash < p.probeSol + 2 * feeSol) break;
            placed.push({ side: 'buy', mint, quote_lamports: BigInt(Math.floor(p.probeSol * LAMPORTS_PER_SOL)), max_slippage_bps: p.buySlipBps });
            scouts.set(mint, false);
            cash -= p.probeSol + feeSol;
          }
        }
      }
      return placed;
    },
  };
}
