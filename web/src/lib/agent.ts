import "server-only";
import { account, pub, wallet, ADDR, WAD, oracleAbi, poolAbi, wickAbi, erc20Abi } from "./contracts";

// ----------------------------------------------------------------------------
// Singleton sim state (survives dev HMR via globalThis).
// ----------------------------------------------------------------------------
export type HistPoint = { tick: number; price: number; passiveLvr: number; wickLvr: number };

type Sim = {
  tick: number;
  shockQueued: boolean;
  approvalsDone: boolean;
  busy: boolean;
  history: HistPoint[];
};

const g = globalThis as unknown as { __wickSim?: Sim };
export const sim: Sim =
  g.__wickSim ?? (g.__wickSim = { tick: 0, shockQueued: false, approvalsDone: false, busy: false, history: [] });

function bsqrt(x: bigint): bigint {
  if (x < 2n) return x;
  let z = (x + 1n) / 2n;
  let y = x;
  while (z < y) {
    y = z;
    z = (x / z + z) / 2n;
  }
  return y;
}

// Send a tx and wait for it to be mined. No fixed gas limit — viem estimates a tight
// limit, which matters on Monad (gas is charged on the limit, not the amount used).
async function send(args: Parameters<typeof wallet.writeContract>[0]) {
  const hash = await wallet.writeContract(args);
  await pub.waitForTransactionReceipt({ hash });
  return hash;
}

// Best-effort tx that never throws the whole tick (e.g. a swap that would revert).
async function trySend(args: Parameters<typeof wallet.writeContract>[0]) {
  try {
    return await send(args);
  } catch {
    return undefined;
  }
}

async function ensureApprovals() {
  if (sim.approvalsDone) return;
  const MAX = 1n << 255n;
  for (const token of [ADDR.wmon, ADDR.usdc]) {
    for (const pool of [ADDR.passive, ADDR.wick]) {
      await send({ address: token, abi: erc20Abi, functionName: "approve", args: [pool, MAX], account, chain: undefined });
    }
  }
  sim.approvalsDone = true;
}

async function swap(pool: `0x${string}`, baseIn: boolean, amountIn: bigint) {
  if (amountIn <= 0n) return;
  return trySend({ address: pool, abi: poolAbi, functionName: "swap", args: [baseIn, amountIn, 0n], account, chain: undefined });
}

// Optimal arb that drags the passive (x*y=k) pool back to external price P.
async function arbPassive(P: bigint) {
  const [Rb, Rq] = await Promise.all([
    pub.readContract({ address: ADDR.passive, abi: poolAbi, functionName: "reserveBase" }) as Promise<bigint>,
    pub.readContract({ address: ADDR.passive, abi: poolAbi, functionName: "reserveQuote" }) as Promise<bigint>,
  ]);
  const k = Rb * Rq;
  const targetRb = bsqrt((k / P) * WAD);
  if (targetRb === 0n) return;
  if (targetRb < Rb) await swap(ADDR.passive, false, k / targetRb - Rq);
  else if (targetRb > Rb) await swap(ADDR.passive, true, targetRb - Rb);
}

// Benign retail flow that hits BOTH pools and pays the fee/spread.
async function retail(seed: number, price: bigint) {
  const sellBase = seed % 2 === 0;
  const sizeBase = (2n + BigInt(seed % 5)) * (WAD / 10n); // 0.2 - 0.6 WMON
  if (sellBase) {
    await swap(ADDR.passive, true, sizeBase);
    return swap(ADDR.wick, true, sizeBase);
  }
  const sizeQuote = (sizeBase * price) / WAD;
  await swap(ADDR.passive, false, sizeQuote);
  return swap(ADDR.wick, false, sizeQuote);
}

const toNum = (x: bigint, dec = 18) => Number(x) / 10 ** dec;

// One full agent tick: move the fair price, reprice WICK, let the arb skim the
// stale passive pool, and run benign retail flow through both.
export async function runTick() {
  if (sim.busy) return;
  sim.busy = true;
  try {
    await ensureApprovals();

    const prev = (await pub.readContract({ address: ADDR.oracle, abi: oracleAbi, functionName: "price" })) as bigint;

    let bps = Math.floor(Math.random() * 201) - 100; // -100..+100
    if (sim.shockQueued) {
      bps = 500; // +5% volatility shock
      sim.shockQueued = false;
    }
    const newPrice = prev + (prev * BigInt(bps)) / 10_000n;
    const diff = newPrice > prev ? newPrice - prev : prev - newPrice;
    const volBps = prev === 0n ? 0n : (diff * 10_000n) / prev;

    // 1) oracle moves, 2) WICK agent reprices to fair (passive does nothing)
    await send({ address: ADDR.oracle, abi: oracleAbi, functionName: "pushPrice", args: [newPrice], account, chain: undefined });
    await send({ address: ADDR.wick, abi: wickAbi, functionName: "reprice", args: [newPrice, volBps], account, chain: undefined });

    // 3) arb drags stale passive to fair (skips WICK — no edge), 4) retail both
    if (newPrice !== prev) await arbPassive(newPrice);
    await retail(sim.tick, newPrice);

    sim.tick += 1;

    const [pLvr, wLvr] = await Promise.all([
      pub.readContract({ address: ADDR.passive, abi: poolAbi, functionName: "lpMarkout" }) as Promise<bigint>,
      pub.readContract({ address: ADDR.wick, abi: poolAbi, functionName: "lpMarkout" }) as Promise<bigint>,
    ]);
    sim.history.push({ tick: sim.tick, price: toNum(newPrice), passiveLvr: toNum(pLvr), wickLvr: toNum(wLvr) });
    if (sim.history.length > 80) sim.history.shift();
  } finally {
    sim.busy = false;
  }
}

export async function readState() {
  const [op, pRes, pLvr, pEq, wPeg, wSpread, wLvr, wEq] = await Promise.all([
    pub.readContract({ address: ADDR.oracle, abi: oracleAbi, functionName: "price" }) as Promise<bigint>,
    pub.readContract({ address: ADDR.passive, abi: poolAbi, functionName: "quotedPrice" }) as Promise<readonly [bigint, bigint]>,
    pub.readContract({ address: ADDR.passive, abi: poolAbi, functionName: "lpMarkout" }) as Promise<bigint>,
    pub.readContract({ address: ADDR.passive, abi: poolAbi, functionName: "lpEquityQuote" }) as Promise<bigint>,
    pub.readContract({ address: ADDR.wick, abi: wickAbi, functionName: "pegPrice" }) as Promise<bigint>,
    pub.readContract({ address: ADDR.wick, abi: wickAbi, functionName: "dynamicFeeBps" }) as Promise<bigint>,
    pub.readContract({ address: ADDR.wick, abi: poolAbi, functionName: "lpMarkout" }) as Promise<bigint>,
    pub.readContract({ address: ADDR.wick, abi: poolAbi, functionName: "lpEquityQuote" }) as Promise<bigint>,
  ]);
  return {
    tick: sim.tick,
    oraclePrice: toNum(op),
    passive: { price: toNum(pRes[0]), spreadBps: Number(pRes[1]), lpMarkout: toNum(pLvr), lpEquity: toNum(pEq) },
    wick: { price: toNum(wPeg), spreadBps: Number(wSpread), lpMarkout: toNum(wLvr), lpEquity: toNum(wEq) },
    history: sim.history,
  };
}

export async function becomeLP(): Promise<{ ok: boolean; shares: number }> {
  await ensureApprovals();
  const baseAmt = 20n * WAD; // 20 WMON
  const [Rb, Rq] = await Promise.all([
    pub.readContract({ address: ADDR.wick, abi: poolAbi, functionName: "reserveBase" }) as Promise<bigint>,
    pub.readContract({ address: ADDR.wick, abi: poolAbi, functionName: "reserveQuote" }) as Promise<bigint>,
  ]);
  const quoteAmt = (baseAmt * Rq) / Rb;
  await send({ address: ADDR.wmon, abi: erc20Abi, functionName: "mint", args: [account.address, baseAmt], account, chain: undefined });
  await send({ address: ADDR.usdc, abi: erc20Abi, functionName: "mint", args: [account.address, quoteAmt], account, chain: undefined });
  await send({ address: ADDR.wick, abi: poolAbi, functionName: "addLiquidity", args: [baseAmt, quoteAmt], account, chain: undefined });
  return { ok: true, shares: toNum(baseAmt) };
}

export function queueShock() {
  sim.shockQueued = true;
}
