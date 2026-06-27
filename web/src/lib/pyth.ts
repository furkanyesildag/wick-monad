import "server-only";

// Real MON/USD price from Pyth — the live anchor + a real historical series we replay
// (time-compressed) so the demo runs on genuine market data, not a made-up walk.
const HERMES = "https://hermes.pyth.network";
const BENCH = "https://benchmarks.pyth.network";
export const MON_USD_FEED = "0x31491744e2dbf6df7fcf4ac0820d18a609b49076d45066d3568424e62f686cd1";

/** Latest real MON/USD spot price (USD). */
export async function getLiveMonUsd(): Promise<number | null> {
  try {
    const r = await fetch(`${HERMES}/v2/updates/price/latest?ids[]=${MON_USD_FEED}`, { cache: "no-store" });
    if (!r.ok) return null;
    const d = await r.json();
    const p = d.parsed?.[0]?.price;
    if (!p) return null;
    return Number(p.price) * 10 ** Number(p.expo);
  } catch {
    return null;
  }
}

/** Real MON/USD 1-minute closes over the last `hours` — replayed as the demo's price path. */
export async function getRealSeries(hours = 8): Promise<number[]> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const from = now - hours * 3600;
    const r = await fetch(
      `${BENCH}/v1/shims/tradingview/history?symbol=Crypto.MON%2FUSD&resolution=1&from=${from}&to=${now}`,
      { cache: "no-store" },
    );
    if (!r.ok) return [];
    const d = await r.json();
    const c: number[] = Array.isArray(d.c) ? d.c : [];
    return c.filter((x) => typeof x === "number" && x > 0);
  } catch {
    return [];
  }
}
