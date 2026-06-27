# WICK — 3-minute demo script

## 30-second pitch (say this first)

> "When you LP on Uniswap, every time the price moves, bots catch the real price before the
> pool updates and skim you — LPs have lost over $230M to this. It's called LVR.
> WICK puts an **AI agent** in charge of your liquidity: it reprices the pool **every block**
> on Monad, so the bots have nothing to skim. Watch."

## Live demo (90 seconds)

1. **Point at the two big numbers.** "Same liquidity, same prices, same trades. Left is a
   normal Uniswap pool. Right is WICK."
2. **Press ▶ Run simulation.** "An autonomous agent is now repricing the WICK pool every block.
   Watch the lines diverge." → red (passive) sinks, green (WICK) climbs.
3. **Press ⚡ Volatility shock.** "Here's a 5% price jump — the moment LPs get hurt most.
   The passive pool craters. WICK widens its spread and keeps earning." → the red line
   drops off a cliff; green keeps going up. **This is the mic-drop.**
4. **Press + Become a WICK LP.** "And anyone can step in — deposit, and the spread the AI
   earns now flows to you. This was Wintermute's game. Now it's open."

## Why Monad (10 seconds)

> "LVR = staleness window × volatility. Monad's 400ms blocks give the shortest window
> on-chain, and parallel execution lets hundreds of these pools reprice at once. This is
> the chain built for high-frequency finance — WICK is what it's for."

## If a judge probes — answers ready

- **"Isn't this just a propAMM / dynamic-fee hook?"**
  Three differences: (1) **open & permissionless** — anyone LPs; Solana's propAMMs are
  closed single-MM. (2) **transparent & on-chain** — theirs are dark, off-chain quotes.
  (3) **Monad-structural** — shortest staleness window = tightest spread, impossible elsewhere.

- **"Where's the AI / isn't it just a bot?"**
  Lead with the mechanism, not the buzzword: it's a per-block repricer + volatility-aware
  dynamic-fee controller. The "predict next block" layer is the roadmap; today it pegs to the
  oracle and sizes the spread to volatility — which is exactly what a pro market maker does.

- **"Is it really a Uniswap v4 hook?"**
  Yes — `WickHook` implements `IHooks`, is mined to a permissioned address, deployed against
  a real `PoolManager`, and applies the dynamic fee in `beforeSwap` on a live swap.
  See `contracts/test/WickHook.t.sol` (passing).

- **"How does it make money?"**
  The market-making **spread** — the model propAMMs use to capture 35–40% of Solana spot
  volume. Not a token, not emissions. LPs earn it; the protocol takes a small cut.

- **"What if the oracle/agent breaks?"**
  Deviation-lock: if the live oracle drifts >10% from the peg, swaps revert — losses bounded.
