import { NextResponse } from "next/server";
import { runTick, readState } from "@/lib/agent";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST() {
  try {
    await runTick();
    const state = await readState();
    return NextResponse.json(state);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
