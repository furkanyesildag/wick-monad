import { NextResponse } from "next/server";
import { becomeLP } from "@/lib/agent";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    let amountUsd = 5000;
    try {
      const body = await req.json();
      if (body && typeof body.amountUsd === "number" && body.amountUsd > 0) amountUsd = body.amountUsd;
    } catch { /* default */ }
    const res = await becomeLP(amountUsd);
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
