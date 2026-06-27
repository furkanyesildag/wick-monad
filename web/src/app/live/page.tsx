"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAccount, useConnect, useReadContracts } from "wagmi";
import { vaultAbi, MONAD_TESTNET_ID } from "@/lib/wagmi";

type PoolState = { price: number; spreadBps: number; lpMarkout: number; lpEquity: number };
type Hist = { tick: number; price: number; passiveLvr: number; wickLvr: number };
type LogEntry = { tick: number; tag: string; text: string; tone: "info" | "loss" | "win" | "muted" };
type TxEntry = { tick: number; label: string; hash: string };
type LpPoint = { tick: number; value: number; earned: number };
type YourLp = { value: number; cost: number; earned: number; returnPct: number; sinceBlock: number; history: LpPoint[] } | null;
type Stats = { blocks: number; trades: number; wickLpProfit: number; savedVsPassive: number };
type Ai = { regime: "calm" | "volatile" | "toxic"; spreadBps: number; reasoning: string } | null;
type Throughput = { total: number; perSec: number; perBlock: number };
type State = {
  tick: number; oraclePrice: number; monUsd: number; ai: Ai; throughput: Throughput;
  passive: PoolState; wick: PoolState; history: Hist[]; log: LogEntry[]; txs: TxEntry[]; yourLp: YourLp; stats: Stats;
};
type Info = { chainId: number; onMonad: boolean; explorer: string | null; addresses: Record<string, string> };

const TICK_MS = 600;

function usd(n: number, signed = false) {
  const s = n < 0 ? "−" : signed ? "+" : "";
  return `${s}$${Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function compact(n: number) {
  const s = n < 0 ? "−" : "";
  const a = Math.abs(n);
  return a >= 1000 ? `${s}$${(a / 1000).toFixed(1)}k` : `${s}$${a.toFixed(0)}`;
}
const short = (h: string) => `${h.slice(0, 6)}…${h.slice(-4)}`;
const toneColor = (t: LogEntry["tone"]) => (t === "loss" ? "var(--down)" : t === "win" ? "var(--up)" : t === "muted" ? "var(--muted)" : "var(--muted-2)");
const tagColor = (tag: string) => {
  if (tag === "ARB" || tag === "SHOCK") return "var(--down)";
  if (tag === "EARN") return "var(--up)";
  if (tag === "AI") return "var(--warn)";
  if (tag === "REPRICE" || tag === "LP") return "var(--accent-2)";
  return "var(--muted)";
};
const regimeColor = (r?: string) => (r === "toxic" ? "var(--down)" : r === "volatile" ? "var(--warn)" : "var(--up)");

function useCountUp(value: number, duration = 650) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current, to = value;
    if (from === to) return;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setDisplay(from + (to - from) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);
  return display;
}

export default function Home() {
  const [state, setState] = useState<State | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [lpAmount, setLpAmount] = useState(25000);
  const [showSim, setShowSim] = useState(false);
  const runningRef = useRef(false);

  const pull = useCallback(async () => {
    const r = await fetch("/api/state", { cache: "no-store" });
    if (r.ok) setState(await r.json());
  }, []);
  useEffect(() => {
    pull();
    fetch("/api/info").then((r) => r.json()).then(setInfo).catch(() => {});
  }, [pull]);
  useEffect(() => {
    if (running) return;
    const id = setInterval(() => pull(), 2500);
    return () => clearInterval(id);
  }, [running, pull]);

  const loop = useCallback(async () => {
    while (runningRef.current) {
      try {
        const r = await fetch("/api/tick", { method: "POST", cache: "no-store" });
        if (r.ok) setState(await r.json());
      } catch { /* keep going */ }
      await new Promise((res) => setTimeout(res, TICK_MS));
    }
  }, []);
  const toggleRun = () => { const n = !running; setRunning(n); runningRef.current = n; if (n) loop(); };
  const step = async () => { setBusy(true); const r = await fetch("/api/tick", { method: "POST", cache: "no-store" }); if (r.ok) setState(await r.json()); setBusy(false); };
  const shock = async () => { await fetch("/api/shock", { method: "POST" }); if (!running) step(); };
  const becomeLP = async (amountUsd: number) => { setBusy(true); await fetch("/api/lp", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ amountUsd }) }); await pull(); setBusy(false); };

  const passivePnl = state ? -state.passive.lpMarkout : 0;
  const wickPnl = state ? -state.wick.lpMarkout : 0;
  const shocked = (state?.wick.spreadBps ?? 0) > 80;
  const explorer = info?.explorer ?? null;
  const contractHref = explorer && info?.addresses?.wick ? `${explorer}/address/${info.addresses.wick}` : undefined;
  const aiLog = (state?.log ?? []).filter((e) => e.tag === "AI").slice(0, 3);

  return (
    <div className="min-h-full">
      <TopBar monUsd={state?.monUsd ?? 0} tick={state?.tick ?? 0} tps={state?.throughput?.perSec ?? 0} onMonad={info?.onMonad ?? false} contractHref={contractHref} />

      <main className="mx-auto w-full max-w-[1200px] px-5 py-6">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight">An AI runs your liquidity like a market maker <span className="text-muted"> ·  repriced every block on Monad</span></h2>
            <p className="mt-0.5 text-[12.5px] text-muted">Same liquidity, same real MON/USD price action, same trades. The passive pool leaks to bots (LVR); WICK&apos;s AI reprices every block and earns the spread instead.</p>
          </div>
          <button onClick={() => setShowSim((s) => !s)} className="mono shrink-0 rounded border border-border px-2 py-1 text-[10.5px] text-muted hover:text-foreground">{showSim ? "× close" : "ⓘ what is this?"}</button>
        </div>
        {showSim && <SimExplainer />}

        {/* AI BRAIN · the star */}
        <AiBrain ai={state?.ai ?? null} stream={aiLog} running={running} />

        {/* CONTROLS */}
        <Controls running={running} busy={busy} onRun={toggleRun} onStep={step} onShock={shock} />

        {/* COMPARISON */}
        <section className="panel mt-3 overflow-hidden">
          <div className="grid grid-cols-2">
            <PnlCell label="Passive Uniswap" sub="static fee · stale between blocks" value={passivePnl} tone="down" caption="lost to arbitrageurs (LVR)" />
            <div className="divide-v"><PnlCell label="WICK · AI propAMM" sub="repriced every block" value={wickPnl} tone="up" caption="earned from the spread" running={running} /></div>
          </div>
          <div className="divide-h px-4 pb-4 pt-3">
            <div className="mb-2 flex items-center gap-4">
              <Legend color="var(--down)" label="Passive · bleeding to arbs" />
              <Legend color="var(--up)" label="WICK · earning spread" />
              <span className="label ml-auto hidden sm:block">cumulative LP profit ($) · per block</span>
            </div>
            <Chart history={state?.history ?? []} />
          </div>
        </section>

        {/* MONAD THROUGHPUT */}
        <MonadThroughput throughput={state?.throughput} stats={state?.stats} />

        {/* LIVE CONSOLE */}
        <section className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <AgentConsole log={state?.log ?? []} running={running} />
          <TxFeed txs={state?.txs ?? []} explorer={explorer} tps={state?.throughput?.perSec ?? 0} />
        </section>

        {/* YOUR REAL WALLET POSITION (vault) */}
        <VaultPosition />

        {/* DEMO POSITION (wallet-free) */}
        <LpPanel lp={state?.yourLp ?? null} trades={state?.stats?.trades ?? 0} amount={lpAmount} setAmount={setLpAmount} onDeposit={becomeLP} busy={busy} running={running} />

        {/* POOL DETAIL */}
        <section className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PoolTable title="Passive Uniswap" tone="down" pool={state?.passive} oracle={state?.oraclePrice ?? 0} reprices={false} shocked={false} />
          <PoolTable title="WICK · propAMM" tone="up" pool={state?.wick} oracle={state?.oraclePrice ?? 0} reprices shocked={shocked} />
        </section>

        <Footer contractHref={contractHref} />
      </main>
    </div>
  );
}

function TopBar({ monUsd, tick, tps, onMonad, contractHref }: { monUsd: number; tick: number; tps: number; onMonad: boolean; contractHref?: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-[#08080a]/85 backdrop-blur-sm">
      <div className="mx-auto flex h-[52px] max-w-[1200px] items-center gap-3 px-5 py-2.5">
        <div className="flex items-center gap-2.5">
          <Link href="/" className="flex items-center gap-2.5"><Mark /><span className="text-[15px] font-bold tracking-tight">WICK</span></Link>
          <nav className="ml-2 hidden items-center gap-3 text-[12.5px] text-muted sm:flex">
            <span className="text-foreground">Live</span>
            <Link href="/app" className="hover:text-foreground">Earn ↗</Link>
          </nav>
        </div>
        <div className="ml-auto flex items-center gap-0 text-[12px]">
          <span className="hidden items-baseline gap-1.5 px-3 md:flex">
            <span className="text-muted">MON/USD</span>
            <span className="mono text-foreground">{monUsd > 0 ? `$${monUsd.toFixed(5)}` : " · "}</span>
            <span className="text-[10px]" style={{ color: "var(--accent-2)" }}>Pyth</span>
          </span>
          <Sep className="hidden md:block" />
          {/* Monad speed cluster */}
          <span className="flex items-center gap-2.5 px-3">
            <SpeedStat k="block" v="400ms" />
            <SpeedStat k="cap" v="10k TPS" />
            <span className="flex items-baseline gap-1" title="live throughput from this session">
              <span className="mono font-semibold" style={{ color: tps > 0 ? "var(--up)" : "var(--muted)" }}>{tps.toFixed(1)}</span>
              <span className="text-[10px] text-muted">tx/s</span>
            </span>
          </span>
          <Sep />
          {contractHref ? (
            <a href={contractHref} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 hover:text-foreground">
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} />
              <span className="text-muted2">{onMonad ? "Monad Testnet ↗" : "local"}</span>
            </a>
          ) : (
            <span className="flex items-center gap-1.5 px-3"><span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} /><span className="text-muted2">{onMonad ? "Monad Testnet" : "local"}</span></span>
          )}
        </div>
      </div>
    </header>
  );
}
const Sep = ({ className = "" }: { className?: string }) => <span className={`h-3.5 w-px bg-border ${className}`} />;
function SpeedStat({ k, v }: { k: string; v: string }) {
  return <span className="hidden items-baseline gap-1 lg:flex"><span className="text-muted">{k}</span><span className="mono text-foreground">{v}</span></span>;
}

function AiBrain({ ai, stream, running }: { ai: Ai; stream: LogEntry[]; running: boolean }) {
  const regime = ai?.regime ?? "calm";
  const col = regimeColor(regime);
  const spread = ai ? ai.spreadBps / 100 : 0;
  return (
    <section className="panel mt-3 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="label">AI market maker</span>
        <span className="rounded px-1.5 py-0.5 text-[10px] mono" style={{ background: "rgba(131,110,249,0.12)", color: "var(--accent-2)" }}>🦀 OpenClaw</span>
        <span className="ml-auto flex items-center gap-1.5 text-[11px]" style={{ color: running ? "var(--up)" : "var(--muted)" }}>
          {running && <span className="blink h-1.5 w-1.5 rounded-full" style={{ background: "var(--up)" }} />}{running ? "deciding live" : "idle"}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[300px_1fr]">
        <div className="flex items-center gap-4">
          <div className="rounded-lg border px-3 py-2 text-center" style={{ borderColor: col, background: `${col}14`, minWidth: 104 }}>
            <div className="label" style={{ color: col }}>regime</div>
            <div className="mt-0.5 text-[18px] font-bold uppercase tracking-wide" style={{ color: col }}>{regime}</div>
          </div>
          <div>
            <div className="label">quoting spread</div>
            <div className="mono text-[30px] font-semibold leading-none" style={{ color: col }}>{ai ? `${spread.toFixed(2)}%` : " · "}</div>
          </div>
        </div>
        <div className="min-w-0">
          <div className="label mb-1">what the OpenClaw agent 🦀 is deciding</div>
          <p className="text-[14px] leading-snug text-foreground">{ai ? `“${ai.reasoning}”` : "Run the simulation · the OpenClaw agent reads the live MON/USD price action and sets the spread to protect LPs while winning flow."}</p>
          {stream.length > 1 && (
            <div className="mt-3 space-y-1 border-t border-border/60 pt-2">
              {stream.slice(1).map((e, i) => (
                <div key={i} className="truncate text-[11.5px] text-muted"><span className="mono mr-2 text-muted/70">blk {e.tick}</span>{e.text}</div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function Controls({ running, busy, onRun, onStep, onShock }: { running: boolean; busy: boolean; onRun: () => void; onStep: () => void; onShock: () => void }) {
  return (
    <section className="mt-3 flex items-center gap-2">
      <button onClick={onRun} className={`btn flex items-center gap-2 px-3.5 py-2 ${running ? "" : "btn-primary"}`}>
        <span>{running ? "⏸" : "▶"}</span>{running ? "Pause" : "Run"}
      </button>
      <button onClick={onStep} disabled={running || busy} className="btn px-3 py-2" title="advance one block">⏭ Step</button>
      <button onClick={onShock} disabled={busy} className="btn btn-danger px-3 py-2" title="simulate a real volatility event">⚡ Shock</button>
      <span className="ml-1 hidden text-[11.5px] text-muted sm:inline">{running ? "agent live · sending real txs to Monad" : "press Run to start the agent"}</span>
    </section>
  );
}

function MonadThroughput({ throughput, stats }: { throughput?: Throughput; stats?: Stats }) {
  const tps = useCountUp(throughput?.perSec ?? 0, 400);
  const total = throughput?.total ?? 0;
  const items = [
    { k: "live throughput", v: `${tps.toFixed(1)} tx/s`, c: "var(--up)", note: `${throughput?.perBlock ?? 5} txs / block` },
    { k: "txs sent this session", v: total.toLocaleString(), c: "var(--text)", note: "all on-chain, on Monad" },
    { k: "block time", v: "400ms", c: "var(--accent-2)", note: "sub-second finality" },
    { k: "WICK LP profit", v: stats ? usd(stats.wickLpProfit, true) : " · ", c: "var(--up)", note: stats ? `${usd(stats.savedVsPassive, true)} vs passive` : "" },
  ];
  return (
    <section className="panel mt-3">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2 text-[11px]">
        <span className="label">Monad throughput</span>
        <span className="ml-auto text-muted">per-block repricing across many pools needs 10,000 TPS &amp; 400ms blocks · only Monad</span>
      </div>
      <div className="flex flex-wrap items-stretch">
        {items.map((it, i) => (
          <div key={it.k} className={`flex min-w-[180px] flex-1 flex-col gap-0.5 px-4 py-3 ${i > 0 ? "divide-v" : ""}`}>
            <span className="label">{it.k}</span>
            <span className="mono text-[20px] font-semibold leading-tight" style={{ color: it.c }}>{it.v}</span>
            <span className="text-[10.5px] text-muted">{it.note}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SimExplainer() {
  return (
    <div className="panel-2 mb-3 p-3.5 text-[12.5px] leading-relaxed text-muted2">
      <p><span className="text-foreground">Live on Monad testnet · real contracts, real transactions.</span> The price is driven by the <span className="text-foreground">real MON/USD feed from Pyth</span> (replayed & time-compressed so a few hours of market plays out in minutes). A real OpenClaw agent 🦀 decides the spread each move and writes its reasoning above.</p>
      <p className="mt-1.5">The agent pushes the <span className="text-foreground">same</span> arbitrage + retail trades through both pools, so the only variable is WICK&apos;s per-block repricing. Every number is read from chain; every line in the tx feed is a transaction you can open on MonadScan. The shock button simulates a real volatility event.</p>
    </div>
  );
}

function PnlCell({ label, sub, value, tone, caption, running }: { label: string; sub: string; value: number; tone: "down" | "up"; caption: string; running?: boolean }) {
  const display = useCountUp(value);
  const color = tone === "up" ? "var(--up)" : "var(--down)";
  return (
    <div className="p-4 sm:p-5">
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-semibold">{label}</span>
        {running && tone === "up" && <span className="blink text-[10px]" style={{ color: "var(--up)" }}>●</span>}
        <span className="ml-auto text-[11px] text-muted">{sub}</span>
      </div>
      <div className="mono mt-2.5 text-[38px] font-semibold leading-none tracking-tight sm:text-[48px]" style={{ color }}>{usd(display, true)}</div>
      <div className="mt-2 text-[12px]" style={{ color }}>{value < 0 ? "▼ " : "▲ "}<span className="text-muted">{caption}</span></div>
    </div>
  );
}

function AgentConsole({ log, running }: { log: LogEntry[]; running: boolean }) {
  return (
    <div className="panel flex h-[268px] flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
        <span className="label">agent console</span>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted">{running ? <><span className="blink h-1.5 w-1.5 rounded-full" style={{ background: "var(--up)" }} /> live</> : "what the agent reads & does"}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {log.length === 0 && <p className="mt-14 text-center text-[12.5px] text-muted">Run the simulation · the agent narrates each block here.</p>}
        <div className="space-y-[3px]">
          {log.map((e, i) => (
            <div key={`${e.tick}-${i}`} className="flex items-center gap-2 text-[12.5px] leading-5">
              <span className="mono w-8 shrink-0 text-right text-[11px] text-muted">{e.tick}</span>
              <span className="tag w-[58px] shrink-0 text-center" style={{ color: tagColor(e.tag), borderColor: "var(--border)" }}>{e.tag}</span>
              <span className="truncate" style={{ color: toneColor(e.tone) }}>{e.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TxFeed({ txs, explorer, tps }: { txs: TxEntry[]; explorer: string | null; tps: number }) {
  return (
    <div className="panel flex h-[268px] flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
        <span className="label">on-chain transactions</span>
        <span className="ml-auto flex items-center gap-2 text-[11px] text-muted">
          <span className="mono" style={{ color: tps > 0 ? "var(--up)" : "var(--muted)" }}>{tps.toFixed(1)} tx/s</span>
          {explorer ? "· Monad testnet" : "· local"}
        </span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-1.5">
        {txs.length === 0 && <p className="mt-14 text-center text-[12.5px] text-muted">Every agent action is a real transaction · they stream here.</p>}
        {txs.map((tx, i) => {
          const href = explorer ? `${explorer}/tx/${tx.hash}` : undefined;
          const inner = (
            <div className="flex items-center gap-2 rounded px-2 py-[5px] text-[12.5px] leading-5 hover:bg-[#15151b]">
              <span className="mono w-8 shrink-0 text-right text-[11px] text-muted">{tx.tick}</span>
              <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--up)" }} />
              <span className="min-w-0 flex-1 truncate text-muted2">{tx.label}</span>
              <span className="mono shrink-0 text-[11.5px]" style={{ color: href ? "var(--accent-2)" : "var(--muted)" }}>{short(tx.hash)}{href && " ↗"}</span>
            </div>
          );
          return href ? <a key={`${tx.hash}-${i}`} href={href} target="_blank" rel="noreferrer">{inner}</a> : <div key={`${tx.hash}-${i}`}>{inner}</div>;
        })}
      </div>
    </div>
  );
}

// ---------- chart ----------
function smoothPath(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

function Chart({ history }: { history: Hist[] }) {
  const W = 1140, H = 230, padX = 8, padR = 52, padY = 14;
  if (history.length < 2) {
    return <div className="flex h-[190px] items-center justify-center rounded-md border border-border text-[12.5px] text-muted">Run the simulation to watch the two pools diverge.</div>;
  }
  const pass = history.map((h) => -h.passiveLvr), wick = history.map((h) => -h.wickLvr);
  const all = [...pass, ...wick, 0];
  let min = Math.min(...all), max = Math.max(...all);
  const pad = (max - min) * 0.12 || 1; min -= pad; max += pad;
  const span = max - min || 1;
  const x = (i: number) => padX + (i / (history.length - 1)) * (W - padX - padR);
  const y = (v: number) => padY + (1 - (v - min) / span) * (H - padY * 2);
  const lp = smoothPath(pass.map((v, i) => ({ x: x(i), y: y(v) })));
  const lw = smoothPath(wick.map((v, i) => ({ x: x(i), y: y(v) })));
  const aP = `${lp} L ${x(pass.length - 1).toFixed(2)} ${y(min).toFixed(2)} L ${x(0).toFixed(2)} ${y(min).toFixed(2)} Z`;
  const aW = `${lw} L ${x(wick.length - 1).toFixed(2)} ${y(min).toFixed(2)} L ${x(0).toFixed(2)} ${y(min).toFixed(2)} Z`;
  const grid = Array.from({ length: 5 }, (_, i) => min + (span * i) / 4);
  let sIdx = -1, sMax = 0;
  for (let i = 1; i < history.length; i++) { const d = history[i].passiveLvr - history[i - 1].passiveLvr; if (d > sMax) { sMax = d; sIdx = i; } }
  const showShock = sMax > 30;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <defs>
        <linearGradient id="aw" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--up)" stopOpacity="0.16" /><stop offset="100%" stopColor="var(--up)" stopOpacity="0" /></linearGradient>
        <linearGradient id="ap" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--down)" stopOpacity="0.14" /><stop offset="100%" stopColor="var(--down)" stopOpacity="0" /></linearGradient>
      </defs>
      {grid.map((g, i) => (
        <g key={i}>
          <line x1={padX} y1={y(g)} x2={W - padR} y2={y(g)} stroke="var(--border)" strokeWidth={1} />
          <text x={W - padR + 6} y={y(g) + 3} fontSize="10" fill="var(--muted)" className="mono">{compact(g)}</text>
        </g>
      ))}
      <line x1={padX} y1={y(0)} x2={W - padR} y2={y(0)} stroke="#33333d" strokeWidth={1} strokeDasharray="2 3" />
      {showShock && (
        <g>
          <line x1={x(sIdx)} y1={padY} x2={x(sIdx)} y2={H - padY} stroke="rgba(246,70,93,0.35)" strokeWidth={1} strokeDasharray="2 3" />
          <text x={x(sIdx) + 4} y={padY + 9} fontSize="9.5" fill="var(--down)" className="mono">SHOCK</text>
        </g>
      )}
      <path d={aP} fill="url(#ap)" /><path d={aW} fill="url(#aw)" />
      <path d={lp} fill="none" stroke="var(--down)" strokeWidth={1.8} strokeLinecap="round" />
      <path d={lw} fill="none" stroke="var(--up)" strokeWidth={1.8} strokeLinecap="round" />
      <circle cx={x(pass.length - 1)} cy={y(pass[pass.length - 1])} r={3} fill="var(--down)" />
      <circle cx={x(wick.length - 1)} cy={y(wick[wick.length - 1])} r={3} fill="var(--up)" />
    </svg>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return <span className="flex items-center gap-1.5 text-[11.5px] text-muted2"><span className="inline-block h-2 w-2 rounded-[2px]" style={{ background: color }} /> {label}</span>;
}

function VaultPosition() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors } = useConnect();
  const [vault, setVault] = useState<`0x${string}` | null>(null);
  const [explorer, setExplorer] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  useEffect(() => {
    fetch("/api/info").then((r) => r.json()).then((d) => { setVault(d.addresses?.vault ?? null); setExplorer(d.explorer ?? null); }).catch(() => {});
  }, []);
  const reads = useReadContracts({
    contracts: vault && address
      ? [
          { address: vault, abi: vaultAbi, functionName: "assetsOf", args: [address] },
          { address: vault, abi: vaultAbi, functionName: "earnedOf", args: [address] },
          { address: vault, abi: vaultAbi, functionName: "shares", args: [address] },
        ]
      : [],
    query: { enabled: !!vault && !!address, refetchInterval: 4000 },
  });
  const [assets, earned, shares] = (reads.data ?? []).map((r) => r.result as bigint | undefined);
  const has = shares !== undefined && shares > 0n;
  const mon = (w?: bigint, dp = 4) => (w === undefined ? "—" : (Number(w) / 1e18).toLocaleString("en-US", { maximumFractionDigits: dp }));
  const wrongChain = isConnected && chainId !== MONAD_TESTNET_ID;
  const aiEarn = async () => { setWorking(true); await fetch("/api/app/earn", { method: "POST" }); setTimeout(() => reads.refetch(), 1000); setTimeout(() => setWorking(false), 1600); };

  return (
    <section className="panel mt-3">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="label">your wallet · real MON in WICK</span>
        <span className="ml-auto text-[11px] text-muted">{isConnected ? (wrongChain ? "switch to Monad Testnet" : "live from the vault") : "connect to view"}</span>
      </div>
      {!isConnected ? (
        <div className="flex flex-wrap items-center gap-3 px-4 py-4">
          <p className="text-[12.5px] text-muted2">Connect your wallet to see the real MON you deposited. New here? Deposit on the Earn page first.</p>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => connect({ connector: connectors[0] })} className="btn btn-primary px-4 py-1.5 text-[12.5px]">Connect MetaMask</button>
            <Link href="/app" className="btn px-3.5 py-1.5 text-[12.5px]" style={{ borderColor: "var(--accent)", color: "var(--accent-2)" }}>Deposit MON →</Link>
          </div>
        </div>
      ) : !has ? (
        <div className="flex flex-wrap items-center gap-3 px-4 py-4">
          <p className="text-[12.5px] text-muted2">No position yet for {address?.slice(0, 6)}…{address?.slice(-4)}. Deposit MON and the OpenClaw agent 🦀 puts it to work.</p>
          <Link href="/app" className="btn btn-primary ml-auto px-4 py-1.5 text-[12.5px]">Deposit MON →</Link>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-3 px-4 py-4">
          <div>
            <div className="label">your MON in WICK</div>
            <div className="mono text-[28px] font-semibold leading-none">{mon(assets)} <span className="text-[14px] text-muted">MON</span></div>
          </div>
          <div>
            <div className="label">earned</div>
            <div className="mono mt-1 text-[16px] font-semibold" style={{ color: "var(--up)" }}>+{mon(earned !== undefined && earned < 0n ? -earned : earned, 5)} MON</div>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={aiEarn} disabled={working} className="btn px-3.5 py-2 text-[12.5px]" style={{ borderColor: "var(--accent)", color: "var(--accent-2)" }}>{working ? "working…" : "🦀 Let the agent work"}</button>
            <Link href="/app" className="btn px-3.5 py-2 text-[12.5px]">Manage →</Link>
            {explorer && vault && <a href={`${explorer}/address/${vault}`} target="_blank" rel="noreferrer" className="mono text-[11px] hover:text-foreground" style={{ color: "var(--accent-2)" }}>vault ↗</a>}
          </div>
        </div>
      )}
    </section>
  );
}

function LpPanel({ lp, trades, amount, setAmount, onDeposit, busy, running }: {
  lp: YourLp; trades: number; amount: number; setAmount: (n: number) => void; onDeposit: (n: number) => void; busy: boolean; running: boolean;
}) {
  if (!lp) {
    const amounts = [5000, 25000, 100000];
    return (
      <section className="panel mt-3">
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
          <span className="label">earn · provide liquidity</span>
          <span className="ml-auto text-[11px] text-muted">a real MetaMask deposit page is next · this seeds a demo position</span>
        </div>
        <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
          <p className="max-w-md text-[12.5px] text-muted2">Put money into the WICK pool and the AI market-makes it every block · you earn the spread it captures instead of bleeding to bots like a passive LP.</p>
          <div className="flex items-center gap-2 sm:ml-auto">
            {amounts.map((a) => (
              <button key={a} onClick={() => setAmount(a)} className="btn px-3 py-1.5 text-[12.5px]" style={amount === a ? { borderColor: "var(--accent)", color: "var(--accent-2)", background: "rgba(131,110,249,0.08)" } : undefined}>${a.toLocaleString()}</button>
            ))}
            <button onClick={() => onDeposit(amount)} disabled={busy} className="btn btn-primary px-4 py-1.5 text-[12.5px]">{busy ? "Depositing…" : `Deposit $${amount.toLocaleString()} →`}</button>
          </div>
        </div>
      </section>
    );
  }
  return <LivePosition lp={lp} trades={trades} setAmount={setAmount} onDeposit={onDeposit} busy={busy} running={running} />;
}

function LivePosition({ lp, trades, setAmount, onDeposit, busy, running }: {
  lp: NonNullable<YourLp>; trades: number; setAmount: (n: number) => void; onDeposit: (n: number) => void; busy: boolean; running: boolean;
}) {
  const earned = useCountUp(lp.earned);
  const value = useCountUp(lp.value);
  return (
    <section className="panel mt-3">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="label">your position</span>
        <span className="ml-auto flex items-center gap-1.5 text-[11px]" style={{ color: running ? "var(--up)" : "var(--muted)" }}>
          {running && <span className="blink h-1.5 w-1.5 rounded-full" style={{ background: "var(--up)" }} />}{running ? "earning live" : `since block ${lp.sinceBlock}`}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-4 px-4 py-4 lg:grid-cols-[1fr_320px]">
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div>
            <div className="label">spread earned</div>
            <div className="mono text-[34px] font-semibold leading-none" style={{ color: "var(--up)" }}>{usd(earned, true)}</div>
          </div>
          <Field k="position value" v={usd(value)} />
          <Field k="deposited" v={usd(lp.cost)} />
          <Field k="return" v={`+${Math.abs(lp.returnPct).toFixed(3)}%`} color="var(--up)" />
          <div className="w-full text-[11.5px] text-muted">your share of the spread WICK captured from {trades.toLocaleString()} trades · no LVR, unlike a passive LP · withdraw anytime
            <span className="ml-2 inline-flex items-center gap-1.5">
              {[5000, 25000].map((a) => <button key={a} onClick={() => { setAmount(a); onDeposit(a); }} disabled={busy} className="btn px-2 py-0.5 text-[11px]">+ ${a.toLocaleString()}</button>)}
            </span>
          </div>
        </div>
        <div className="panel-2 p-2">
          <div className="label px-1 pb-1">spread earned over time</div>
          <LpSparkline history={lp.history} />
        </div>
      </div>
    </section>
  );
}

function Field({ k, v, color }: { k: string; v: string; color?: string }) {
  return <div><div className="label">{k}</div><div className="mono mt-1 text-[18px] font-semibold" style={{ color: color ?? "var(--text)" }}>{v}</div></div>;
}

function LpSparkline({ history }: { history: LpPoint[] }) {
  const W = 320, H = 96, p = 6;
  if (history.length < 2) return <div className="flex h-[96px] items-center justify-center text-[11.5px] text-muted">run the simulation to watch it grow</div>;
  const vals = history.map((h) => h.earned);
  const lo = Math.min(...vals, 0), hi = Math.max(...vals, 0);
  const span = hi - lo || 1;
  const x = (i: number) => p + (i / (history.length - 1)) * (W - p * 2);
  const y = (v: number) => p + (1 - (v - lo) / span) * (H - p * 2);
  const line = smoothPath(history.map((h, i) => ({ x: x(i), y: y(h.earned) })));
  const area = `${line} L ${x(history.length - 1).toFixed(2)} ${y(lo).toFixed(2)} L ${x(0).toFixed(2)} ${y(lo).toFixed(2)} Z`;
  const col = "var(--up)";
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <defs><linearGradient id="lpA" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={col} stopOpacity="0.18" /><stop offset="100%" stopColor={col} stopOpacity="0" /></linearGradient></defs>
      <line x1={p} y1={y(0)} x2={W - p} y2={y(0)} stroke="var(--border-2)" strokeWidth={1} strokeDasharray="2 3" />
      <path d={area} fill="url(#lpA)" />
      <path d={line} fill="none" stroke={col} strokeWidth={1.8} strokeLinecap="round" />
      <circle cx={x(history.length - 1)} cy={y(history[history.length - 1].earned)} r={3} fill={col} />
    </svg>
  );
}

function PoolTable({ title, tone, pool, oracle, reprices, shocked }: { title: string; tone: "down" | "up"; pool?: PoolState; oracle: number; reprices: boolean; shocked: boolean }) {
  const color = tone === "up" ? "var(--up)" : "var(--down)";
  const drift = pool ? pool.price - oracle : 0;
  const rows: [string, string, ("down" | "up")?][] = [
    ["Quoted price", pool ? usd(pool.price) : " · "],
    ["Drift vs oracle", pool ? usd(drift, true) : " · ", Math.abs(drift) > 1 ? "down" : undefined],
    ["Spread / fee", pool ? `${(pool.spreadBps / 100).toFixed(2)}%` : " · ", shocked ? "up" : undefined],
    ["LP equity", pool ? usd(pool.lpEquity) : " · "],
  ];
  return (
    <div className="panel">
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
        <span className="text-[13px] font-semibold">{title}</span>
        <span className="mono text-[10.5px]" style={{ color }}>{reprices ? "per-block repricing" : "stale between blocks"}</span>
      </div>
      <div className="px-4 py-1">
        {rows.map(([k, v, t], i) => (
          <div key={k} className={`flex items-center justify-between py-2 text-[12.5px] ${i > 0 ? "border-t border-border/60" : ""}`}>
            <span className="text-muted">{k}</span>
            <span className="mono font-medium" style={{ color: t === "down" ? "var(--down)" : t === "up" ? "var(--up)" : "var(--text)" }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Footer({ contractHref }: { contractHref?: string }) {
  return (
    <footer className="mt-5 border-t border-border pt-4">
      <div className="grid grid-cols-1 gap-x-8 gap-y-2 text-[12px] text-muted sm:grid-cols-3">
        <p><span className="text-muted2">Real AI.</span> An OpenClaw agent 🦀 sets the spread every block from real Pyth price action · not a fixed curve.</p>
        <p><span className="text-muted2">Only on Monad.</span> Per-block repricing across many pools needs 400ms blocks + 10,000 TPS + parallel execution.</p>
        <p><span className="text-muted2">Real revenue.</span> The market-making spread · how propAMMs capture 35–40% of Solana spot volume. No token, no emissions.</p>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-muted">
        <span>WICK · AI market maker · built on Monad</span>
        {contractHref && <a href={contractHref} target="_blank" rel="noreferrer" className="mono hover:text-foreground" style={{ color: "var(--accent-2)" }}>WICK contract ↗</a>}
      </div>
    </footer>
  );
}

function Mark() {
  return (
    <div className="grid h-7 w-7 place-items-center rounded-md border border-border" style={{ background: "#0d0b16" }}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
        <line x1="7" y1="1" x2="7" y2="13" stroke="var(--accent-2)" strokeWidth="1.5" strokeLinecap="round" />
        <rect x="4" y="4" width="6" height="6" rx="1.5" fill="var(--accent)" />
      </svg>
    </div>
  );
}
