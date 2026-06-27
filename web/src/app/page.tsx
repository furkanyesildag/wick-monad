"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type PoolState = { price: number; spreadBps: number; lpMarkout: number; lpEquity: number };
type Hist = { tick: number; price: number; passiveLvr: number; wickLvr: number };
type State = { tick: number; oraclePrice: number; passive: PoolState; wick: PoolState; history: Hist[] };
type Info = { chainId: number; onMonad: boolean; explorer: string | null; addresses: Record<string, string> };

const TICK_MS = 650;

function usd(n: number, signed = false) {
  const s = n < 0 ? "−" : signed ? "+" : "";
  const v = Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${s}$${v}`;
}
function compact(n: number) {
  const s = n < 0 ? "−" : "";
  const a = Math.abs(n);
  if (a >= 1000) return `${s}$${(a / 1000).toFixed(1)}k`;
  return `${s}$${a.toFixed(0)}`;
}

function useCountUp(value: number, duration = 700) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef(0);
  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
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
  const [lpMsg, setLpMsg] = useState<string | null>(null);
  const runningRef = useRef(false);

  const pull = useCallback(async () => {
    const r = await fetch("/api/state", { cache: "no-store" });
    if (r.ok) setState(await r.json());
  }, []);

  useEffect(() => {
    pull();
    fetch("/api/info").then((r) => r.json()).then(setInfo).catch(() => {});
  }, [pull]);

  const loop = useCallback(async () => {
    while (runningRef.current) {
      try {
        const r = await fetch("/api/tick", { method: "POST", cache: "no-store" });
        if (r.ok) setState(await r.json());
      } catch {
        /* keep going */
      }
      await new Promise((res) => setTimeout(res, TICK_MS));
    }
  }, []);

  const toggleRun = () => {
    const next = !running;
    setRunning(next);
    runningRef.current = next;
    if (next) loop();
  };
  const step = async () => {
    setBusy(true);
    const r = await fetch("/api/tick", { method: "POST", cache: "no-store" });
    if (r.ok) setState(await r.json());
    setBusy(false);
  };
  const shock = async () => {
    await fetch("/api/shock", { method: "POST" });
    if (!running) step();
  };
  const becomeLP = async () => {
    setBusy(true);
    setLpMsg("Depositing into the WICK pool…");
    const r = await fetch("/api/lp", { method: "POST" });
    setLpMsg(r.ok ? "You're a WICK LP — your share of every spread now accrues to you." : "LP deposit failed.");
    await pull();
    setBusy(false);
  };

  const passivePnl = state ? -state.passive.lpMarkout : 0;
  const wickPnl = state ? -state.wick.lpMarkout : 0;
  const shocked = (state?.wick.spreadBps ?? 0) > 80;
  const wickAddr = info?.addresses?.wick;
  const explorerHref = info?.explorer && wickAddr ? `${info.explorer}/address/${wickAddr}` : undefined;

  return (
    <main className="relative z-10 mx-auto w-full max-w-6xl px-5 py-7 sm:py-9">
      <Header
        tick={state?.tick ?? 0}
        running={running}
        oraclePrice={state?.oraclePrice ?? 0}
        onMonad={info?.onMonad ?? false}
        explorerHref={explorerHref}
      />

      {/* HERO */}
      <section className="glass mt-6 overflow-hidden p-6 sm:p-8">
        <div className="text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-purple-bright/80">
            LP profit from order flow · vs simply holding
          </p>
          <p className="mt-2 text-sm text-muted">
            Same liquidity. Same price action. Same trades.{" "}
            <span className="text-foreground/85">One pool bleeds to bots — the other earns the spread.</span>
          </p>
        </div>

        <div className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <HeroCard label="Passive Uniswap" sub="static fee · never reprices" value={passivePnl} tone="loss" caption="skimmed by arbitrageurs (LVR)" />
          <HeroCard label="WICK" sub="AI agent reprices every block" value={wickPnl} tone="win" caption="earned from the spread" running={running} />
        </div>

        <Chart history={state?.history ?? []} />
      </section>

      {/* CONTROLS */}
      <section className="mt-5 flex flex-wrap items-center gap-3">
        <button onClick={toggleRun} className={`btn px-5 py-2.5 ${running ? "" : "btn-primary"}`} style={running ? { background: "rgba(131,110,249,0.08)" } : undefined}>
          {running ? "❚❚ Pause" : "▶ Run simulation"}
        </button>
        <button onClick={step} disabled={running || busy} className="btn glass-soft px-4 py-2.5 text-foreground/90">
          Step one block
        </button>
        <button onClick={shock} disabled={busy} className="btn px-4 py-2.5" style={{ background: "rgba(255,79,139,0.12)", borderColor: "rgba(255,79,139,0.45)", color: "#ffc6da" }}>
          ⚡ Volatility shock
        </button>
        <div className="flex-1" />
        <button onClick={becomeLP} disabled={busy} className="btn px-5 py-2.5" style={{ background: "rgba(131,110,249,0.14)", borderColor: "var(--monad-purple)", color: "#d9d1ff" }}>
          + Become a WICK LP
        </button>
      </section>
      {lpMsg && <p className="mt-2.5 text-sm text-purple-bright">{lpMsg}</p>}

      {/* POOL DETAIL */}
      <section className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <PoolCard title="Passive Uniswap" tone="loss" pool={state?.passive} oracle={state?.oraclePrice ?? 0} reprices={false} shocked={false} />
        <PoolCard title="WICK · propAMM" tone="win" pool={state?.wick} oracle={state?.oraclePrice ?? 0} reprices shocked={shocked} />
      </section>

      <Footer explorerHref={explorerHref} />
    </main>
  );
}

function Header({ tick, running, oraclePrice, onMonad, explorerHref }: { tick: number; running: boolean; oraclePrice: number; onMonad: boolean; explorerHref?: string }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3.5">
        <WickMark running={running} />
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-[26px] font-bold leading-none tracking-tight">WICK</h1>
            <span className="hidden text-xs font-medium text-purple-bright/70 sm:inline">autonomous market maker</span>
          </div>
          <p className="mt-1.5 text-[12.5px] text-muted">An AI runs your liquidity like a pro market maker — repriced every block on Monad.</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="chip flex items-center gap-2 px-3 py-1.5 text-xs">
          <span className={`inline-block h-2 w-2 rounded-full ${running ? "live-dot" : ""}`} style={{ background: running ? "var(--monad-purple)" : "var(--muted)" }} />
          {running ? "agent active" : "idle"}
        </span>
        <span className="chip px-3 py-1.5 text-xs"><span className="text-muted">block</span> <span className="mono">{tick}</span></span>
        <span className="chip px-3 py-1.5 text-xs"><span className="text-muted">oracle</span> <span className="mono">{usd(oraclePrice)}</span></span>
        <MonadBadge onMonad={onMonad} explorerHref={explorerHref} />
      </div>
    </header>
  );
}

function HeroCard({ label, sub, value, tone, caption, running }: { label: string; sub: string; value: number; tone: "loss" | "win"; caption: string; running?: boolean }) {
  const display = useCountUp(value);
  const color = tone === "loss" ? "var(--loss)" : "var(--win)";
  const glow = tone === "loss" ? "glow-loss" : "glow-win";
  const win = tone === "win";
  return (
    <div className="glass-soft relative overflow-hidden p-5" style={win ? { borderColor: "rgba(131,110,249,0.3)" } : { borderColor: "rgba(255,79,139,0.22)" }}>
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-2">
          <p className="font-semibold">{label}</p>
          {win && running && <span className="thinking-bar h-1 w-10 rounded-full" />}
        </div>
        <p className="text-[11px] text-muted">{sub}</p>
      </div>
      <p className={`mono mt-3 text-[44px] font-extrabold leading-none sm:text-[58px] ${glow}`} style={{ color, letterSpacing: "-0.02em" }}>
        {usd(display, true)}
      </p>
      <p className="mt-2.5 flex items-center gap-1.5 text-sm" style={{ color }}>
        {value < 0 ? "▼" : "▲"} <span className="text-muted">{caption}</span>
      </p>
    </div>
  );
}

// ---- premium chart ----
function smoothPath(pts: { x: number; y: number }[]) {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

function Chart({ history }: { history: Hist[] }) {
  const W = 960;
  const H = 300;
  const padX = 14;
  const padY = 22;
  if (history.length < 2) {
    return (
      <div className="mt-6 flex h-[260px] items-center justify-center rounded-2xl border text-sm text-muted" style={{ borderColor: "var(--hair)", background: "rgba(0,0,0,0.2)" }}>
        Press <span className="mono mx-1.5 text-purple-bright">▶ Run simulation</span> to watch the two pools diverge.
      </div>
    );
  }
  const pass = history.map((h) => -h.passiveLvr);
  const wick = history.map((h) => -h.wickLvr);
  const all = [...pass, ...wick, 0];
  let min = Math.min(...all);
  let max = Math.max(...all);
  const pad = (max - min) * 0.12 || 1;
  min -= pad;
  max += pad;
  const span = max - min || 1;
  const x = (i: number) => padX + (i / (history.length - 1)) * (W - padX * 2);
  const y = (v: number) => padY + (1 - (v - min) / span) * (H - padY * 2);
  const ptsPass = pass.map((v, i) => ({ x: x(i), y: y(v) }));
  const ptsWick = wick.map((v, i) => ({ x: x(i), y: y(v) }));
  const linePass = smoothPath(ptsPass);
  const lineWick = smoothPath(ptsWick);
  const areaPass = `${linePass} L ${x(pass.length - 1).toFixed(2)} ${y(min).toFixed(2)} L ${x(0).toFixed(2)} ${y(min).toFixed(2)} Z`;
  const areaWick = `${lineWick} L ${x(wick.length - 1).toFixed(2)} ${y(min).toFixed(2)} L ${x(0).toFixed(2)} ${y(min).toFixed(2)} Z`;
  const zeroY = y(0);

  // gridlines
  const ticks = 4;
  const grid = Array.from({ length: ticks + 1 }, (_, i) => min + (span * i) / ticks);

  // shock marker = biggest single-step jump in passive LVR (raw)
  let shockIdx = -1;
  let shockMax = 0;
  for (let i = 1; i < history.length; i++) {
    const d = history[i].passiveLvr - history[i - 1].passiveLvr;
    if (d > shockMax) { shockMax = d; shockIdx = i; }
  }
  const showShock = shockMax > 30;

  return (
    <div className="mt-6">
      <div className="mb-2.5 flex items-center gap-4 text-xs">
        <Legend color="var(--loss)" label="Passive Uniswap — bleeding to arbs" />
        <Legend color="var(--win)" label="WICK — earning the spread" />
        <span className="ml-auto hidden text-muted sm:inline">cumulative LP profit ($) · per block →</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full rounded-2xl border" style={{ borderColor: "var(--hair)", background: "linear-gradient(180deg, rgba(0,0,0,0.28), rgba(32,0,82,0.12))" }}>
        <defs>
          <linearGradient id="winArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--monad-purple)" stopOpacity="0.34" />
            <stop offset="100%" stopColor="var(--monad-purple)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="lossArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--loss)" stopOpacity="0.26" />
            <stop offset="100%" stopColor="var(--loss)" stopOpacity="0" />
          </linearGradient>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="3.2" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>

        {grid.map((g, i) => (
          <g key={i}>
            <line x1={padX} y1={y(g)} x2={W - padX} y2={y(g)} stroke="var(--hair)" strokeWidth={1} />
            <text x={padX + 2} y={y(g) - 4} fontSize="10" fill="var(--muted)" className="mono">{compact(g)}</text>
          </g>
        ))}
        <line x1={padX} y1={zeroY} x2={W - padX} y2={zeroY} stroke="rgba(165,148,255,0.35)" strokeWidth={1} strokeDasharray="2 4" />

        {showShock && (
          <g>
            <line x1={x(shockIdx)} y1={padY} x2={x(shockIdx)} y2={H - padY} stroke="rgba(255,79,139,0.4)" strokeWidth={1} strokeDasharray="3 4" />
            <text x={x(shockIdx) + 5} y={padY + 10} fontSize="10" fill="var(--loss)">⚡ shock</text>
          </g>
        )}

        <path d={areaPass} fill="url(#lossArea)" />
        <path d={areaWick} fill="url(#winArea)" />
        <path d={linePass} fill="none" stroke="var(--loss)" strokeWidth={2.4} filter="url(#glow)" strokeLinecap="round" />
        <path d={lineWick} fill="none" stroke="var(--win)" strokeWidth={2.6} filter="url(#glow)" strokeLinecap="round" />

        <circle className="endpoint" cx={x(pass.length - 1)} cy={y(pass[pass.length - 1])} r={5} fill="var(--loss)" filter="url(#glow)" />
        <circle className="endpoint" cx={x(wick.length - 1)} cy={y(wick[wick.length - 1])} r={5} fill="var(--win)" filter="url(#glow)" />
      </svg>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-foreground/70">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} /> {label}
    </span>
  );
}

function PoolCard({ title, tone, pool, oracle, reprices, shocked }: { title: string; tone: "loss" | "win"; pool?: PoolState; oracle: number; reprices: boolean; shocked: boolean }) {
  const color = tone === "loss" ? "var(--loss)" : "var(--win)";
  const drift = pool ? pool.price - oracle : 0;
  return (
    <div className="glass p-5">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{title}</h3>
        <span className="rounded-full px-2.5 py-1 text-[11px] font-medium" style={{ background: `${color}1f`, color }}>
          {reprices ? "per-block repricing" : "stale between blocks"}
        </span>
      </div>
      <div className="hairline my-4 h-px" />
      <dl className="grid grid-cols-2 gap-y-3.5 text-sm">
        <Row k="Quoted price" v={pool ? usd(pool.price) : "—"} />
        <Row k="Drift vs oracle" v={pool ? usd(drift, true) : "—"} tone={Math.abs(drift) > 1 ? "loss" : undefined} />
        <Row k="Spread (fee)" v={pool ? `${(pool.spreadBps / 100).toFixed(2)}%` : "—"} tone={shocked ? "win" : undefined} note={shocked ? "widened on shock" : undefined} />
        <Row k="LP equity" v={pool ? usd(pool.lpEquity) : "—"} />
      </dl>
    </div>
  );
}

function Row({ k, v, tone, note }: { k: string; v: string; tone?: "loss" | "win"; note?: string }) {
  const color = tone === "loss" ? "var(--loss)" : tone === "win" ? "var(--win)" : "var(--foreground)";
  return (
    <div>
      <dt className="text-[12px] text-muted">{k}</dt>
      <dd className="mono mt-0.5 font-semibold" style={{ color }}>
        {v} {note && <span className="ml-1 text-[10px] font-normal text-muted">{note}</span>}
      </dd>
    </div>
  );
}

function Footer({ explorerHref }: { explorerHref?: string }) {
  return (
    <>
      <section className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Why title="Real revenue" body="Market-making spread — the model propAMMs use to capture 35–40% of Solana spot volume. Not a token. Not emissions." />
        <Why title="Only on Monad" body="LVR = staleness window × volatility. 400ms blocks give the shortest window on-chain; parallel execution reprices hundreds of pools at once." />
        <Why title="Open & on-chain" body="Anyone can LP into propAMM-grade returns that today sit behind closed, single-MM dark pools. Same logic as a Uniswap v4 hook." />
      </section>
      <footer className="mt-7 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
        <span>WICK · autonomous market maker · built on Monad</span>
        {explorerHref && (
          <a href={explorerHref} target="_blank" rel="noreferrer" className="chip px-3 py-1.5 text-purple-bright hover:text-foreground">
            View WICK contract on MonadScan ↗
          </a>
        )}
      </footer>
    </>
  );
}

function Why({ title, body }: { title: string; body: string }) {
  return (
    <div className="glass-soft p-4">
      <p className="text-sm font-semibold text-purple-bright">{title}</p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{body}</p>
    </div>
  );
}

function MonadBadge({ onMonad, explorerHref }: { onMonad: boolean; explorerHref?: string }) {
  const inner = (
    <span className="chip flex items-center gap-1.5 px-3 py-1.5 text-xs" style={{ borderColor: "rgba(131,110,249,0.4)" }}>
      <MonadMark /> <span className="text-foreground/85">{onMonad ? "Monad Testnet" : "local"}</span>
    </span>
  );
  return onMonad && explorerHref ? (
    <a href={explorerHref} target="_blank" rel="noreferrer" className="hover:opacity-80">{inner}</a>
  ) : inner;
}

function WickMark({ running }: { running: boolean }) {
  return (
    <div className={`grid h-11 w-11 place-items-center rounded-[14px] ${running ? "agent-thinking" : ""}`} style={{ background: "linear-gradient(160deg, rgba(131,110,249,0.28), rgba(32,0,82,0.5))", border: "1px solid rgba(131,110,249,0.5)" }}>
      <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden>
        <line x1="11" y1="2" x2="11" y2="20" stroke="var(--monad-purple-bright)" strokeWidth="2" strokeLinecap="round" />
        <rect x="6.5" y="6.5" width="9" height="9" rx="2.5" fill="var(--monad-purple)" />
      </svg>
    </div>
  );
}

function MonadMark() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 2C7 2 3 6.5 3 12s4 10 9 10c2-3 3-6.4 3-10S14 5 12 2Z" fill="var(--monad-purple)" />
      <path d="M12 2c5 0 9 4.5 9 10s-4 10-9 10c2-3 3-6.4 3-10S14 5 12 2Z" fill="var(--monad-purple-bright)" opacity="0.7" />
    </svg>
  );
}
