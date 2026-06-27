import { NextResponse } from "next/server";
import { parseEther } from "viem";
import { account, pub, wallet, ADDR } from "@/lib/contracts";

// Keeper streams a slice of the AI market maker's earnings into the vault, lifting every
// depositor's price-per-share · so a real MON deposit visibly earns. ~0.4% of assets per call
// ("a day" of market-making), capped, funded by the agent wallet.
const vaultAbi = [
  { type: "function", name: "totalAssets", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "reportYield", stateMutability: "payable", inputs: [], outputs: [] },
] as const;

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST() {
  try {
    if (!ADDR.vault) return NextResponse.json({ error: "vault not deployed" }, { status: 400 });
    const total = (await pub.readContract({ address: ADDR.vault, abi: vaultAbi, functionName: "totalAssets" })) as bigint;
    if (total === 0n) return NextResponse.json({ ok: true, yield: "0" });

    let y = (total * 4n) / 1000n; // ~0.4%
    const cap = parseEther("0.3");
    if (y > cap) y = cap;
    if (y === 0n) y = parseEther("0.001");

    const hash = await wallet.writeContract({
      address: ADDR.vault,
      abi: vaultAbi,
      functionName: "reportYield",
      value: y,
      account,
      chain: undefined,
    });
    await pub.waitForTransactionReceipt({ hash });
    return NextResponse.json({ ok: true, hash, yield: y.toString() });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
