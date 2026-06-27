"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Info = { explorer: string | null; addresses: Record<string, string> };

export default function Landing() {
  const [monUsd, setMonUsd] = useState<number | null>(null);
  const [txTotal, setTxTotal] = useState<number | null>(null);
  const [info, setInfo] = useState<Info | null>(null);

  useEffect(() => {
    fetch("/api/info").then((r) => r.json()).then(setInfo).catch(() => {});
    fetch("/api/state", { cache: "no-store" }).then((r) => r.json()).then((d) => {
      if (typeof d.monUsd === "number") setMonUsd(d.monUsd);
      if (d.throughput?.total != null) setTxTotal(d.throughput.total);
    }).catch(() => {});
  }, []);

  const ex = info?.explorer;
  const wick = info?.addresses?.wick;
  const vault = info?.addresses?.vault;

  return (
    <div className="min-h-full">
      <Nav />

      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute -top-40 right-[-10%] h-[480px] w-[480px] rounded-full" style={{ background: "radial-gradient(circle, rgba(131,110,249,0.16), transparent 60%)" }} />
        <div className="mx-auto grid max-w-[1100px] items-center gap-10 px-5 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
          <div>
            <span className="chip inline-flex items-center gap-1.5 px-3 py-1 text-[11.5px]">
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} /> Live on Monad Testnet
            </span>
            <h1 className="mt-4 text-[40px] font-bold leading-[1.05] tracking-tight sm:text-[54px]">
              Your liquidity,<br /><span style={{ color: "var(--accent-2)" }}>market-made by an AI</span><br />— every block.
            </h1>
            <p className="mt-5 max-w-[540px] text-[15px] leading-relaxed text-muted2">
              On Uniswap, bots catch the real price before the pool updates and skim your liquidity — LPs have lost <span className="text-foreground">$230M+</span> to it. WICK puts an <span className="text-foreground">AI market maker</span> in charge: it reprices every block on Monad, kills the leak, and pays you the spread instead.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/live" className="btn btn-primary px-5 py-2.5 text-[13.5px]">See it live →</Link>
              <Link href="/app" className="btn px-5 py-2.5 text-[13.5px]" style={{ borderColor: "var(--accent)", color: "var(--accent-2)" }}>Deposit MON →</Link>
              <span className="text-[12px] text-muted">real Pyth price · real OpenAI · real on-chain</span>
            </div>
          </div>
          <HeroPanel monUsd={monUsd} />
        </div>
      </section>

      {/* STAT BAND */}
      <section className="border-b border-border">
        <div className="mx-auto grid max-w-[1100px] grid-cols-2 px-5 sm:grid-cols-4">
          <Stat k="LP losses to LVR" v="$230M+" note="the leak WICK closes" />
          <Stat k="block time" v="400ms" note="sub-second finality" border />
          <Stat k="throughput" v="10,000 TPS" note="parallel execution" border />
          <Stat k="txs sent live" v={txTotal != null ? txTotal.toLocaleString() : "—"} note="all real, on Monad" border />
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="mx-auto max-w-[1100px] px-5 py-16">
        <h2 className="text-center text-[13px] font-semibold uppercase tracking-[0.2em] text-muted">how it works</h2>
        <p className="mx-auto mt-2 max-w-[640px] text-center text-[15px] text-muted2">Deposit, and an AI runs your money like a professional market maker — the game that today only Wintermute-style firms get to play.</p>
        <div className="mt-9 grid grid-cols-1 gap-4 md:grid-cols-3">
          <Step n="1" t="You deposit" d="Put MON into the WICK vault from your own wallet. Single-sided — no pairing, no USDC needed." />
          <Step n="2" t="The AI market-makes it" d="An OpenAI model reads the live Pyth price every block, sets the spread, and reprices so bots can't skim you." />
          <Step n="3" t="You earn the spread" d="The market-making spread streams back to you — the revenue propAMMs use to capture 35–40% of Solana volume." />
        </div>
      </section>

      {/* WHY MONAD */}
      <section className="border-y border-border bg-[#0a0a0d]">
        <div className="mx-auto grid max-w-[1100px] items-center gap-10 px-5 py-16 lg:grid-cols-2">
          <div>
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.2em] text-muted">why only Monad</h2>
            <p className="mt-3 text-[24px] font-semibold leading-snug">LVR = staleness window × volatility.</p>
            <p className="mt-3 max-w-[520px] text-[14.5px] leading-relaxed text-muted2">
              The shorter the gap between price updates, the less LPs leak. Monad&apos;s <span className="text-foreground">400ms blocks</span> give the shortest window achievable on-chain, and its <span className="text-foreground">parallel execution + 10,000 TPS</span> let hundreds of pools reprice in the same block. Per-block, AI-driven market-making at scale simply isn&apos;t possible anywhere else. It&apos;s the chain built for high-frequency finance — WICK is what it&apos;s for.
            </p>
          </div>
          <div className="panel p-5">
            <div className="label mb-3">per block, every pool</div>
            <Flow items={["read Pyth price", "AI decides spread", "reprice on-chain", "arb finds nothing", "LPs earn the spread"]} />
            <div className="mt-3 border-t border-border pt-3 text-[12px] text-muted">5 txs / block · ~400ms · confirmed before the next block</div>
          </div>
        </div>
      </section>

      {/* REAL PROOF */}
      <section className="mx-auto max-w-[1100px] px-5 py-16">
        <h2 className="text-center text-[13px] font-semibold uppercase tracking-[0.2em] text-muted">not a mockup — all real</h2>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Proof t="Real price" d="Driven by the live MON/USD feed from Pyth, not a made-up walk." href="https://pyth.network" hrefLabel="Pyth ↗" />
          <Proof t="Real AI" d="An OpenAI model sets the spread each block and shows its reasoning." />
          <Proof t="Real contracts" d="Deployed & verified on MonadScan — read the source yourself." href={ex && wick ? `${ex}/address/${wick}` : undefined} hrefLabel="WICK ↗" />
          <Proof t="Real deposits" d="Connect MetaMask and deposit native MON — your keys, your tx." href={ex && vault ? `${ex}/address/${vault}` : undefined} hrefLabel="Vault ↗" />
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="border-t border-border">
        <div className="mx-auto flex max-w-[1100px] flex-col items-center gap-5 px-5 py-16 text-center">
          <h2 className="text-[30px] font-bold tracking-tight">Watch a bot-proof pool, then deposit into it.</h2>
          <p className="max-w-[560px] text-[14.5px] text-muted2">See the passive pool bleed while WICK earns — live, on real Monad — then put your MON to work.</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/live" className="btn btn-primary px-6 py-3 text-[14px]">See it live →</Link>
            <Link href="/app" className="btn px-6 py-3 text-[14px]" style={{ borderColor: "var(--accent)", color: "var(--accent-2)" }}>Deposit MON →</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-2 px-5 py-5 text-[11.5px] text-muted">
          <span>WICK · AI market maker · built on Monad</span>
          <span>real Pyth · real OpenAI · verified contracts on MonadScan</span>
        </div>
      </footer>
    </div>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-[#08080a]/85 backdrop-blur-sm">
      <div className="mx-auto flex h-[52px] max-w-[1100px] items-center gap-3 px-5">
        <Link href="/" className="flex items-center gap-2.5">
          <Mark /><span className="text-[15px] font-bold tracking-tight">WICK</span>
        </Link>
        <nav className="ml-3 hidden items-center gap-4 text-[12.5px] text-muted sm:flex">
          <Link href="/live" className="hover:text-foreground">Live</Link>
          <Link href="/app" className="hover:text-foreground">Earn</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <span className="chip hidden items-center gap-1.5 px-3 py-1.5 text-[11.5px] sm:flex"><span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} /> Monad Testnet</span>
          <Link href="/app" className="btn btn-primary px-4 py-1.5 text-[12.5px]">Launch app</Link>
        </div>
      </div>
    </header>
  );
}

function HeroPanel({ monUsd }: { monUsd: number | null }) {
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="label">live engine</span>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted"><span className="blink h-1.5 w-1.5 rounded-full" style={{ background: "var(--up)" }} /> on Monad</span>
      </div>
      <div className="px-4 py-4">
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-muted">MON/USD · Pyth</span>
          <span className="mono text-foreground">{monUsd ? `$${monUsd.toFixed(5)}` : "—"}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border p-3">
            <div className="label">passive pool</div>
            <div className="mono mt-1 text-[22px] font-semibold" style={{ color: "var(--down)" }}>−$2,730</div>
            <div className="text-[10.5px] text-muted">bleeding to bots</div>
          </div>
          <div className="rounded-lg border p-3" style={{ borderColor: "rgba(46,189,133,0.3)" }}>
            <div className="label">WICK · AI</div>
            <div className="mono mt-1 text-[22px] font-semibold" style={{ color: "var(--up)" }}>+$5,240</div>
            <div className="text-[10.5px] text-muted">earning the spread</div>
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-border p-3">
          <div className="flex items-center gap-2"><span className="tag" style={{ color: "var(--up)", borderColor: "var(--border)" }}>AI · CALM</span><span className="mono text-[12px] text-muted">spread 0.10%</span></div>
          <p className="mt-1.5 text-[12px] text-muted2">“Calm conditions — quoting tight to win retail flow.”</p>
        </div>
      </div>
    </div>
  );
}

function Stat({ k, v, note, border }: { k: string; v: string; note: string; border?: boolean }) {
  return (
    <div className={`px-5 py-6 ${border ? "divide-v" : ""}`}>
      <div className="label">{k}</div>
      <div className="mono mt-1 text-[26px] font-bold leading-none" style={{ color: "var(--text)" }}>{v}</div>
      <div className="mt-1 text-[11px] text-muted">{note}</div>
    </div>
  );
}

function Step({ n, t, d }: { n: string; t: string; d: string }) {
  return (
    <div className="panel p-5">
      <span className="grid h-8 w-8 place-items-center rounded-full text-[14px] font-bold" style={{ background: "rgba(131,110,249,0.14)", color: "var(--accent-2)", border: "1px solid rgba(131,110,249,0.4)" }}>{n}</span>
      <p className="mt-3 text-[15px] font-semibold">{t}</p>
      <p className="mt-1.5 text-[13px] leading-relaxed text-muted2">{d}</p>
    </div>
  );
}

function Flow({ items }: { items: string[] }) {
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-2.5 text-[13px]">
          <span className="mono w-4 text-right text-[11px] text-muted">{i + 1}</span>
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: i === items.length - 1 ? "var(--up)" : "var(--accent)" }} />
          <span className="text-muted2">{it}</span>
        </div>
      ))}
    </div>
  );
}

function Proof({ t, d, href, hrefLabel }: { t: string; d: string; href?: string; hrefLabel?: string }) {
  return (
    <div className="panel p-5">
      <p className="text-[14px] font-semibold" style={{ color: "var(--accent-2)" }}>{t}</p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted2">{d}</p>
      {href && <a href={href} target="_blank" rel="noreferrer" className="mono mt-2 inline-block text-[11.5px] hover:text-foreground" style={{ color: "var(--accent-2)" }}>{hrefLabel}</a>}
    </div>
  );
}

function Mark() {
  return (
    <div className="grid h-7 w-7 place-items-center rounded-md border border-border" style={{ background: "#0d0b16" }}>
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden><line x1="7" y1="1" x2="7" y2="13" stroke="var(--accent-2)" strokeWidth="1.5" strokeLinecap="round" /><rect x="4" y="4" width="6" height="6" rx="1.5" fill="var(--accent)" /></svg>
    </div>
  );
}
