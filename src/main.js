import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/source-serif-4/600.css";
import "@fontsource/source-serif-4/400-italic.css";
import "./styles.css";

import { renderCalculator } from "./views/calculator.js";
import { renderLearn } from "./views/learn.js";
import { renderWallet } from "./views/wallet.js";
import { renderExplorer } from "./views/explorer.js";
import { renderMarket } from "./views/market.js";
import { renderPortfolio } from "./views/portfolio.js";
import { loadAlerts, saveAlerts, due } from "./lib/alerts.js";
import { fmtPrice } from "./views/market.js";
import * as market from "./lib/market.js";
import { eur, num } from "./lib/ui.js";

const routes = {
  calculadora: renderCalculator,
  mercado: renderMarket,
  inversiones: renderPortfolio,
  "como-funciona": renderLearn,
  cartera: renderWallet,
  seguir: renderExplorer,
};

const app = document.getElementById("app");
let current = null;

function route() {
  const tab = (location.hash.slice(1).split("/")[0]) || "calculadora";
  const render = routes[tab] || renderCalculator;
  const name = routes[tab] ? tab : "calculadora";
  document.querySelectorAll("nav a").forEach((a) => a.classList.toggle("active", a.dataset.tab === name));
  if (current === name && name === "seguir") return; // la búsqueda cambia el hash sin recargar la vista
  current = name;
  render(app);
  window.scrollTo(0, 0);
}

window.addEventListener("hashchange", route);
route();

// Línea de cotizaciones, como la cabecera de un libro de cuentas
async function ticker() {
  const el = document.getElementById("ticker");
  try {
    const [p, fees, tip, gas] = await Promise.all([
      market.prices(), market.btcFees().catch(() => null), market.btcTip().catch(() => null), market.ethGas().catch(() => null),
    ]);
    const chg = (v) => (v == null ? "" : `<small class="${v >= 0 ? "up" : "down"}">${v >= 0 ? "▲" : "▼"} ${num(Math.abs(v), 1)} %</small>`);
    el.innerHTML = `
      <span>BTC <b>${eur(p.BTC)}</b> ${chg(p.BTCchg)}</span>
      <span>ETH <b>${eur(p.ETH)}</b> ${chg(p.ETHchg)}</span>
      ${fees ? `<span>Comisión BTC <b>${fees.halfHourFee} sat/vB</b></span>` : ""}
      ${gas ? `<span>Gas ETH <b>${num(gas.totalGwei, 2)} gwei</b></span>` : ""}
      ${tip ? `<span>Bloque <b>${num(tip, 0)}</b></span>` : ""}`;
  } catch {
    el.innerHTML = `<span class="muted">Sin conexión con los datos de mercado</span>`;
  }
}
ticker();
setInterval(ticker, 60_000);

// Alertas de precio: se comprueban cada minuto, estés en la pestaña que estés
async function checkAlerts() {
  const alerts = loadAlerts();
  if (!alerts.some((a) => !a.triggeredAt)) return;
  let q;
  try { q = await market.quotes(); } catch { return; }
  const prices = Object.fromEntries(Object.entries(q).map(([k, v]) => [k, v.price]));
  const hits = due(alerts, prices);
  if (!hits.length) return;
  const now = Date.now();
  saveAlerts(alerts.map((a) => (hits.some((h) => h.id === a.id) ? { ...a, triggeredAt: now } : a)));
  for (const a of hits) {
    const text = `${a.asset} ${a.op === "above" ? "ha subido a" : "ha bajado a"} ${fmtPrice(prices[a.asset])} (tu alerta: ${fmtPrice(a.price)})`;
    toast(text);
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification("Crypto Lab", { body: text, tag: a.id });
    } catch { /* */ }
  }
}

function toast(text) {
  const box = document.getElementById("toasts");
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = "🔔 " + text;
  const close = document.createElement("button");
  close.textContent = "×";
  close.setAttribute("aria-label", "Cerrar");
  close.onclick = () => t.remove();
  t.append(close);
  box.append(t);
}

checkAlerts();
setInterval(checkAlerts, 60_000);
