"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatEther, parseEther } from "viem";
import {
  useAccount, useBalance, useChainId, useConnect, useDisconnect,
  useReadContracts, useSwitchChain, useWaitForTransactionReceipt, useWriteContract,
} from "wagmi";
import { vaultAbi, MONAD_TESTNET_ID } from "@/lib/wagmi";

const fmt = (wei?: bigint, dp = 4) => (wei === undefined ? "—" : (Number(wei) / 1e18).toLocaleString("en-US", { maximumFractionDigits: dp }));
const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");

export default function AppPage() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();

  const [vault, setVault] = useState<`0x${string}` | null>(null);
  const [explorer, setExplorer] = useState<string | null>(null);
  const [amount, setAmount] = useState("1");
  const [busyMsg, setBusyMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/info").then((r) => r.json()).then((d) => { setVault(d.addresses?.vault ?? null); setExplorer(d.explorer ?? null); }).catch(() => {});
  }, []);

  const wrongChain = isConnected && chainId !== MONAD_TESTNET_ID;
  const bal = useBalance({ address, query: { enabled: !!address, refetchInterval: 5000 } });

  const reads = useReadContracts({
    contracts: vault && address
      ? [
          { address: vault, abi: vaultAbi, functionName: "assetsOf", args: [address] },
          { address: vault, abi: vaultAbi, functionName: "earnedOf", args: [address] },
          { address: vault, abi: vaultAbi, functionName: "shares", args: [address] },
          { address: vault, abi: vaultAbi, functionName: "costBasis", args: [address] },
          { address: vault, abi: vaultAbi, functionName: "totalAssets" },
        ]
      : [],
    query: { enabled: !!vault && !!address, refetchInterval: 4000 },
  });
  const [assets, earned, shares, cost, totalAssets] = (reads.data ?? []).map((r) => r.result as bigint | undefined);

  const { writeContractAsync, isPending: writing } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const { isLoading: confirming } = useWaitForTransactionReceipt({ hash: txHash });

  const refresh = () => { reads.refetch(); bal.refetch(); };

  async function deposit() {
    if (!vault) return;
    try {
      setBusyMsg("Confirm the deposit in MetaMask…");
      const h = await writeContractAsync({ address: vault, abi: vaultAbi, functionName: "deposit", value: parseEther(amount || "0") });
      setTxHash(h); setBusyMsg("Depositing… waiting for Monad to confirm");
      setTimeout(refresh, 1500); setTimeout(() => setBusyMsg(null), 2500);
    } catch { setBusyMsg(null); }
  }
  async function withdraw() {
    if (!vault || !shares) return;
    try {
      setBusyMsg("Confirm the withdrawal in MetaMask…");
      const h = await writeContractAsync({ address: vault, abi: vaultAbi, functionName: "withdraw", args: [shares] });
      setTxHash(h); setBusyMsg("Withdrawing…");
      setTimeout(refresh, 1500); setTimeout(() => setBusyMsg(null), 2500);
    } catch { setBusyMsg(null); }
  }
  async function aiEarn() {
    setBusyMsg("AI market-making your MON…");
    await fetch("/api/app/earn", { method: "POST" });
    setTimeout(refresh, 800); setTimeout(() => setBusyMsg(null), 1600);
  }

  const busy = writing || confirming || !!busyMsg;
  const earnedNum = earned !== undefined ? Number(earned) / 1e18 : 0;

  return (
    <div className="min-h-full">
      <Nav address={address} isConnected={isConnected} onDisconnect={() => disconnect()} />

      <main className="mx-auto w-full max-w-[760px] px-5 py-8">
        <div className="mb-5">
          <h1 className="text-[22px] font-bold tracking-tight">Earn with the WICK MON Vault</h1>
          <p className="mt-1 text-[13px] text-muted">Deposit testnet MON. The AI market maker works your liquidity every block and streams the spread it earns back to you. Single-sided — just MON. Withdraw anytime.</p>
        </div>

        {!isConnected ? (
          <div className="panel p-8 text-center">
            <p className="text-[14px] text-muted2">Connect your wallet to deposit MON and open a real on-chain position.</p>
            <button onClick={() => connect({ connector: connectors[0] })} disabled={connecting} className="btn btn-primary mt-4 px-5 py-2.5">
              {connecting ? "Connecting…" : "Connect MetaMask"}
            </button>
            {!connectors.length && <p className="mt-3 text-[12px] text-muted">No injected wallet found — install MetaMask.</p>}
          </div>
        ) : wrongChain ? (
          <div className="panel p-8 text-center">
            <p className="text-[14px]" style={{ color: "var(--warn)" }}>Wrong network.</p>
            <p className="mt-1 text-[13px] text-muted">Switch your wallet to Monad Testnet to continue.</p>
            <button onClick={() => switchChain({ chainId: MONAD_TESTNET_ID })} className="btn btn-primary mt-4 px-5 py-2.5">Switch to Monad Testnet</button>
          </div>
        ) : (
          <>
            {/* POSITION */}
            <section className="panel">
              <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
                <span className="label">your position</span>
                <span className="ml-auto text-[11px] text-muted">vault TVL {fmt(totalAssets, 2)} MON</span>
              </div>
              <div className="grid grid-cols-2 gap-y-4 px-4 py-4 sm:grid-cols-4">
                <Stat k="position value" v={`${fmt(assets)} MON`} big />
                <Stat k="deposited" v={`${fmt(cost)} MON`} />
                <Stat k="earned" v={`${earnedNum >= 0 ? "+" : "−"}${fmt(earned !== undefined ? (earned < 0n ? -earned : earned) : undefined, 5)} MON`} color="var(--up)" />
                <Stat k="vault shares" v={fmt(shares, 2)} />
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
                <button onClick={aiEarn} disabled={busy || !assets || assets === 0n} className="btn px-3.5 py-2 text-[12.5px]" style={{ borderColor: "var(--accent)", color: "var(--accent-2)" }}>▶ Let the AI market-make (1 day)</button>
                <button onClick={withdraw} disabled={busy || !shares || shares === 0n} className="btn px-3.5 py-2 text-[12.5px]">Withdraw all</button>
                <span className="ml-auto text-[11.5px] text-muted">earnings stream in as price-per-share rises</span>
              </div>
            </section>

            {/* DEPOSIT */}
            <section className="panel mt-3">
              <div className="border-b border-border px-4 py-2.5"><span className="label">deposit MON</span></div>
              <div className="px-4 py-4">
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 items-center rounded-lg border border-border bg-[#0c0c0f] px-3 py-2">
                    <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" className="mono w-full bg-transparent text-[18px] outline-none" placeholder="0.0" />
                    <span className="mono text-[13px] text-muted">MON</span>
                  </div>
                  <button onClick={deposit} disabled={busy || !amount || Number(amount) <= 0} className="btn btn-primary px-5 py-2.5">{busy ? "…" : "Deposit"}</button>
                </div>
                <div className="mt-2 flex items-center gap-2 text-[11.5px] text-muted">
                  <span>balance {bal.data ? fmt(bal.data.value) : "—"} MON</span>
                  {bal.data && (
                    <>
                      <button onClick={() => setAmount((Number(formatEther(bal.data!.value)) * 0.25).toFixed(3))} className="rounded border border-border px-1.5 py-0.5 hover:text-foreground">25%</button>
                      <button onClick={() => setAmount(Math.max(0, Number(formatEther(bal.data!.value)) - 0.05).toFixed(3))} className="rounded border border-border px-1.5 py-0.5 hover:text-foreground">max</button>
                    </>
                  )}
                  {explorer && vault && <a href={`${explorer}/address/${vault}`} target="_blank" rel="noreferrer" className="ml-auto mono hover:text-foreground" style={{ color: "var(--accent-2)" }}>vault contract ↗</a>}
                </div>
              </div>
            </section>

            {busyMsg && <p className="mt-3 text-center text-[13px]" style={{ color: "var(--accent-2)" }}>{busyMsg}</p>}

            <p className="mt-5 text-center text-[11.5px] text-muted">Testnet only. Real native MON, real contract, your signature. The vault is single-sided; the AI strategy&apos;s earnings are streamed in by the keeper. See the live engine on the{" "}
              <Link href="/" className="underline hover:text-foreground">dashboard ↗</Link>.</p>
          </>
        )}
      </main>
    </div>
  );
}

function Nav({ address, isConnected, onDisconnect }: { address?: string; isConnected: boolean; onDisconnect: () => void }) {
  return (
    <header className="sticky top-0 z-20 border-b border-border bg-[#08080a]/85 backdrop-blur-sm">
      <div className="mx-auto flex h-[52px] max-w-[760px] items-center gap-3 px-5">
        <Link href="/" className="flex items-center gap-2.5">
          <div className="grid h-7 w-7 place-items-center rounded-md border border-border" style={{ background: "#0d0b16" }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden><line x1="7" y1="1" x2="7" y2="13" stroke="var(--accent-2)" strokeWidth="1.5" strokeLinecap="round" /><rect x="4" y="4" width="6" height="6" rx="1.5" fill="var(--accent)" /></svg>
          </div>
          <span className="text-[15px] font-bold tracking-tight">WICK</span>
        </Link>
        <nav className="ml-3 flex items-center gap-3 text-[12.5px] text-muted">
          <Link href="/" className="hover:text-foreground">Dashboard</Link>
          <span className="text-foreground">Earn</span>
        </nav>
        <div className="ml-auto flex items-center gap-2 text-[12px]">
          <span className="chip flex items-center gap-1.5 px-3 py-1.5"><span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent)" }} /> Monad Testnet</span>
          {isConnected && (
            <button onClick={onDisconnect} className="chip mono px-3 py-1.5 hover:text-foreground" title="disconnect">{short(address)}</button>
          )}
        </div>
      </div>
    </header>
  );
}

function Stat({ k, v, big, color }: { k: string; v: string; big?: boolean; color?: string }) {
  return (
    <div>
      <div className="label">{k}</div>
      <div className={`mono mt-1 font-semibold ${big ? "text-[22px]" : "text-[15px]"}`} style={{ color: color ?? "var(--text)" }}>{v}</div>
    </div>
  );
}
