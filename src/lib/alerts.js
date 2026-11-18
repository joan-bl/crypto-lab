// Alertas de precio. Se guardan en este navegador y se comprueban cada minuto
// mientras Crypto Lab esté abierto en alguna pestaña (no hay servidor que vigile por ti).

const KEY = "cryptolab.alerts.v1";

export function loadAlerts() {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}

export function saveAlerts(list) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* */ }
  window.dispatchEvent(new CustomEvent("alerts-changed"));
}

export function makeAlert(asset, op, price) {
  if (!(op === "above" || op === "below")) throw new Error("Condición no válida.");
  if (!(+price > 0)) throw new Error("Pon un precio mayor que 0.");
  return { id: Math.random().toString(36).slice(2, 10), asset, op, price: +price, created: Date.now(), triggeredAt: null };
}

/** Devuelve las alertas que se cumplen con estos precios (y aún no habían saltado). */
export function due(alerts, prices) {
  return alerts.filter((a) => !a.triggeredAt && prices[a.asset] != null &&
    (a.op === "above" ? prices[a.asset] >= a.price : prices[a.asset] <= a.price));
}
