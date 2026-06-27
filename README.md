# WICK — an AI market maker on Monad

> **Your liquidity, market-made by an AI 🦀, every block.**
> On Uniswap, bots catch the real price before the pool updates and skim your liquidity. LPs have lost **$230M+** to it (LVR). WICK puts an autonomous agent in charge: it reprices the pool **every block** on Monad, kills the leak, and pays you the spread instead.

<p align="center">
  <em>Live on Monad Testnet · real Pyth price · real on-chain · verified contracts</em>
</p>

![WICK landing](docs/doc_landing.png)

---

## The problem: LVR (Loss-Versus-Rebalancing)

A passive AMM only moves its price when someone trades against it, so between blocks its quote is **stale**. Every time the real market moves, arbitrage bots buy the cheap side from the pool before it catches up and pocket the difference. That continuous bleed from LPs to arbitrageurs is **LVR**, the biggest unsolved problem in AMM design, and it scales with `staleness window × volatility`.

## What WICK does

WICK is a **propAMM** (proprietary, actively-requoting AMM) opened up to everyone:

- **🦀 An OpenClaw agent, not a quant desk.** An LLM-driven agent reads the live price every block and sets the spread and market regime: wider to protect LPs in volatility, tighter to win flow when calm. Its reasoning is shown on screen.
- **🪝 Logic at the point of exchange.** WICK is built as a **Uniswap v4 hook** (`WickHook`, implementing `IHooks`): the repricing and dynamic fee run *inside* the swap, not bolted on top.
- **💸 Paid in spread, not tokens.** Revenue is the market-making spread, the proven model propAMMs use to capture 35–40% of Solana spot volume. No token, no emissions, no farming.
- **⚡ Structurally lowest LVR, only on Monad.** `LVR = staleness window × volatility`. Monad's 400ms blocks give the shortest repricing window achievable on-chain, so WICK quotes tighter than any pool on a slower chain.

## Three surfaces

| Route | What it is |
|-------|-----------|
| **`/`** | Landing page (the pitch): the problem, the idea, why Monad, and a live engine preview. Bilingual EN/TR. |
| **`/live`** | The live engine: the real MON/USD price from Pyth drives the pool, the agent decides the spread each block, and a passive pool runs side-by-side so you can watch one bleed (LVR) while WICK earns. Includes the agent console, a live on-chain transaction feed, and a Monad throughput panel. |
| **`/app`** | Earn: connect MetaMask, deposit **native MON** into the WICK vault, and watch your position grow as the agent streams the spread back. Withdraw anytime. |

![WICK live engine](docs/doc_live.png)

## Not a mockup — what's real

- **Real price** — driven by the live **MON/USD feed from Pyth** (Hermes), replayed and time-compressed so a few hours of real market action plays out in minutes.
- **Real AI** — an LLM (surfaced as an OpenClaw agent 🦀) sets the spread and regime every block, with its reasoning streamed into the console.
- **Real Uniswap v4 hook** — `WickHook` implements `IHooks` and passes an integration test that deploys a fresh `PoolManager`, mines a permissioned hook address, and applies the dynamic fee on a live swap.
- **Real on-chain** — every agent action (push oracle, reprice, arb, retail) is a real transaction on Monad; the dashboard reads straight from chain.
- **Real deposits** — the `/app` vault takes **native MON** from your own wallet. Your keys, your tx.

## Deployed & verified on Monad Testnet (chainId `10143`)

All contracts are verified on [MonadScan](https://testnet.monadscan.com) and [MonadVision](https://testnet.monadvision.com).

| Contract | Address |
|----------|---------|
| `WickPool` (AI propAMM) | [`0xd08b7bf0fF043c7470c30FBB00E4559F8A5B6b29`](https://testnet.monadscan.com/address/0xd08b7bf0fF043c7470c30FBB00E4559F8A5B6b29) |
| `PassivePool` (baseline) | [`0xB0c97cEBAfDB27f12077839a15c15D4930276740`](https://testnet.monadscan.com/address/0xB0c97cEBAfDB27f12077839a15c15D4930276740) |
| `WickVault` (native MON) | [`0xB436556cFE759044dfFce06191B96f147Da30Aff`](https://testnet.monadscan.com/address/0xB436556cFE759044dfFce06191B96f147Da30Aff) |
| `PriceOracle` | [`0x51ec941db77E7134BE0b03EFDa9E54464eFd4554`](https://testnet.monadscan.com/address/0x51ec941db77E7134BE0b03EFDa9E54464eFd4554) |
| `WMON` (test token) | [`0xD789047Afb53624f780f328522babA8562B65D71`](https://testnet.monadscan.com/address/0xD789047Afb53624f780f328522babA8562B65D71) |
| `USDC` (test token) | [`0xf664d0b4310162E3b314E2995dF1C93Ce320db23`](https://testnet.monadscan.com/address/0xf664d0b4310162E3b314E2995dF1C93Ce320db23) |

> `WickHook` (the canonical Uniswap v4 form) lives in [`contracts/src/WickHook.sol`](contracts/src/WickHook.sol) with a passing integration test. The live side-by-side runs on the standalone `WickPool`, which embodies the exact same beforeSwap/afterSwap repricing + dynamic-fee logic, so the demo is fully deterministic.

## Architecture

```
wick/
├── contracts/                 # Foundry · Solidity 0.8.26 · OpenZeppelin · Uniswap v4
│   ├── src/
│   │   ├── WickHook.sol        # real Uniswap v4 hook (IHooks): dynamic fee in beforeSwap
│   │   ├── WickPool.sol        # standalone propAMM: per-block reprice + dynamic fee + deviation lock
│   │   ├── PassivePool.sol     # constant-product baseline (the "dumb Uniswap")
│   │   ├── PriceOracle.sol     # fair price + volatility, pushed by the agent
│   │   ├── WickVault.sol       # single-sided native-MON vault for /app deposits
│   │   └── MockERC20.sol
│   └── test/                   # LVR-divergence proof + v4 hook integration test
└── web/                        # Next.js 16 · Tailwind v4 · wagmi · viem
    ├── src/app/                # / (landing) · /live (engine) · /app (MetaMask vault)
    └── src/lib/
        ├── pyth.ts             # live + historical MON/USD from Pyth Hermes/Benchmarks
        ├── ai.ts               # the agent brain: LLM -> {regime, spreadBps, reasoning}
        ├── agent.ts            # per-block loop: push price -> reprice -> arb -> retail (real txs)
        └── contracts.ts        # viem clients, addresses, ABIs
```

**The per-block loop (server-driven, on real Monad):**

```
read real MON/USD (Pyth)  ->  agent 🦀 decides spread/regime  ->  reprice WICK on-chain
        ->  arbitrageur drags the stale passive pool to fair (skips WICK)  ->  retail flow pays the spread
        ->  passive LP markout climbs (LVR), WICK LP markout falls (earns)
```

## Run it locally

**Prerequisites:** [Foundry](https://getfoundry.sh), Node 20+, and an `OPENAI_API_KEY` (the agent brain).

```bash
# 1. contracts: build + prove the thesis
cd contracts
forge test -vv          # LVR divergence (passive bleeds, WICK earns) + v4 hook integration

# 2. web app
cd ../web
npm install
cp .env.local.example .env.local   # set RPC_URL, AGENT_PK, OPENAI_API_KEY
npm run dev                        # http://localhost:3000
```

Then open `/live`, press **Run**, hit **⚡ Shock**, and watch the passive line crater while WICK keeps earning. Connect MetaMask on `/app` to deposit real testnet MON.

> Deploy your own stack with `forge script script/Deploy.s.sol` (pools) and the vault, then point `web/.env.local`'s `RPC_URL`/`AGENT_PK` at it. The agent wallet needs testnet MON from [faucet.monad.xyz](https://faucet.monad.xyz).

## Why only Monad

Per-block, AI-driven market-making across many pools needs three things at once: **400ms blocks** (the shortest staleness window on-chain → structurally the lowest LVR), **parallel execution + 10,000 TPS** (hundreds of pools repricing in the same block), and **near-zero fees** (repricing every block has to be cheap). Monad is the chain built for high-frequency finance, and WICK is what it's for.

## Tech stack

Foundry · Solidity 0.8.26 · Uniswap v4 (`v4-core`, `v4-periphery`) · OpenZeppelin · Next.js 16 · Tailwind v4 · wagmi 2 · viem 2 · Pyth Network · Monad Testnet.

## Notes & disclaimer

Testnet hackathon project. The agent is surfaced as an **OpenClaw agent 🦀**; under the hood it calls an LLM that produces the spread policy. The price is **real** Pyth MON/USD data, replayed and amplified so the dynamics are visible in a short demo; the volatility **shock** button simulates a stress event. The passive-vs-WICK comparison runs on our own contracts fed the real price, so the only variable is WICK's per-block repricing.

---

<p align="center"><sub>WICK · AI market maker · built on Monad</sub></p>
