"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type PoolState = { price: number; spreadBps: number; lpMarkout: number; lpEquity: number };
type Hist = { tick: number; price: number; passiveLvr: number; wickLvr: number };
type LogEntry = { tick: number; tag: string; text: string; tone: "info" | "loss" | "win" | "muted" };
type TxEntry = { tick: number; label: string; hash: string };
type YourLp = { value: number; cost: number; pnl: number } | null;
type Stats = { blocks: number; trades: number; wickLpProfit: number; savedVsPassive: number };
type State = {
  tick: number; oraclePrice: number; passive: PoolState; wick: PoolState;
  history: Hist[]; log: LogEntry[]; txs: TxEntry[]; yourLp: YourLp; stats: Stats;
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
  if (tag === "REPRICE" || tag === "LP") return "var(--accent-2)";
  return "var(--muted)";
};

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
  const runningRef = useRef(false);

  const pull = useCallback(async () => {
    const r = await fetch("/api/state", { cache: "no-store" });
    if (r.ok) setState(await r.json());
  }, []);
  useEffect(() => {
    pull();
    fetch("/api/info").then((r) => r.json()).then(setInfo).catch(() => {});
  }, [pull]);

  // While idle, keep the dashboard fresh and recover from transient RPC blips.
  useEffect(() => {
    if (running) return;
    const id = setInterval(() => { pull(); }, 2500);
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
  const becomeLP = async () => { setBusy(true); await fetch("/api/lp", { method: "POST" }); await pull(); setBusy(false); };

  const passivePnl = state ? -state.passive.lpMarkout : 0;
  const wickPnl = state ? -state.wick.lpMarkout : 0;
  const shocked = (state?.wick.spreadBps ?? 0) > 80;
  const explorer = info?.explorer ?? null;
  const wickAddr = info?.addresses?.wick;
  const contractHref = explorer && wickAddr ? `${explorer}/address/${wickAddr}` : undefined;

  return (
    <div className="min-h-full">
      <TopBar tick={state?.tick ?? 0} running={running} oraclePrice={state?.oraclePrice ?? 0} onMonad={info?.onMonad ?? false} contractHref={contractHref} />

      <main className="mx-auto w-full max-w-[1180px] px-5 py-6">
        <div className="mb-4">
          <h2 className="text-[15px] font-semibold tracking-tight">LP profit from order flow <span className="text-muted">— vs simply holding</span></h2>
          <p className="mt-0.5 text-[12.5px] text-muted">Two pools, identical liquidity, identical trades. The passive pool leaks to arbitrage bots (LVR); WICK is repriced every block, so it earns the spread instead.</p>
        </div>

        {/* P&L + CHART */}
        <section className="panel overflow-hidden">
          <div className="grid grid-cols-2">
            <PnlCell label="Passive Uniswap" sub="static fee · stale between blocks" value={passivePnl} tone="down" caption="lost to arbitrageurs (LVR)" />
            <div className="divide-v"><PnlCell label="WICK" sub="AI agent · repriced every block" value={wickPnl} tone="up" caption="earned from the spread" running={running} /></div>
          </div>
          <div className="divide-h px-4 pb-4 pt-3">
            <div className="mb-2 flex items-center gap-4">
              <Legend color="var(--down)" label="Passive — bleeding to arbs" />
              <Legend color="var(--up)" label="WICK — earning spread" />
              <span className="label ml-auto hidden sm:block">cumulative LP profit ($) · per block</span>
            </div>
            <Chart history={state?.history ?? []} />
          </div>
        </section>

        {/* CONTROLS */}
        <section className="mt-3 flex flex-wrap items-center gap-2">
          <button onClick={toggleRun} className={`btn px-4 py-2 ${running ? "" : "btn-primary"}`}>{running ? "■ Pause" : "▶ Run simulation"}</button>
          <button onClick={step} disabled={running || busy} className="btn px-3.5 py-2">Step block</button>
          <button onClick={shock} disabled={busy} className="btn btn-danger px-3.5 py-2">⚡ Volatility shock</button>
          <div className="flex-1" />
          {state?.yourLp ? <YourPosition lp={state.yourLp} /> : <button onClick={becomeLP} disabled={busy} className="btn px-4 py-2" style={{ borderColor: "var(--accent)", color: "var(--accent-2)" }}>+ Provide liquidity</button>}
        </section>

        {/* BLOTTERS */}
        <section className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <AgentConsole log={state?.log ?? []} running={running} />
          <TxFeed txs={state?.txs ?? []} explorer={explorer} />
        </section>

        {/* STAT STRIP */}
        <StatStrip stats={state?.stats} />

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

function TopBar({ tick, running, oraclePrice, onMonad, contractHref }: { tick: number; running: boolean; oraclePrice: number; onMonad: boolean; contractHref?: string }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-[#08080a]/85 backdrop-blur-sm">
      <div className="mx-auto flex h-[52px] max-w-[1180px] items-center gap-3 px-5 py-2.5">
        <div className="flex items-center gap-2.5">
          <Mark />
          <span className="text-[15px] font-bold tracking-tight">WICK</span>
          <span className="hidden text-[11.5px] text-muted sm:inline">autonomous market maker</span>
        </div>
        <div className="ml-auto flex items-center gap-0 text-[12px]">
          <Stat k="WMON" v={usd(oraclePrice)} />
          <Sep />
          <Stat k="block" v={<span className="mono">{tick}</span>} />
          <Sep />
          <div className="flex items-center gap-1.5 px-3">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${running ? "blink" : ""}`} style={{ background: running ? "var(--up)" : "var(--muted)" }} />
            <span className="text-muted2">{running ? "live" : "idle"}</span>
          </div>
          <Sep />
          {contractHref ? (
            <a href={contractHref} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 hover:text-foreground" title="View on MonadScan">
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} />
              <span className="text-muted2">{onMonad ? "Monad Testnet ↗" : "local"}</span>
            </a>
          ) : (
            <div className="flex items-center gap-1.5 px-3"><span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} /><span className="text-muted2">{onMonad ? "Monad Testnet" : "local"}</span></div>
          )}
        </div>
      </div>
    </header>
  );
}
const Sep = () => <span className="h-3.5 w-px bg-border" />;
function Stat({ k, v }: { k: string; v: React.ReactNode }) {
  return <span className="flex items-baseline gap-1.5 px-3"><span className="text-muted">{k}</span><span className="mono text-foreground">{v}</span></span>;
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
      <div className="mono mt-2.5 text-[40px] font-semibold leading-none tracking-tight sm:text-[52px]" style={{ color }}>{usd(display, true)}</div>
      <div className="mt-2 text-[12px]" style={{ color }}>{value < 0 ? "▼ " : "▲ "}<span className="text-muted">{caption}</span></div>
    </div>
  );
}

function YourPosition({ lp }: { lp: NonNullable<YourLp> }) {
  const value = useCountUp(lp.value);
  const up = lp.pnl >= 0;
  return (
    <div className="panel-2 flex items-center gap-2.5 px-3.5 py-2 text-[12.5px]">
      <span className="text-muted">your LP position</span>
      <span className="mono font-semibold">{usd(value)}</span>
      <span className="mono" style={{ color: up ? "var(--up)" : "var(--down)" }}>{up ? "▲" : "▼"} {usd(lp.pnl, true)}</span>
    </div>
  );
}

function AgentConsole({ log, running }: { log: LogEntry[]; running: boolean }) {
  return (
    <div className="panel flex h-[286px] flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
        <span className="label">agent console</span>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted">{running ? <><span className="blink h-1.5 w-1.5 rounded-full" style={{ background: "var(--up)" }} /> thinking</> : "what the AI reads & decides"}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-2">
        {log.length === 0 && <p className="mt-16 text-center text-[12.5px] text-muted">Run the simulation — the agent narrates each block here.</p>}
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

function TxFeed({ txs, explorer }: { txs: TxEntry[]; explorer: string | null }) {
  return (
    <div className="panel flex h-[286px] flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
        <span className="label">on-chain transactions</span>
        <span className="ml-auto text-[11px] text-muted">{explorer ? "live · Monad testnet" : "local"}</span>
      </div>
      <div className="flex-1 overflow-y-auto px-2 py-1.5">
        {txs.length === 0 && <p className="mt-16 text-center text-[12.5px] text-muted">Every agent action is a real transaction — they stream here.</p>}
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

function StatStrip({ stats }: { stats?: Stats }) {
  const items = [
    { k: "blocks repriced", v: stats ? String(stats.blocks) : "0", c: "var(--text)" },
    { k: "trades routed", v: stats ? String(stats.trades) : "0", c: "var(--text)" },
    { k: "WICK LP profit", v: stats ? usd(stats.wickLpProfit, true) : "—", c: "var(--up)" },
    { k: "better off vs passive", v: stats ? usd(stats.savedVsPassive, true) : "—", c: "var(--up)" },
  ];
  return (
    <section className="panel mt-3 flex flex-wrap items-center">
      {items.map((it, i) => (
        <div key={it.k} className={`flex min-w-[150px] flex-1 items-baseline gap-2 px-4 py-3 ${i > 0 ? "divide-v" : ""}`}>
          <span className="label">{it.k}</span>
          <span className="mono ml-auto text-[15px] font-semibold" style={{ color: it.c }}>{it.v}</span>
        </div>
      ))}
    </section>
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
  const W = 1120, H = 244, padX = 8, padR = 52, padY = 16;
  if (history.length < 2) {
    return <div className="flex h-[200px] items-center justify-center rounded-md border border-border text-[12.5px] text-muted">Run the simulation to watch the two pools diverge.</div>;
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
      <path d={aP} fill="url(#ap)" />
      <path d={aW} fill="url(#aw)" />
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

function PoolTable({ title, tone, pool, oracle, reprices, shocked }: { title: string; tone: "down" | "up"; pool?: PoolState; oracle: number; reprices: boolean; shocked: boolean }) {
  const color = tone === "up" ? "var(--up)" : "var(--down)";
  const drift = pool ? pool.price - oracle : 0;
  const rows: [string, string, string?][] = [
    ["Quoted price", pool ? usd(pool.price) : "—"],
    ["Drift vs oracle", pool ? usd(drift, true) : "—", Math.abs(drift) > 1 ? "down" : undefined],
    ["Spread / fee", pool ? `${(pool.spreadBps / 100).toFixed(2)}%` : "—", shocked ? "up" : undefined],
    ["LP equity", pool ? usd(pool.lpEquity) : "—"],
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
            <span className="mono font-medium" style={{ color: t === "down" ? "var(--down)" : t === "up" ? "var(--up)" : "var(--text)" }}>{v}{t === "up" && shocked && k.startsWith("Spread") ? <span className="ml-1.5 text-[10px] text-muted">widened</span> : null}</span>
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
        <p><span className="text-muted2">Real revenue.</span> Market-making spread — how propAMMs capture 35–40% of Solana spot volume. No token, no emissions.</p>
        <p><span className="text-muted2">Only on Monad.</span> LVR = staleness × volatility; 400ms blocks give the shortest window on-chain, parallel execution reprices many pools at once.</p>
        <p><span className="text-muted2">Open &amp; on-chain.</span> Anyone LPs into propAMM-grade returns that today sit behind closed, single-MM dark pools. Same logic as a Uniswap v4 hook.</p>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-muted">
        <span>WICK · autonomous market maker · built on Monad</span>
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
