import "server-only";
import { account, pub, wallet, ADDR, WAD, oracleAbi, poolAbi, wickAbi, erc20Abi } from "./contracts";
import { getLiveMonUsd, getRealSeries } from "./pyth";
import { getAiPolicy, aiEnabled, type AiPolicy } from "./ai";

// Real MON/USD moves a few % over hours; amplify modestly so the genuine path is watchable
// in minutes while staying realistic (calm most of the time, with occasional real spikes).
const PRICE_AMPLIFY = 12;

// ----------------------------------------------------------------------------
// Singleton sim state (survives dev HMR via globalThis).
// ----------------------------------------------------------------------------
export type HistPoint = { tick: number; price: number; passiveLvr: number; wickLvr: number };
export type LogEntry = { tick: number; tag: string; text: string; tone: "info" | "loss" | "win" | "muted" };
export type TxEntry = { tick: number; label: string; hash: string };

export type LpPoint = { tick: number; value: number; earned: number };

type Sim = {
  tick: number;
  shockQueued: boolean;
  approvalsDone: boolean;
  busy: boolean;
  trades: number;
  history: HistPoint[];
  log: LogEntry[];
  txs: TxEntry[];
  lpActive: boolean;
  lpShares: bigint;
  lpCost: number;
  lpDepositTick: number;
  lpJoinWickLvr: number; // WICK lpMarkout at the moment the user joined
  lpHistory: LpPoint[];
  realSeries: number[]; // real MON/USD closes from Pyth, replayed as the price path
  realIdx: number;
  liveMonUsd: number; // latest real MON/USD spot (for the ticker)
  aiPolicy: AiPolicy | null; // latest spread/regime decision from the AI
  aiBusy: boolean;
};

const g = globalThis as unknown as { __wickSim?: Sim };
export const sim: Sim =
  g.__wickSim ??
  (g.__wickSim = {
    tick: 0, shockQueued: false, approvalsDone: false, busy: false, trades: 0,
    history: [], log: [], txs: [], lpActive: false, lpShares: 0n, lpCost: 0, lpDepositTick: 0, lpJoinWickLvr: 0, lpHistory: [],
    realSeries: [], realIdx: 0, liveMonUsd: 0, aiPolicy: null, aiBusy: false,
  });
// Backfill fields if an older-shaped singleton persisted across an HMR reload.
sim.log ??= [];
sim.txs ??= [];
sim.trades ??= 0;
sim.lpActive ??= false;
sim.lpShares ??= 0n;
sim.lpCost ??= 0;
sim.lpDepositTick ??= 0;
sim.lpJoinWickLvr ??= 0;
sim.lpHistory ??= [];
sim.realSeries ??= [];
sim.realIdx ??= 0;
sim.liveMonUsd ??= 0;
sim.aiPolicy ??= null;
sim.aiBusy ??= false;

const toNum = (x: bigint, dec = 18) => Number(x) / 10 ** dec;
const fmtUsd = (n: number) => `$${Math.abs(n).toLocaleString("en-US", { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`;

function bsqrt(x: bigint): bigint {
  if (x < 2n) return x;
  let z = (x + 1n) / 2n;
  let y = x;
  while (z < y) { y = z; z = (x / z + z) / 2n; }
  return y;
}

function note(blk: number, tag: string, text: string, tone: LogEntry["tone"] = "info") {
  sim.log.unshift({ tick: blk, tag, text, tone });
  if (sim.log.length > 40) sim.log.pop();
}

// Explicit nonce management: submitting a block's ~5 txs without awaiting each receipt
// (for speed) races viem's auto-nonce, so we assign nonces ourselves.
let nonceCounter = 0;
async function syncNonce() {
  nonceCounter = await pub.getTransactionCount({ address: account.address, blockTag: "pending" });
}

// Submit a tx and record it in the on-chain feed, WITHOUT waiting for the receipt —
// the caller batches the receipt waits so a block's txs confirm in parallel (snappy on
// Monad). No fixed gas limit: viem estimates a tight one (gas is charged on the limit).
// The nonce only advances on a successful submit, so a skipped/reverting tx leaves no gap.
async function submit(blk: number, label: string, args: Parameters<typeof wallet.writeContract>[0]) {
  const nonce = nonceCounter;
  const hash = await wallet.writeContract({ ...args, nonce } as typeof args);
  nonceCounter = nonce + 1;
  sim.txs.unshift({ tick: blk, label, hash });
  if (sim.txs.length > 28) sim.txs.pop();
  return hash;
}

// Submit AND wait — for one-time ops (approvals, LP deposit) where ordering matters.
async function sendTx(blk: number, label: string, args: Parameters<typeof wallet.writeContract>[0]) {
  const hash = await submit(blk, label, args);
  await pub.waitForTransactionReceipt({ hash });
  return hash;
}

async function ensureApprovals(blk: number) {
  if (sim.approvalsDone) return;
  const MAX = 1n << 255n;
  for (const token of [ADDR.wmon, ADDR.usdc]) {
    for (const pool of [ADDR.passive, ADDR.wick]) {
      await sendTx(blk, "Approve token", { address: token, abi: erc20Abi, functionName: "approve", args: [pool, MAX], account, chain: undefined });
    }
  }
  sim.approvalsDone = true;
}

async function swap(bag: `0x${string}`[], blk: number, label: string, pool: `0x${string}`, baseIn: boolean, amountIn: bigint) {
  if (amountIn <= 0n) return;
  try {
    const h = await submit(blk, label, { address: pool, abi: poolAbi, functionName: "swap", args: [baseIn, amountIn, 0n], account, chain: undefined });
    sim.trades += 1;
    bag.push(h);
  } catch {
    /* a swap that would revert (e.g. inventory) is simply skipped */
  }
}

// Optimal arb that drags the passive (x*y=k) pool back to external price P.
async function arbPassive(bag: `0x${string}`[], blk: number, P: bigint) {
  const [Rb, Rq] = await Promise.all([
    pub.readContract({ address: ADDR.passive, abi: poolAbi, functionName: "reserveBase" }) as Promise<bigint>,
    pub.readContract({ address: ADDR.passive, abi: poolAbi, functionName: "reserveQuote" }) as Promise<bigint>,
  ]);
  const k = Rb * Rq;
  const targetRb = bsqrt((k / P) * WAD);
  if (targetRb === 0n) return;
  if (targetRb < Rb) await swap(bag, blk, "arb → passive", ADDR.passive, false, k / targetRb - Rq);
  else if (targetRb > Rb) await swap(bag, blk, "arb → passive", ADDR.passive, true, targetRb - Rb);
}

async function retail(bag: `0x${string}`[], blk: number, seed: number, price: bigint) {
  const sellBase = seed % 2 === 0;
  const sizeBase = (1n + BigInt(seed % 4)) * WAD; // 1 - 4 WMON of retail flow per pool
  if (sellBase) {
    await swap(bag, blk, "retail → passive", ADDR.passive, true, sizeBase);
    await swap(bag, blk, "retail → WICK", ADDR.wick, true, sizeBase);
  } else {
    const sizeQuote = (sizeBase * price) / WAD;
    await swap(bag, blk, "retail → passive", ADDR.passive, false, sizeQuote);
    await swap(bag, blk, "retail → WICK", ADDR.wick, false, sizeQuote);
  }
}

// One full agent tick: move the fair price, reprice WICK, let the arb skim the
// stale passive pool, and run benign retail flow through both — narrating as it goes.
export async function runTick() {
  if (sim.busy) return;
  sim.busy = true;
  const blk = sim.tick + 1;
  try {
    await syncNonce();
    await ensureApprovals(blk);

    const prev = (await pub.readContract({ address: ADDR.oracle, abi: oracleAbi, functionName: "price" })) as bigint;

    const shocked = sim.shockQueued;
    if (shocked) sim.shockQueued = false;
    // Drive the price off REAL MON/USD data from Pyth (replayed, amplified for the demo).
    if (sim.realSeries.length === 0) sim.realSeries = await getRealSeries();
    if (blk % 8 === 1) { const live = await getLiveMonUsd(); if (live) sim.liveMonUsd = live; }
    let bps: number;
    if (shocked) {
      bps = 500; // stress test: simulate a real volatility event
    } else if (sim.realSeries.length > 1) {
      const s = sim.realSeries;
      const a = s[sim.realIdx % s.length];
      sim.realIdx = (sim.realIdx + 1) % s.length;
      bps = Math.round((s[sim.realIdx % s.length] / a - 1) * 10_000 * PRICE_AMPLIFY);
    } else {
      bps = Math.floor(Math.random() * 201) - 100; // fallback if Pyth is unreachable
    }
    const newPrice = prev + (prev * BigInt(bps)) / 10_000n;
    const diff = newPrice > prev ? newPrice - prev : prev - newPrice;
    const volBps = prev === 0n ? 0n : (diff * 10_000n) / prev;
    const pct = (Number(newPrice) - Number(prev)) / Number(prev) * 100;

    const prevP = sim.history.at(-1)?.passiveLvr ?? 0;
    const prevW = sim.history.at(-1)?.wickLvr ?? 0;

    const bag: `0x${string}`[] = [];
    note(blk, shocked ? "SHOCK" : "ORACLE", `${shocked ? "+5% jump — " : ""}fair price ${fmtUsd(toNum(newPrice))} (${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%)`, shocked ? "loss" : "info");
    bag.push(await submit(blk, "push oracle", { address: ADDR.oracle, abi: oracleAbi, functionName: "pushPrice", args: [newPrice], account, chain: undefined }));

    // Fire the AI brain (async — keeps ticks fast) to set the spread policy for upcoming blocks.
    // A shock always asks the AI (even if a periodic call is in flight) so it reacts on-camera.
    if (aiEnabled() && (shocked || blk % 4 === 0) && (shocked || !sim.aiBusy)) {
      sim.aiBusy = true;
      const h = sim.history;
      const rr: number[] = [];
      for (let i = Math.max(1, h.length - 5); i < h.length; i++) rr.push((h[i].price / h[i - 1].price - 1) * 100);
      rr.push(pct);
      getAiPolicy({ priceChangePct: pct, recentReturnsPct: rr, volPct: Number(volBps) / 100, shock: shocked })
        .then((p) => { if (p) { sim.aiPolicy = p; note(sim.tick, "AI", p.reasoning, p.regime === "calm" ? "win" : "loss"); } })
        .finally(() => { sim.aiBusy = false; });
    }

    // Spread comes from the AI policy (fallback: volatility-scaled). Convert to the contract's
    // vol arg so the on-chain half-spread equals the AI's target: spread = baseFee(5) + vol/2.
    const aiSpreadBps = sim.aiPolicy ? sim.aiPolicy.spreadBps : Math.min(5 + Number(volBps) / 2, 500);
    const volForContract = BigInt(Math.max(0, Math.round(2 * (aiSpreadBps - 5))));
    const regimeTxt = sim.aiPolicy ? ` · AI: ${sim.aiPolicy.regime}` : "";
    note(blk, "REPRICE", `WICK pegged to fair · spread ${(aiSpreadBps / 100).toFixed(2)}%${regimeTxt}`, "info");
    bag.push(await submit(blk, "reprice WICK", { address: ADDR.wick, abi: wickAbi, functionName: "reprice", args: [newPrice, volForContract], account, chain: undefined }));

    if (newPrice !== prev) await arbPassive(bag, blk, newPrice);
    await retail(bag, blk, sim.tick, newPrice);

    // Txs share one sender in nonce order, so waiting on the last confirms them all —
    // one receipt poll instead of ~5 (keeps us under the RPC's request limit).
    if (bag.length) await pub.waitForTransactionReceipt({ hash: bag[bag.length - 1] });

    sim.tick += 1;

    const [pLvr, wLvr, wTotal, wEq] = await Promise.all([
      pub.readContract({ address: ADDR.passive, abi: poolAbi, functionName: "lpMarkout" }) as Promise<bigint>,
      pub.readContract({ address: ADDR.wick, abi: poolAbi, functionName: "lpMarkout" }) as Promise<bigint>,
      pub.readContract({ address: ADDR.wick, abi: poolAbi, functionName: "totalShares" }) as Promise<bigint>,
      pub.readContract({ address: ADDR.wick, abi: poolAbi, functionName: "lpEquityQuote" }) as Promise<bigint>,
    ]);
    const pNow = toNum(pLvr), wNow = toNum(wLvr);
    const dPassive = pNow - prevP; // >0 = passive LP lost this block
    const dWick = wNow - prevW; // <0 = wick LP earned this block
    if (dPassive > 0.5) note(blk, "ARB", `passive LP skimmed −${fmtUsd(dPassive)}`, "loss");
    if (dWick < -0.01) note(blk, "EARN", `WICK LPs earned +${fmtUsd(-dWick)} from spread`, "win");

    sim.history.push({ tick: sim.tick, price: toNum(newPrice), passiveLvr: pNow, wickLvr: wNow });
    if (sim.history.length > 80) sim.history.shift();

    // Track the user's value + spread earned over time so the dashboard shows it grow.
    if (sim.lpActive && sim.lpShares > 0n && wTotal > 0n) {
      const frac = Number(sim.lpShares) / Number(wTotal);
      const value = frac * toNum(wEq);
      const earned = frac * (sim.lpJoinWickLvr - wNow); // user's share of pool spread since join
      sim.lpHistory.push({ tick: sim.tick, value, earned });
      if (sim.lpHistory.length > 80) sim.lpHistory.shift();
    }
  } finally {
    sim.busy = false;
  }
}

type OnChain = {
  oraclePrice: number;
  passive: { price: number; spreadBps: number; lpMarkout: number; lpEquity: number };
  wick: { price: number; spreadBps: number; lpMarkout: number; lpEquity: number };
  yourLp: null | { value: number; cost: number; earned: number; returnPct: number; sinceBlock: number; history: LpPoint[] };
  passivePnl: number;
  wickPnl: number;
};
let lastOnChain: OnChain | null = null;

export async function readState() {
  let oc: OnChain;
  try {
    const [op, pRes, pLvr, pEq, wPeg, wSpread, wLvr, wEq, wTotal] = await Promise.all([
      pub.readContract({ address: ADDR.oracle, abi: oracleAbi, functionName: "price" }) as Promise<bigint>,
      pub.readContract({ address: ADDR.passive, abi: poolAbi, functionName: "quotedPrice" }) as Promise<readonly [bigint, bigint]>,
      pub.readContract({ address: ADDR.passive, abi: poolAbi, functionName: "lpMarkout" }) as Promise<bigint>,
      pub.readContract({ address: ADDR.passive, abi: poolAbi, functionName: "lpEquityQuote" }) as Promise<bigint>,
      pub.readContract({ address: ADDR.wick, abi: wickAbi, functionName: "pegPrice" }) as Promise<bigint>,
      pub.readContract({ address: ADDR.wick, abi: wickAbi, functionName: "dynamicFeeBps" }) as Promise<bigint>,
      pub.readContract({ address: ADDR.wick, abi: poolAbi, functionName: "lpMarkout" }) as Promise<bigint>,
      pub.readContract({ address: ADDR.wick, abi: poolAbi, functionName: "lpEquityQuote" }) as Promise<bigint>,
      pub.readContract({ address: ADDR.wick, abi: poolAbi, functionName: "totalShares" }) as Promise<bigint>,
    ]);
    const wickEquity = toNum(wEq);
    let yourLp: OnChain["yourLp"] = null;
    if (sim.lpActive && sim.lpShares > 0n && wTotal > 0n) {
      const frac = Number(sim.lpShares) / Number(wTotal);
      const value = frac * wickEquity;
      const earned = frac * (sim.lpJoinWickLvr - toNum(wLvr));
      yourLp = { value, cost: sim.lpCost, earned, returnPct: sim.lpCost > 0 ? (earned / sim.lpCost) * 100 : 0, sinceBlock: sim.lpDepositTick, history: sim.lpHistory };
    }
    oc = {
      oraclePrice: toNum(op),
      passive: { price: toNum(pRes[0]), spreadBps: Number(pRes[1]), lpMarkout: toNum(pLvr), lpEquity: toNum(pEq) },
      wick: { price: toNum(wPeg), spreadBps: Number(wSpread), lpMarkout: toNum(wLvr), lpEquity: wickEquity },
      yourLp,
      passivePnl: -toNum(pLvr),
      wickPnl: -toNum(wLvr),
    };
    lastOnChain = oc;
  } catch (e) {
    // RPC blip — serve the last good on-chain snapshot so the dashboard never blanks.
    if (!lastOnChain) throw e;
    oc = lastOnChain;
  }

  return {
    tick: sim.tick,
    monUsd: sim.liveMonUsd,
    ai: sim.aiPolicy,
    oraclePrice: oc.oraclePrice,
    passive: oc.passive,
    wick: oc.wick,
    history: sim.history,
    log: sim.log,
    txs: sim.txs,
    yourLp: oc.yourLp,
    stats: { blocks: sim.tick, trades: sim.trades, wickLpProfit: oc.wickPnl, savedVsPassive: oc.wickPnl - oc.passivePnl },
  };
}

export async function becomeLP(amountUsd: number): Promise<{ ok: boolean }> {
  const blk = sim.tick;
  await syncNonce();
  await ensureApprovals(blk);

  const [price, Rb, Rq, sharesBefore] = await Promise.all([
    pub.readContract({ address: ADDR.oracle, abi: oracleAbi, functionName: "price" }) as Promise<bigint>,
    pub.readContract({ address: ADDR.wick, abi: poolAbi, functionName: "reserveBase" }) as Promise<bigint>,
    pub.readContract({ address: ADDR.wick, abi: poolAbi, functionName: "reserveQuote" }) as Promise<bigint>,
    pub.readContract({ address: ADDR.wick, abi: poolAbi, functionName: "shares", args: [account.address] }) as Promise<bigint>,
  ]);
  // amountUsd is the total position value at the oracle mid. Size the deposit in the
  // pool's current ratio so the booked cost equals exactly what the user picked:
  //   value = quoteAmt + baseAmt·price = baseAmt·(ratio + price)  =>  baseAmt = amount/(ratio+price)
  const amountWad = BigInt(Math.max(1, Math.round(amountUsd))) * WAD;
  const ratio = (Rq * WAD) / Rb; // quote per base, 1e18
  const baseAmt = (amountWad * WAD) / (ratio + price);
  const quoteAmt = (baseAmt * Rq) / Rb;

  await sendTx(blk, "mint WMON", { address: ADDR.wmon, abi: erc20Abi, functionName: "mint", args: [account.address, baseAmt], account, chain: undefined });
  await sendTx(blk, "mint USDC", { address: ADDR.usdc, abi: erc20Abi, functionName: "mint", args: [account.address, quoteAmt], account, chain: undefined });
  await sendTx(blk, "deposit → WICK", { address: ADDR.wick, abi: poolAbi, functionName: "addLiquidity", args: [baseAmt, quoteAmt], account, chain: undefined });

  const [sharesAfter, totalAfter, eqAfter, wLvrNow] = await Promise.all([
    pub.readContract({ address: ADDR.wick, abi: poolAbi, functionName: "shares", args: [account.address] }) as Promise<bigint>,
    pub.readContract({ address: ADDR.wick, abi: poolAbi, functionName: "totalShares" }) as Promise<bigint>,
    pub.readContract({ address: ADDR.wick, abi: poolAbi, functionName: "lpEquityQuote" }) as Promise<bigint>,
    pub.readContract({ address: ADDR.wick, abi: poolAbi, functionName: "lpMarkout" }) as Promise<bigint>,
  ]);

  const firstTime = !sim.lpActive;
  if (firstTime) { sim.lpDepositTick = sim.tick; sim.lpHistory = []; sim.lpShares = 0n; sim.lpCost = 0; sim.lpJoinWickLvr = toNum(wLvrNow); }
  sim.lpShares += sharesAfter - sharesBefore;
  sim.lpCost += toNum(quoteAmt) + toNum(baseAmt) * toNum(price);
  sim.lpActive = true;

  const value = totalAfter > 0n ? (Number(sim.lpShares) / Number(totalAfter)) * toNum(eqAfter) : sim.lpCost;
  sim.lpHistory.push({ tick: sim.tick, value, earned: 0 });
  note(blk, "LP", `you deposited ${fmtUsd(toNum(quoteAmt) + toNum(baseAmt) * toNum(price))} — now earning the spread`, "win");
  return { ok: true };
}

export function queueShock() {
  sim.shockQueued = true;
}
