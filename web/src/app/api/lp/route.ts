import { NextResponse } from "next/server";
import { becomeLP } from "@/lib/agent";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST() {
  try {
    const res = await becomeLP();
    return NextResponse.json(res);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
