// Seguimiento de inversiones: tus compras y ventas, guardadas solo en este navegador.
// La ganancia al vender se calcula de dos formas: con el precio medio de compra y con FIFO
// (lo primero que compraste es lo primero que vendes), que es el criterio que aplica Hacienda
// en España a las criptomonedas. Orientativo: no es asesoramiento fiscal.

const KEY = "cryptolab.portfolio.v1";

export function emptyBook() {
  return { v: 1, txs: [], watch: [] };
}

export function loadBook() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyBook();
    const b = JSON.parse(raw);
    return { ...emptyBook(), ...b };
  } catch {
    return emptyBook();
  }
}

export function saveBook(book) {
  try { localStorage.setItem(KEY, JSON.stringify(book)); } catch { /* sin almacenamiento */ }
}

export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

/** Valida y normaliza un movimiento. Lanza Error con un mensaje claro. */
export function normalizeTx(t) {
  const qty = +t.qty, price = +t.price, fee = +(t.fee || 0);
  if (!(t.type === "buy" || t.type === "sell")) throw new Error("Tipo de movimiento no válido.");
  if (!t.asset) throw new Error("Elige una moneda.");
  if (!(qty > 0)) throw new Error("La cantidad tiene que ser mayor que 0.");
  if (!(price >= 0)) throw new Error("El precio no puede ser negativo.");
  if (!(fee >= 0)) throw new Error("La comisión no puede ser negativa.");
  if (!/^\d{4}-\d{2}-\d{2}/.test(t.date || "")) throw new Error("Fecha no válida.");
  return { id: t.id || newId(), type: t.type, asset: t.asset, qty, price, fee, date: t.date.slice(0, 10), note: (t.note || "").slice(0, 200) };
}

const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0);

/**
 * Posiciones por moneda.
 * Precio medio: cada compra suma cantidad y coste (con comisión); cada venta resta
 * cantidad y la parte proporcional del coste, y la diferencia con lo cobrado es la
 * ganancia realizada. También calcula FIFO (las primeras compradas son las primeras vendidas).
 */
export function holdings(txs) {
  const out = {};
  for (const t of [...txs].sort(byDate)) {
    const h = (out[t.asset] ||= { asset: t.asset, qty: 0, cost: 0, realized: 0, realizedFifo: 0, invested: 0, lots: [], warnings: [] });
    if (t.type === "buy") {
      const c = t.qty * t.price + t.fee;
      h.qty += t.qty;
      h.cost += c;
      h.invested += c;
      h.lots.push({ qty: t.qty, unit: c / t.qty });
    } else {
      let q = t.qty;
      if (q > h.qty + 1e-12) {
        h.warnings.push(`El ${t.date} vendes ${t.qty} ${t.asset} pero solo tenías ${+h.qty.toFixed(10)}.`);
        q = h.qty;
      }
      const avg = h.qty > 0 ? h.cost / h.qty : 0;
      const proceeds = q * t.price - t.fee * (q / t.qty);
      h.realized += proceeds - avg * q;
      h.cost -= avg * q;
      h.qty -= q;
      // FIFO
      let left = q, fifoCost = 0;
      while (left > 1e-15 && h.lots.length) {
        const lot = h.lots[0];
        const take = Math.min(lot.qty, left);
        fifoCost += take * lot.unit;
        lot.qty -= take;
        left -= take;
        if (lot.qty <= 1e-15) h.lots.shift();
      }
      h.realizedFifo += proceeds - fifoCost;
      if (h.qty < 1e-12) { h.qty = 0; h.cost = 0; }
    }
  }
  for (const h of Object.values(out)) h.avg = h.qty > 0 ? h.cost / h.qty : 0;
  return out;
}

/** Añade valor actual y ganancia sin realizar con los precios dados ({ BTC: 57000, ... }). */
export function valuate(hold, prices) {
  const rows = Object.values(hold).map((h) => {
    const price = prices[h.asset];
    const value = price != null ? h.qty * price : null;
    const unrealized = value != null ? value - h.cost : null;
    return { ...h, price, value, unrealized, pct: value != null && h.cost > 0 ? (unrealized / h.cost) * 100 : null };
  });
  const total = rows.reduce((s, r) => s + (r.value || 0), 0);
  const cost = rows.reduce((s, r) => s + r.cost, 0);
  const realized = rows.reduce((s, r) => s + r.realized, 0);
  for (const r of rows) r.share = total > 0 && r.value ? r.value / total : 0;
  rows.sort((a, b) => (b.value || 0) - (a.value || 0));
  return { rows, total, cost, unrealized: total - cost, pct: cost > 0 ? ((total - cost) / cost) * 100 : 0, realized };
}

/**
 * Evolución del valor de la cartera día a día.
 * closes: { BTC: [{ t: ms, v: precio }...] } con cierres diarios.
 * Devuelve [{ t, value, invested }], donde invested es el dinero neto metido hasta ese día.
 */
export function history(txs, closes) {
  const sorted = [...txs].sort(byDate);
  if (!sorted.length) return [];
  const start = Date.parse(sorted[0].date + "T00:00:00Z");
  const days = new Set();
  for (const series of Object.values(closes)) for (const p of series) if (p.t >= start) days.add(dayKey(p.t));
  const daysSorted = [...days].sort();
  const priceAt = {};
  for (const [sym, series] of Object.entries(closes)) priceAt[sym] = new Map(series.map((p) => [dayKey(p.t), p.v]));
  const last = {};
  const out = [];
  let i = 0;
  const qty = {};
  let invested = 0;
  for (const d of daysSorted) {
    while (i < sorted.length && sorted[i].date <= d) {
      const t = sorted[i++];
      const sign = t.type === "buy" ? 1 : -1;
      qty[t.asset] = (qty[t.asset] || 0) + sign * t.qty;
      invested += t.type === "buy" ? t.qty * t.price + t.fee : -(t.qty * t.price - t.fee);
    }
    let value = 0;
    for (const [sym, q] of Object.entries(qty)) {
      const p = priceAt[sym]?.get(d);
      if (p != null) last[sym] = p;
      value += Math.max(0, q) * (last[sym] ?? 0);
    }
    out.push({ t: Date.parse(d + "T12:00:00Z"), value, invested });
  }
  return out;
}

const dayKey = (ms) => new Date(ms).toISOString().slice(0, 10);

// ---------- copia de seguridad ----------
export function toCSV(txs) {
  const head = "fecha;tipo;moneda;cantidad;precio_eur;comision_eur;nota";
  const esc = (s) => /[;"\n]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : s;
  const num = (n) => String(n).replace(".", ",");
  return "﻿" + [head, ...[...txs].sort(byDate).map((t) =>
    [t.date, t.type === "buy" ? "compra" : "venta", t.asset, num(t.qty), num(t.price), num(t.fee), esc(t.note || "")].join(";"))].join("\n");
}

export function fromJSON(text) {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.txs)) throw new Error("Este archivo no es una copia de Crypto Lab.");
  return { ...emptyBook(), txs: data.txs.map(normalizeTx), watch: Array.isArray(data.watch) ? data.watch : [] };
}
