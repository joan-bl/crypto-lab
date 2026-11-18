// Comisiones públicas aproximadas (revisadas en noviembre de 2026).
// Cambian a menudo y dependen del país, del volumen y del método de pago:
// la app deja editarlas y enlaza la página oficial de cada una.
//
// kind:
//   exchange → compras en un libro de órdenes: comisión + spread/deslizamiento real del libro
//   broker   → app de compra sencilla: comisión + margen sobre el precio (spread)
//   onramp   → pasarela con tarjeta
//   dex      → intercambio descentralizado desde tu propia cartera (ya tienes stablecoins)

export const CHECKED = "noviembre 2026";

export const DEFAULT_PROVIDERS = [
  {
    id: "binance", name: "Binance", kind: "exchange",
    depositLabel: "Transferencia SEPA", depositPct: 0, depositFixed: 0,
    tradePct: 0.1, canWithdraw: true,
    source: "https://www.binance.com/es/fee/schedule",
  },
  {
    id: "revolutx", name: "Revolut X", kind: "exchange",
    depositLabel: "Desde tu cuenta Revolut", depositPct: 0, depositFixed: 0,
    tradePct: 0.09, canWithdraw: true,
    source: "https://www.revolut.com/es-ES/legal/exchangingcryptocurrenciespersonalfees/",
  },
  {
    id: "bitvavo", name: "Bitvavo", kind: "exchange",
    depositLabel: "Transferencia SEPA", depositPct: 0, depositFixed: 0,
    tradePct: 0.25, canWithdraw: true,
    source: "https://bitvavo.com/en/fees",
  },
  {
    id: "kraken", name: "Kraken Pro", kind: "exchange",
    depositLabel: "Transferencia SEPA", depositPct: 0, depositFixed: 0,
    tradePct: 0.4, canWithdraw: true,
    source: "https://www.kraken.com/features/fee-schedule",
  },
  {
    id: "coinbase-adv", name: "Coinbase Advanced", kind: "exchange",
    depositLabel: "Transferencia SEPA", depositPct: 0, depositFixed: 0,
    tradePct: 0.6, canWithdraw: true,
    source: "https://help.coinbase.com/en/coinbase/trading-and-funding/advanced-trade/advanced-trade-fees",
  },
  {
    id: "revolut", name: "Revolut (app normal)", kind: "broker",
    depositLabel: "Desde tu cuenta Revolut", depositPct: 0, depositFixed: 0,
    tradePct: 1.49, spreadPct: 1, canWithdraw: true,
    spreadNote: "El margen no es público; ~1 % es una estimación de terceros.",
    source: "https://www.revolut.com/es-ES/legal/exchangingcryptocurrenciespersonalfees/",
  },
  {
    id: "coinbase", name: "Coinbase (compra simple)", kind: "broker",
    depositLabel: "Transferencia SEPA", depositPct: 0, depositFixed: 0,
    tradePct: 1.49, spreadPct: 1, canWithdraw: true,
    spreadNote: "Coinbase indica un margen de en torno al 1 % en la compra simple.",
    source: "https://help.coinbase.com/en/coinbase/trading-and-funding/pricing-and-fees/fees",
  },
  {
    id: "card", name: "Pasarela con tarjeta (tipo MoonPay)", kind: "onramp",
    depositLabel: "Pago con tarjeta", depositPct: 3.5, depositFixed: 0,
    tradePct: 1, spreadPct: 1, canWithdraw: true,
    spreadNote: "Las pasarelas suelen cobrar 3–5 % por tarjeta más un margen.",
    source: "https://www.moonpay.com/legal/fees",
  },
  {
    id: "uniswap", name: "Uniswap (DEX), si ya tienes USDC en tu cartera", kind: "dex",
    assets: ["ETH"], poolPct: 0.05,
    depositLabel: "", depositPct: 0, depositFixed: 0, tradePct: 0,
    source: "https://docs.uniswap.org/concepts/protocol/fees",
  },
];

export const KIND_LABEL = {
  exchange: "Exchange (libro de órdenes)",
  broker: "App de compra sencilla",
  onramp: "Pasarela con tarjeta",
  dex: "Exchange descentralizado",
};
