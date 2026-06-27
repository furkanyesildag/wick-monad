import { NextResponse } from "next/server";
import { readState } from "@/lib/agent";

export const dynamic = "force-dynamic";

// Monad's public RPC occasionally times out one of the reads; retry once before failing
// so a transient blip never blanks the dashboard.
export async function GET() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return NextResponse.json(await readState());
    } catch (e) {
      if (attempt === 1) return NextResponse.json({ error: String(e) }, { status: 500 });
      await new Promise((r) => setTimeout(r, 350));
    }
  }
}
