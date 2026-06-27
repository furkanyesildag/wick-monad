# WICK — Autonomous Market Maker on Monad

> Uniswap LPs lose money to bots every time the price moves — arbitrageurs skim the gap
> between the stale pool price and the real market. That leak (LVR) has cost LPs **$230M+**.
> **WICK** puts an AI agent in charge of your liquidity: it reprices the pool **every block**
> on Monad, so arbitrageurs have nothing to skim. Anyone can LP. The spread that today only
> Wintermute-style firms earn now flows to you.

One-liner for a normal person:
**"Put your liquidity in Uniswap and bots front-run the real price and skim you. WICK has an AI run your liquidity like a pro market maker — repriced every block on Monad — so you earn the spread instead of bleeding it."**

---

## The single number this lives on

Same liquidity. Same price action. Same trades. One pool bleeds to arbitrageurs, the other earns the spread:

```
PASSIVE Uniswap pool :  LP P&L from flow  =  −$61.21   (skimmed by arbs — LVR)
WICK    propAMM pool :  LP P&L from flow  =  +$90.14   (earned from the spread)
```

These come straight out of the contracts. See `contracts/test/Lvr.t.sol`.

## Why only Monad (not cosmetic — structural)

LVR = **staleness window × volatility**. The shorter the window, the less LPs leak.

- **400ms blocks + cheap gas** → the shortest repricing window achievable on-chain → structurally the tightest spread / lowest LVR.
- **Parallel execution** → hundreds of independent pools can reprice in the same block.
- Monad markets itself as *the home of high-frequency finance* (founders are ex-Jump Trading). WICK is exactly what that chain is for.

## How it works

```
          ┌─ oracle (fair price, per block) ─┐
OpenClaw  │                                  │   reprice(price, volatility)
 agent  ──┼──> WickPool / WickHook ──────────┘   beforeSwap: dynamic fee
          │        ▲                               afterSwap:  spread → LPs
   arb ───┘        │ peg = fresh price, so arbs can't skim
   retail ─────────┘ pays the spread → LPs earn
```

1. An **OpenClaw agent** reads the oracle + volatility and calls `reprice()` every block.
2. The **Uniswap v4 hook** (`WickHook`) applies a volatility-aware **dynamic fee** at the point of every swap (`beforeSwap`) — the "logic at the point of exchange."
3. Because the quote is never stale, arbitrageurs find no edge and **skip** the pool; benign flow pays the spread.
4. Anyone deposits and earns the spread. A **deviation-lock** caps losses if the oracle/agent misbehaves.

## What's real

| Piece | Status |
|---|---|
| Core AMM contracts (`PassivePool`, `WickPool`, `PriceOracle`) | ✅ built + tested |
| LVR divergence proof (`Lvr.t.sol`) | ✅ passing — passive bleeds, WICK earns |
| **Real Uniswap v4 hook** (`WickHook` → `IHooks`) | ✅ compiles + integration test passes (PoolManager deploy + HookMiner address mining + dynamic fee on a live swap) |
| Autonomous agent loop (reprice + arb + retail), per block | ✅ runs the live demo |
| Monad-themed dashboard (single LVR counter, shock, "Become LP") | ✅ live |
| Deploy to Monad testnet (chainId 10143) | ⏳ one command once the agent wallet is funded |

> **Honest scope note:** full peg-repricing of the liquidity curve on canonical v4 needs JIT
> liquidity management — beyond a one-day build. `WickHook` ships the dynamic-fee half
> natively; the standalone `WickPool` runs the complete peg + dynamic-fee model the demo uses.

## Run it

```bash
# 1. contracts + proof
cd contracts && forge test -vv

# 2. local chain + deploy
anvil &                                   # instant-mine local chain
PRIVATE_KEY=0xac09...ff80 forge script script/Deploy.s.sol:Deploy \
  --rpc-url http://localhost:8545 --broadcast

# 3. dashboard
cd ../web && npm run dev                  # http://localhost:3000
```

Then press **▶ Run simulation**, hit **⚡ Volatility shock**, and watch the red (passive)
line crater while the green (WICK) line keeps climbing.

## Stack

- **contracts/** — Foundry. Solidity 0.8.26. OpenZeppelin + Uniswap v4 (`v4-core`, `v4-periphery`).
- **web/** — Next.js 16 + Tailwind v4 + viem. All chain interaction server-side (`web/src/lib/agent.ts`).
- Monad testnet: chainId `10143`, RPC `https://testnet-rpc.monad.xyz`.
