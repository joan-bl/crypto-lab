// Calculadora de costes: cuánto te cuesta comprar cripto por cada vía y a quién va cada euro.
// Funciones puras (sin red), para poder probarlas.

// A quién va el dinero de cada comisión
export const RECIPIENTS = {
  bank: { label: "Pasarela de pago / banco", color: "var(--c-bank)" },
  platform: { label: "La plataforma (comisión)", color: "var(--c-platform)" },
  spread: { label: "Margen oculto (spread)", color: "var(--c-spread)" },
  book: { label: "Vendedores del libro (deslizamiento)", color: "var(--c-book)" },
  network: { label: "Mineros / validadores (red)", color: "var(--c-network)" },
  lp: { label: "Proveedores de liquidez (DEX)", color: "var(--c-lp)" },
};

/** Recorre el libro de órdenes de venta (asks) gastando `quote` euros.
 *  asks: [[precio, cantidad], ...] ordenado de más barato a más caro.
 *  Devuelve { qty, avgPrice, filled (bool), levels } */
export function fillAsks(asks, quote) {
  let left = quote;
  let qty = 0;
  let levels = 0;
  for (const [p, q] of asks) {
    const price = +p;
    const size = +q;
    if (left <= 0) break;
    const cost = price * size;
    levels++;
    if (cost >= left) {
      qty += left / price;
      left = 0;
      break;
    }
    qty += size;
    left -= cost;
  }
  return { qty, avgPrice: qty ? (quote - left) / qty : 0, filled: left <= 1e-9, levels, unfilled: left };
}

export function midPrice(book) {
  if (!book?.asks?.length || !book?.bids?.length) return 0;
  return (+book.asks[0][0] + +book.bids[0][0]) / 2;
}

/**
 * Calcula una vía de compra.
 * @param {object} p
 *   amountEur: euros que pones
 *   asset: "BTC" | "ETH"
 *   price: precio de referencia (punto medio del mercado) en EUR
 *   provider: ver providers.js
 *   book: libro de órdenes {asks, bids} (opcional; para exchanges)
 *   selfCustody: si quieres retirar a tu propia cartera
 *   network: { withdrawEur, swapEur } coste de red actual en EUR
 */
export function computePath({ amountEur, asset, price, provider, book, selfCustody, network }) {
  const steps = [];
  const add = (to, label, eur) => {
    if (eur > 0.000001) steps.push({ to, label, eur });
  };
  if (!(amountEur > 0) || !(price > 0)) return null;
  if (provider.assets && !provider.assets.includes(asset)) return null;

  // 1. Meter el dinero
  const depositFee = amountEur * (provider.depositPct || 0) / 100 + (provider.depositFixed || 0);
  add("bank", provider.depositLabel || "Depósito", depositFee);
  let eur = amountEur - depositFee;

  // 2. Comisión de la plataforma
  const tradeFee = eur * (provider.tradePct || 0) / 100;
  add("platform", "Comisión de compra", tradeFee);
  eur -= tradeFee;

  // 3. Comprar: libro de órdenes real, margen oculto o swap en un DEX
  let qty;
  let note = "";
  if (provider.kind === "exchange" && book?.asks?.length) {
    const fill = fillAsks(book.asks, eur);
    qty = fill.qty;
    // Lo que pagas por encima del precio medio de mercado: spread + profundidad del libro
    add("book", "Spread y deslizamiento (libro real)", Math.max(0, eur - qty * price));
    if (!fill.filled) note = "El libro descargado no tiene suficiente profundidad para esta cantidad.";
  } else if (provider.kind === "dex") {
    const lpFee = eur * (provider.poolPct || 0) / 100;
    add("lp", `Comisión del pool (${provider.poolPct}%)`, lpFee);
    add("network", "Gas del swap", network?.swapEur || 0);
    eur -= lpFee + (network?.swapEur || 0);
    qty = Math.max(0, eur / price);
  } else {
    const spread = eur * (provider.spreadPct || 0) / 100;
    add("spread", "Margen sobre el precio", spread);
    qty = (eur - spread) / price;
  }

  // 4. Retirar a tu propia cartera (si la plataforma lo permite)
  let custody = provider.kind === "dex" ? "self" : "platform";
  if (selfCustody && provider.kind !== "dex") {
    if (provider.canWithdraw === false) {
      note = note || "Esta plataforma no deja sacar la cripto a tu propia cartera.";
    } else {
      const mult = provider.withdrawMultiplier ?? 1;
      const wEur = (network?.withdrawEur || 0) * mult;
      add("network", "Retirada a tu cartera (comisión de red)", Math.min(wEur, qty * price));
      qty = Math.max(0, qty - wEur / price);
      custody = "self";
    }
  }

  const totalFee = steps.reduce((s, x) => s + x.eur, 0);
  return {
    provider,
    steps,
    qty,
    valueEur: qty * price,
    totalFee,
    pct: (totalFee / amountEur) * 100,
    custody,
    note,
  };
}

/** Ordena las vías de más barata a más cara. */
export function rankPaths(paths) {
  return paths.filter(Boolean).sort((a, b) => a.totalFee - b.totalFee);
}

// ---------- Costes de red ----------
// Tamaño típico: una transacción SegWit con 1 entrada y 2 salidas ≈ 141 vB
export const BTC_TX_VBYTES = 141;
export const ETH_TRANSFER_GAS = 21000;
export const ETH_SWAP_GAS = 150000;

export function btcNetworkEur(satPerVb, priceEur, vbytes = BTC_TX_VBYTES) {
  return (satPerVb * vbytes / 1e8) * priceEur;
}

export function ethNetworkEur(gwei, priceEur, gas = ETH_TRANSFER_GAS) {
  return (gwei * gas / 1e9) * priceEur;
}
