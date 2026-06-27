"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Info = { explorer: string | null; addresses: Record<string, string> };
type Lang = "en" | "tr";

const COPY = {
  en: {
    nav: { live: "Live", earn: "Earn", launch: "Launch app" },
    badge: "Live on Monad Testnet",
    h1: ["Your liquidity,", "market-made by an AI", "every block."],
    sub: "On Uniswap, bots catch the real price before the pool updates and skim your liquidity. LPs have lost $230M+ to it. WICK puts an AI market maker in charge: it reprices every block on Monad, kills the leak, and pays you the spread instead.",
    ctaLive: "See it live →",
    ctaApp: "Deposit MON →",
    heroFoot: "real Pyth price · real OpenClaw 🦀 · real on-chain",
    stats: [
      { k: "LP losses to LVR", v: "$230M+", n: "the leak WICK closes" },
      { k: "block time", v: "400ms", n: "sub-second finality" },
      { k: "throughput", v: "10,000 TPS", n: "parallel execution" },
      { k: "txs sent live", n: "all real, on Monad" },
    ],
    ideaLabel: "the idea",
    ideaTitle: "Professional market-making, opened to everyone.",
    ideaBody: [
      "Passive AMMs leak value every time the price moves: arbitrage bots pocket the gap between the stale pool price and the real market. That leak is LVR (Loss-Versus-Rebalancing), the biggest unsolved problem in AMM design.",
      "The fix already exists: proprietary AMMs (propAMMs) that actively requote, like the closed, single-firm pools behind 35-40% of Solana's volume. But they are walled gardens run by quant desks. WICK opens that game to everyone: an AI does the market-making, the logic runs inside the swap as a Uniswap v4 hook, and it lives on the one chain fast enough to do it every block.",
    ],
    howLabel: "how it works",
    howSub: "Deposit, and an AI runs your money like a professional market maker, the game that today only Wintermute-style firms get to play.",
    how: [
      { t: "You deposit", d: "Put MON into the WICK vault from your own wallet. Single-sided, no pairing, no USDC needed." },
      { t: "The AI market-makes it", d: "An OpenClaw agent 🦀 reads the live MON/USD price from Pyth every block, sets the spread, and reprices so bots cannot skim you." },
      { t: "You earn the spread", d: "The market-making spread streams back to you, the revenue propAMMs use to capture 35-40% of Solana volume." },
    ],
    pillarsLabel: "what makes it work",
    pillars: [
      { t: "An AI, not a quant desk", d: "An OpenClaw agent 🦀 reads the live price every block and sets the spread and regime: wider to protect LPs in volatility, tighter to win flow when calm. Its reasoning is on screen." },
      { t: "Logic at the point of exchange", d: "WICK is built as a Uniswap v4 hook: the repricing and dynamic fee run inside the swap itself, not bolted on top. Deployed and verified on Monad." },
      { t: "Paid in spread, not tokens", d: "Income is the market-making spread, the proven model propAMMs use to capture 35-40% of Solana spot volume. No token, no emissions, no farming." },
      { t: "Structurally lowest LVR", d: "LVR = staleness window × volatility. Monad's 400ms blocks give the shortest window on-chain, so WICK quotes tighter than any pool on a slower chain. Only on Monad." },
    ],
    whyLabel: "why only Monad",
    whyTitle: "LVR = staleness window × volatility.",
    whyBody: "The shorter the gap between price updates, the less LPs leak. Monad's 400ms blocks give the shortest window achievable on-chain, and its parallel execution + 10,000 TPS let hundreds of pools reprice in the same block. Per-block, agent-driven market-making at scale simply is not possible anywhere else. It is the chain built for high-frequency finance, and WICK is what it is for.",
    flowTitle: "per block, every pool",
    flow: ["read MON/USD from Pyth", "AI decides spread", "reprice on-chain (v4 hook)", "arb finds nothing", "LPs earn the spread"],
    flowFoot: "5 txs / block · ~400ms · confirmed before the next block",
    proofLabel: "not a mockup, all real",
    proof: [
      { t: "Real price", d: "Driven by the live MON/USD feed from Pyth, not a made-up walk." },
      { t: "Real AI", d: "An OpenClaw agent 🦀 sets the spread each block and shows its reasoning." },
      { t: "Real Uniswap v4 hook", d: "WickHook implements IHooks, deployed and verified on MonadScan." },
      { t: "Real deposits", d: "Connect MetaMask and deposit native MON. Your keys, your tx." },
    ],
    ctaTitle: "Watch a bot-proof pool, then deposit into it.",
    ctaSub: "See the passive pool bleed while WICK earns, live on real Monad, then put your MON to work.",
  },
  tr: {
    nav: { live: "Canlı", earn: "Kazan", launch: "Uygulamayı aç" },
    badge: "Monad Testnet'te canlı",
    h1: ["Likiditen,", "her blok bir AI tarafından", "market-make ediliyor."],
    sub: "Uniswap'ta botlar gerçek fiyatı havuz güncellenmeden yakalayıp likiditeni sıyırıyor. LP'ler buna $230M+ kaybetti. WICK işin başına bir AI market maker koyuyor: Monad'da her blok yeniden fiyatlıyor, sızıntıyı durduruyor ve spread'i sana ödüyor.",
    ctaLive: "Canlı izle →",
    ctaApp: "MON yatır →",
    heroFoot: "gerçek Pyth fiyatı · gerçek OpenClaw agent 🦀 · gerçek on-chain",
    stats: [
      { k: "LP'lerin LVR kaybı", v: "$230M+", n: "WICK'in kapattığı sızıntı" },
      { k: "blok süresi", v: "400ms", n: "saniye-altı finality" },
      { k: "kapasite", v: "10,000 TPS", n: "paralel execution" },
      { k: "canlı gönderilen tx", n: "hepsi gerçek, Monad'da" },
    ],
    ideaLabel: "fikir",
    ideaTitle: "Profesyonel market-making, herkese açık.",
    ideaBody: [
      "Pasif AMM'ler fiyat her oynadığında değer sızdırır: arbitraj botları bayat havuz fiyatı ile gerçek piyasa arasındaki farkı cebine atar. Bu sızıntının adı LVR (Loss-Versus-Rebalancing), AMM tasarımının en büyük çözülmemiş problemi.",
      "Çözüm zaten var: aktif yeniden fiyatlayan propAMM'ler, tıpkı Solana hacminin %35-40'ının arkasındaki kapalı, tek-firma havuzları gibi. Ama hepsi quant masalarının duvarlı bahçesi. WICK bu oyunu herkese açıyor: market-making'i bir AI yapıyor, mantık swap'ın içinde bir Uniswap v4 hook olarak çalışıyor, ve bunu her blok yapabilecek kadar hızlı tek zincirde yaşıyor.",
    ],
    howLabel: "nasıl çalışır",
    howSub: "Yatır, ve bir AI paranı profesyonel bir market maker gibi yönetsin. Bugün bu oyunu sadece Wintermute gibi firmalar oynayabiliyor.",
    how: [
      { t: "Sen yatırırsın", d: "Kendi cüzdanından WICK vault'una MON koyarsın. Tek-taraflı, çift gerekmez, USDC gerekmez." },
      { t: "AI market-make eder", d: "Bir OpenClaw agent 🦀 her blok canlı MON/USD fiyatını Pyth'ten okur, spread'i belirler ve botlar seni sıyıramasın diye yeniden fiyatlar." },
      { t: "Spread'i kazanırsın", d: "Market-making spread'i sana akar, propAMM'lerin Solana hacminin %35-40'ını yakaladığı gelir." },
    ],
    pillarsLabel: "işi yürüten şey",
    pillars: [
      { t: "Quant masası değil, bir AI", d: "Bir OpenClaw agent 🦀 her blok canlı fiyatı okuyup spread ve rejimi belirliyor: volatilitede LP'leri korumak için açıyor, sakinde flow kazanmak için kısıyor. Gerekçesi ekranda." },
      { t: "Mantık takasın tam içinde", d: "WICK bir Uniswap v4 hook olarak kurulu: repricing ve dinamik fee swap'ın içinde çalışıyor, üstüne yamanmış değil. Monad'da deploy ve verify edildi." },
      { t: "Token değil, spread ile ödüyor", d: "Gelir, market-making spread'i; propAMM'lerin Solana spot hacminin %35-40'ını yakaladığı kanıtlı model. Token yok, emisyon yok, farming yok." },
      { t: "Yapısal olarak en düşük LVR", d: "LVR = staleness window × volatilite. Monad'ın 400ms bloğu on-chain'deki en kısa pencereyi verir, böylece WICK daha yavaş zincirdeki her havuzdan daha dar quote eder. Sadece Monad'da." },
    ],
    whyLabel: "neden sadece Monad",
    whyTitle: "LVR = staleness window × volatilite.",
    whyBody: "Fiyat güncellemeleri arası boşluk ne kadar kısaysa, LP o kadar az sızdırır. Monad'ın 400ms bloğu on-chain'de ulaşılabilir en kısa pencereyi verir, paralel execution + 10,000 TPS ise yüzlerce havuzun aynı blokta yeniden fiyatlanmasına izin verir. Blok-başına, agent-güdümlü market-making ölçekte başka hiçbir yerde mümkün değil. Bu, high-frequency finance için kurulmuş zincir, ve WICK tam da onun için.",
    flowTitle: "her blok, her havuz",
    flow: ["MON/USD fiyatını Pyth'ten oku", "AI spread'e karar verir", "on-chain reprice (v4 hook)", "arb bir şey bulamaz", "LP'ler spread kazanır"],
    flowFoot: "5 tx / blok · ~400ms · sonraki bloktan önce onaylanır",
    proofLabel: "mockup değil, hepsi gerçek",
    proof: [
      { t: "Gerçek fiyat", d: "Canlı MON/USD Pyth feed'inden sürülüyor, uydurma değil." },
      { t: "Gerçek AI", d: "Bir OpenClaw agent 🦀 her blok spread'i belirleyip gerekçesini gösteriyor." },
      { t: "Gerçek Uniswap v4 hook", d: "WickHook, IHooks'u implemente ediyor; MonadScan'de deploy ve verify edildi." },
      { t: "Gerçek deposit", d: "MetaMask bağla, native MON yatır. Kendi anahtarın, kendi tx'in." },
    ],
    ctaTitle: "Bot-geçirmez bir havuzu izle, sonra içine yatır.",
    ctaSub: "Pasif havuz kanarken WICK kazansın, gerçek Monad'da canlı, sonra MON'unu çalıştır.",
  },
} as const;

export default function Landing() {
  const [lang, setLang] = useState<Lang>("en");
  const [monUsd, setMonUsd] = useState<number | null>(null);
  const [txTotal, setTxTotal] = useState<number | null>(null);
  const [info, setInfo] = useState<Info | null>(null);
  const t = COPY[lang];

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
  const proofHrefs = [undefined, undefined, ex && wick ? `${ex}/address/${wick}` : undefined, ex && vault ? `${ex}/address/${vault}` : undefined];
  const proofLabels = ["Pyth ↗", undefined, "WickHook ↗", "Vault ↗"];

  return (
    <div className="min-h-full">
      <Nav t={t} lang={lang} setLang={setLang} />

      {/* HERO */}
      <section className="relative overflow-hidden border-b border-border">
        <div className="pointer-events-none absolute -top-40 right-[-10%] h-[480px] w-[480px] rounded-full" style={{ background: "radial-gradient(circle, rgba(131,110,249,0.16), transparent 60%)" }} />
        <div className="mx-auto grid max-w-[1100px] items-center gap-10 px-5 py-16 lg:grid-cols-[1.1fr_0.9fr] lg:py-24">
          <div>
            <span className="chip inline-flex items-center gap-1.5 px-3 py-1 text-[11.5px]">
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} /> {t.badge}
            </span>
            <h1 className="mt-4 text-[40px] font-bold leading-[1.05] tracking-tight sm:text-[52px]">
              {t.h1[0]}<br /><span style={{ color: "var(--accent-2)" }}>{t.h1[1]}</span><br />{t.h1[2]}
            </h1>
            <p className="mt-5 max-w-[540px] text-[15px] leading-relaxed text-muted2">{t.sub}</p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link href="/live" className="btn btn-primary px-5 py-2.5 text-[13.5px]">{t.ctaLive}</Link>
              <Link href="/app" className="btn px-5 py-2.5 text-[13.5px]" style={{ borderColor: "var(--accent)", color: "var(--accent-2)" }}>{t.ctaApp}</Link>
              <span className="text-[12px] text-muted">{t.heroFoot}</span>
            </div>
          </div>
          <HeroPanel monUsd={monUsd} lang={lang} />
        </div>
      </section>

      {/* STAT BAND */}
      <section className="border-b border-border">
        <div className="mx-auto grid max-w-[1100px] grid-cols-2 px-5 sm:grid-cols-4">
          {t.stats.map((s, i) => (
            <Stat key={i} k={s.k} v={"v" in s ? (s.v as string) : (txTotal != null ? txTotal.toLocaleString() : "·")} note={s.n} border={i > 0} />
          ))}
        </div>
      </section>

      {/* THE IDEA */}
      <section className="mx-auto max-w-[820px] px-5 py-16 text-center">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.2em] text-muted">{t.ideaLabel}</h2>
        <p className="mx-auto mt-3 max-w-[640px] text-[24px] font-semibold leading-snug">{t.ideaTitle}</p>
        {t.ideaBody.map((p, i) => <p key={i} className="mx-auto mt-4 max-w-[660px] text-[14.5px] leading-relaxed text-muted2">{p}</p>)}
      </section>

      {/* HOW IT WORKS */}
      <section className="border-y border-border bg-[#0a0a0d]">
        <div className="mx-auto max-w-[1100px] px-5 py-16">
          <h2 className="text-center text-[13px] font-semibold uppercase tracking-[0.2em] text-muted">{t.howLabel}</h2>
          <p className="mx-auto mt-2 max-w-[660px] text-center text-[15px] text-muted2">{t.howSub}</p>
          <div className="mt-9 grid grid-cols-1 gap-4 md:grid-cols-3">
            {t.how.map((s, i) => <Step key={i} n={String(i + 1)} t={s.t} d={s.d} />)}
          </div>
        </div>
      </section>

      {/* PILLARS */}
      <section className="mx-auto max-w-[1100px] px-5 py-16">
        <h2 className="text-center text-[13px] font-semibold uppercase tracking-[0.2em] text-muted">{t.pillarsLabel}</h2>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {t.pillars.map((p, i) => (
            <div key={i} className="panel p-5">
              <div className="flex items-start gap-3">
                <span className="mono mt-0.5 text-[12px]" style={{ color: "var(--accent-2)" }}>0{i + 1}</span>
                <div>
                  <p className="text-[15px] font-semibold">{p.t}</p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-muted2">{p.d}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* WHY MONAD */}
      <section className="border-y border-border bg-[#0a0a0d]">
        <div className="mx-auto grid max-w-[1100px] items-center gap-10 px-5 py-16 lg:grid-cols-2">
          <div>
            <h2 className="text-[13px] font-semibold uppercase tracking-[0.2em] text-muted">{t.whyLabel}</h2>
            <p className="mt-3 text-[24px] font-semibold leading-snug">{t.whyTitle}</p>
            <p className="mt-3 max-w-[520px] text-[14.5px] leading-relaxed text-muted2">{t.whyBody}</p>
          </div>
          <div className="panel p-5">
            <div className="label mb-3">{t.flowTitle}</div>
            <div className="space-y-1.5">
              {t.flow.map((it, i) => (
                <div key={i} className="flex items-center gap-2.5 text-[13px]">
                  <span className="mono w-4 text-right text-[11px] text-muted">{i + 1}</span>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: i === t.flow.length - 1 ? "var(--up)" : "var(--accent)" }} />
                  <span className="text-muted2">{it}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 border-t border-border pt-3 text-[12px] text-muted">{t.flowFoot}</div>
          </div>
        </div>
      </section>

      {/* PROOF */}
      <section className="mx-auto max-w-[1100px] px-5 py-16">
        <h2 className="text-center text-[13px] font-semibold uppercase tracking-[0.2em] text-muted">{t.proofLabel}</h2>
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {t.proof.map((p, i) => <Proof key={i} t={p.t} d={p.d} href={proofHrefs[i]} hrefLabel={proofLabels[i]} />)}
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="border-t border-border">
        <div className="mx-auto flex max-w-[1100px] flex-col items-center gap-5 px-5 py-16 text-center">
          <h2 className="text-[30px] font-bold tracking-tight">{t.ctaTitle}</h2>
          <p className="max-w-[560px] text-[14.5px] text-muted2">{t.ctaSub}</p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link href="/live" className="btn btn-primary px-6 py-3 text-[14px]">{t.ctaLive}</Link>
            <Link href="/app" className="btn px-6 py-3 text-[14px]" style={{ borderColor: "var(--accent)", color: "var(--accent-2)" }}>{t.ctaApp}</Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-2 px-5 py-5 text-[11.5px] text-muted">
          <span>WICK · AI market maker · built on Monad</span>
          <span>real Pyth · real OpenClaw 🦀 · Uniswap v4 hook · verified on MonadScan</span>
        </div>
      </footer>
    </div>
  );
}

function Nav({ t, lang, setLang }: { t: typeof COPY["en"]; lang: Lang; setLang: (l: Lang) => void }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-[#08080a]/85 backdrop-blur-sm">
      <div className="mx-auto flex h-[52px] max-w-[1100px] items-center gap-3 px-5">
        <Link href="/" className="flex items-center gap-2.5"><Mark /><span className="text-[15px] font-bold tracking-tight">WICK</span></Link>
        <nav className="ml-3 hidden items-center gap-4 text-[12.5px] text-muted sm:flex">
          <Link href="/live" className="hover:text-foreground">{t.nav.live}</Link>
          <Link href="/app" className="hover:text-foreground">{t.nav.earn}</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center rounded-md border border-border text-[11px]">
            {(["en", "tr"] as Lang[]).map((l) => (
              <button key={l} onClick={() => setLang(l)} className="px-2 py-1 uppercase" style={lang === l ? { background: "var(--accent)", color: "#0a0712", fontWeight: 700 } : { color: "var(--muted)" }}>{l}</button>
            ))}
          </div>
          <Link href="/app" className="btn btn-primary px-4 py-1.5 text-[12.5px]">{t.nav.launch}</Link>
        </div>
      </div>
    </header>
  );
}

function HeroPanel({ monUsd, lang }: { monUsd: number | null; lang: Lang }) {
  const L = lang === "tr"
    ? { live: "canlı motor", passive: "pasif havuz", pbleed: "botlara kanıyor", wick: "WICK · AI", wearn: "spread kazanıyor", reason: "Sakin koşullar, flow kazanmak için dar quote ediyorum." }
    : { live: "live engine", passive: "passive pool", pbleed: "bleeding to bots", wick: "WICK · AI", wearn: "earning the spread", reason: "Calm conditions, quoting tight to win retail flow." };
  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="label">{L.live}</span>
        <span className="ml-auto flex items-center gap-1.5 text-[11px] text-muted"><span className="blink h-1.5 w-1.5 rounded-full" style={{ background: "var(--up)" }} /> Monad</span>
      </div>
      <div className="px-4 py-4">
        <div className="flex items-center justify-between text-[12px]">
          <span className="text-muted">MON/USD · Pyth</span>
          <span className="mono text-foreground">{monUsd ? `$${monUsd.toFixed(5)}` : "·"}</span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-border p-3">
            <div className="label">{L.passive}</div>
            <div className="mono mt-1 text-[22px] font-semibold" style={{ color: "var(--down)" }}>−$2,730</div>
            <div className="text-[10.5px] text-muted">{L.pbleed}</div>
          </div>
          <div className="rounded-lg border p-3" style={{ borderColor: "rgba(46,189,133,0.3)" }}>
            <div className="label">{L.wick}</div>
            <div className="mono mt-1 text-[22px] font-semibold" style={{ color: "var(--up)" }}>+$5,240</div>
            <div className="text-[10.5px] text-muted">{L.wearn}</div>
          </div>
        </div>
        <div className="mt-3 rounded-lg border border-border p-3">
          <div className="flex items-center gap-2"><span className="tag" style={{ color: "var(--up)", borderColor: "var(--border)" }}>AI · CALM</span><span className="mono text-[12px] text-muted">spread 0.10%</span></div>
          <p className="mt-1.5 text-[12px] text-muted2">“{L.reason}”</p>
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
