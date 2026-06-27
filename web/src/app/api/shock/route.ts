import { NextResponse } from "next/server";
import { queueShock } from "@/lib/agent";

export const dynamic = "force-dynamic";

export async function POST() {
  queueShock();
  return NextResponse.json({ ok: true });
}
