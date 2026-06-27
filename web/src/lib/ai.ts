import "server-only";

// The AI pricing brain. Given recent (real Pyth) price action, GPT decides the spread the
// market maker should quote and a regime label — wider when volatile/toxic to protect LPs,
// tighter when calm to win benign flow. Its reasoning is surfaced in the agent console.
const KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";

export type AiPolicy = { regime: "calm" | "volatile" | "toxic"; spreadBps: number; reasoning: string };

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));

export function aiEnabled() {
  return !!KEY;
}

const SYS =
  "You are the pricing engine of WICK, an autonomous on-chain market maker (propAMM) on Monad " +
  "that quotes a MON/USD pool and is repriced every block. Each call you receive recent price " +
  "action and must choose the half-spread (in basis points) to quote and a market regime. " +
  "Goal: maximize fees from benign retail flow while protecting LPs from adverse selection " +
  "(LVR). Use realistic, competitive spreads: ~5-15 bps when calm, ~15-50 bps when volatile, " +
  "and only above 80 bps in a severe shock. Tighten aggressively when the market is quiet so " +
  "you win flow. " +
  'Reply ONLY as compact JSON: {"regime":"calm|volatile|toxic","spreadBps":<integer 5-300>,"reasoning":"<one short sentence, first person>"}';

export async function getAiPolicy(input: {
  priceChangePct: number;
  recentReturnsPct: number[];
  volPct: number;
  shock: boolean;
}): Promise<AiPolicy | null> {
  if (!KEY) return null;
  const user =
    `Last block move: ${input.priceChangePct.toFixed(2)}%. ` +
    `Recent returns (% oldest→newest): [${input.recentReturnsPct.map((r) => r.toFixed(2)).join(", ")}]. ` +
    `Short-term volatility: ${input.volPct.toFixed(2)}%.` +
    (input.shock ? " A large price shock just occurred this block." : "");

  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${KEY}` },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: SYS },
          { role: "user", content: user },
        ],
        response_format: { type: "json_object" },
        temperature: 0.3,
        max_tokens: 120,
      }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    const txt = d.choices?.[0]?.message?.content;
    if (!txt) return null;
    const p = JSON.parse(txt);
    const regime = ["calm", "volatile", "toxic"].includes(p.regime) ? p.regime : "calm";
    return {
      regime,
      spreadBps: clamp(Math.round(Number(p.spreadBps) || 8), 5, 300),
      reasoning: String(p.reasoning || "").slice(0, 140),
    };
  } catch {
    return null;
  }
}
