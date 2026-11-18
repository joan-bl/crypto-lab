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
import * as market from "./lib/market.js";
import { eur, num } from "./lib/ui.js";

const routes = {
  calculadora: renderCalculator,
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
