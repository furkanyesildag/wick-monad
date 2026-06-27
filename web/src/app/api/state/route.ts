import { NextResponse } from "next/server";
import { readState } from "@/lib/agent";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = await readState();
    return NextResponse.json(state);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
