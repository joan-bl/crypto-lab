// Datos de mercado en directo (todo son APIs públicas y gratuitas, sin clave).

import { mainnetGas } from "./eth.js";

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
