import { NextResponse } from "next/server";
import { ADDR, deployment } from "@/lib/contracts";

export const dynamic = "force-dynamic";

export async function GET() {
  const chainId = deployment.chainId;
  const explorer = chainId === 10143 ? "https://testnet.monadscan.com" : null;
  return NextResponse.json({
    chainId,
    onMonad: chainId === 10143,
    explorer,
    addresses: ADDR,
  });
}
