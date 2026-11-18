// Monedas que se pueden seguir. Precios y gráficas: pares en euros de Binance (públicos, sin clave).
// Para las stablecoins en dólares no hay par en euros: se usa EUR/USDT y se invierte.

export const ASSETS = [
  { sym: "BTC", name: "Bitcoin", pair: "BTCEUR" },
  { sym: "ETH", name: "Ether", pair: "ETHEUR" },
  { sym: "SOL", name: "Solana", pair: "SOLEUR" },
  { sym: "XRP", name: "XRP", pair: "XRPEUR" },
  { sym: "BNB", name: "BNB", pair: "BNBEUR" },
  { sym: "ADA", name: "Cardano", pair: "ADAEUR" },
  { sym: "DOGE", name: "Dogecoin", pair: "DOGEEUR" },
  { sym: "LINK", name: "Chainlink", pair: "LINKEUR" },
  { sym: "LTC", name: "Litecoin", pair: "LTCEUR" },
  { sym: "DOT", name: "Polkadot", pair: "DOTEUR" },
  { sym: "AVAX", name: "Avalanche", pair: "AVAXEUR" },
  { sym: "POL", name: "Polygon", pair: "POLEUR" },
  { sym: "TRX", name: "Tron", pair: "TRXEUR" },
  { sym: "USDT", name: "Tether (dólar)", pair: "EURUSDT", inverse: true },
];

export const BY_SYM = Object.fromEntries(ASSETS.map((a) => [a.sym, a]));

/** Decimales razonables para mostrar un precio en euros. */
export function priceDigits(p) {
  if (p >= 1000) return 0;
  if (p >= 1) return 2;
  if (p >= 0.01) return 4;
  return 8;
}
