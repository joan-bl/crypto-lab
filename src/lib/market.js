// Datos de mercado en directo (todo son APIs públicas y gratuitas, sin clave).

import { mainnetGas } from "./eth.js";
import { ASSETS, BY_SYM } from "./assets.js";

const cache = new Map();

// Guarda la promesa (no solo el resultado): si dos partes de la página piden lo mismo
// a la vez, comparten una sola petición.
function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.t < ttlMs) return hit.p;
  const p = fn();
  cache.set(key, { t: Date.now(), p });
  p.catch(() => cache.delete(key));
  return p;
}

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${new URL(url).host}: ${r.status}`);
  return r.json();
}

/** Precios en EUR (CoinGecko). */
export const prices = () =>
  cached("prices", 60_000, async () => {
    try {
      const j = await getJSON("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=eur&include_24hr_change=true");
      return {
        BTC: j.bitcoin.eur, ETH: j.ethereum.eur,
        BTCchg: j.bitcoin.eur_24h_change, ETHchg: j.ethereum.eur_24h_change,
      };
    } catch {
      // CoinGecko limita las peticiones gratuitas: si falla, precios de Binance
      const j = await getJSON(`https://data-api.binance.vision/api/v3/ticker/24hr?symbols=${encodeURIComponent('["BTCEUR","ETHEUR"]')}`);
      const t = Object.fromEntries(j.map((x) => [x.symbol, x]));
      return {
        BTC: +t.BTCEUR.lastPrice, ETH: +t.ETHEUR.lastPrice,
        BTCchg: +t.BTCEUR.priceChangePercent, ETHchg: +t.ETHEUR.priceChangePercent,
      };
    }
  });

/** Libro de órdenes real de Binance (BTC/EUR o ETH/EUR). */
export const orderBook = (asset) =>
  cached(`book-${asset}`, 20_000, async () => {
    const j = await getJSON(`https://data-api.binance.vision/api/v3/depth?symbol=${asset}EUR&limit=1000`);
    return { asks: j.asks, bids: j.bids, source: "Binance", time: Date.now() };
  });

/** Comisiones de la red Bitcoin real (mempool.space), en sat/vB. */
export const btcFees = () => cached("btcfees", 60_000, () => getJSON("https://mempool.space/api/v1/fees/recommended"));
export const btcMempoolBlocks = () => cached("mpblocks", 30_000, () => getJSON("https://mempool.space/api/v1/fees/mempool-blocks"));
export const btcTip = () => cached("tip", 30_000, async () => {
  const r = await fetch("https://mempool.space/api/blocks/tip/height");
  return +(await r.text());
});
export const btcRecentBlocks = () => cached("blocks", 60_000, () => getJSON("https://mempool.space/api/v1/blocks"));

/** Gas de Ethereum real, en gwei. */
export const ethGas = () => cached("gas", 60_000, mainnetGas);

// ---------- varias monedas (Binance) ----------

/** Precio actual y variación en 24 h de todas las monedas seguibles: { BTC: { price, chg } }. */
export const quotes = () =>
  cached("quotes", 30_000, async () => {
    const symbols = ASSETS.map((a) => a.pair);
    const j = await getJSON(`https://data-api.binance.vision/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(symbols))}`);
    const byPair = Object.fromEntries(j.map((x) => [x.symbol, x]));
    const out = {};
    for (const a of ASSETS) {
      const t = byPair[a.pair];
      if (!t) continue;
      const last = +t.lastPrice, open = +t.openPrice;
      out[a.sym] = a.inverse
        ? { price: 1 / last, chg: open ? ((open / last) - 1) * 100 : 0 }
        : { price: last, chg: +t.priceChangePercent };
    }
    return out;
  });

export const RANGES = {
  "24h": { interval: "15m", limit: 96, label: "24 h" },
  "7d": { interval: "1h", limit: 168, label: "7 días" },
  "30d": { interval: "4h", limit: 180, label: "30 días" },
  "1a": { interval: "1d", limit: 365, label: "1 año" },
  "5a": { interval: "1w", limit: 260, label: "5 años" },
};

/** Velas de Binance → [{ t (ms, cierre), v (precio de cierre en €) }]. */
export const klines = (sym, range) =>
  cached(`k-${sym}-${range}`, 60_000, async () => {
    const a = BY_SYM[sym];
    const r = RANGES[range];
    const j = await getJSON(`https://data-api.binance.vision/api/v3/klines?symbol=${a.pair}&interval=${r.interval}&limit=${r.limit}`);
    return j.map((k) => ({ t: k[6], v: a.inverse ? 1 / +k[4] : +k[4] }));
  });

/** Cierres diarios desde una fecha (para la evolución de la cartera). Máx. 1000 días. */
export const dailyCloses = (sym, sinceMs) =>
  cached(`d-${sym}-${new Date(sinceMs).toISOString().slice(0, 10)}`, 600_000, async () => {
    const a = BY_SYM[sym];
    const j = await getJSON(`https://data-api.binance.vision/api/v3/klines?symbol=${a.pair}&interval=1d&startTime=${sinceMs - 86400000}&limit=1000`);
    return j.map((k) => ({ t: k[0], v: a.inverse ? 1 / +k[4] : +k[4] }));
  });
