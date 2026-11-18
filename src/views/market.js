// Mercado: cotizaciones, gráfica de precio por periodos y alertas de precio.

import { ASSETS, BY_SYM, priceDigits } from "../lib/assets.js";
import * as market from "../lib/market.js";
import { lineChart, dataTable } from "../lib/chart.js";
import { loadAlerts, saveAlerts, makeAlert } from "../lib/alerts.js";
import { $, esc, num, errorBox } from "../lib/ui.js";

const PREFS = "cryptolab.market.v1";
const prefs = () => { try { return { sym: "BTC", range: "30d", ...JSON.parse(localStorage.getItem(PREFS) || "{}") }; } catch { return { sym: "BTC", range: "30d" }; } };
const setPrefs = (p) => { try { localStorage.setItem(PREFS, JSON.stringify({ ...prefs(), ...p })); } catch { /* */ } };

export const fmtPrice = (v, short = false) => {
  if (!Number.isFinite(v)) return "—";
  const d = short ? Math.min(priceDigits(v), v >= 100 ? 0 : priceDigits(v)) : priceDigits(v);
  return `${num(v, d)} €`;
};
const fmtChg = (c) => `<span class="${c >= 0 ? "up" : "down"}">${c >= 0 ? "▲ +" : "▼ −"}${num(Math.abs(c), 2)} %</span>`;
const dateFmt = (range) => (t) => new Date(t).toLocaleString("es-ES", range === "24h" ? { hour: "2-digit", minute: "2-digit" } : range === "7d" ? { weekday: "short", day: "numeric" } : range === "30d" ? { day: "numeric", month: "short" } : { month: "short", year: "2-digit" });
const longDate = (range) => (t) => new Date(t).toLocaleString("es-ES", range === "1a" || range === "5a" ? { day: "numeric", month: "long", year: "numeric" } : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

let redrawAlerts = () => {};
window.addEventListener("alerts-changed", () => redrawAlerts());

export function renderMarket(root) {
  const p = prefs();
  root.innerHTML = `<div class="view">
  <section class="intro">
    <h1>Mercado</h1>
    <p class="lede">Precios en euros en directo (Binance), gráficas por periodos y avisos cuando una moneda cruza el precio que tú digas.</p>
  </section>

  <div class="market-grid">
    <section class="card board">
      <h2>Cotizaciones</h2>
      <table class="entries compact quotes"><thead><tr><th>Moneda</th><th class="n">Precio</th><th class="n">24 h</th></tr></thead><tbody id="quotes"><tr><td colspan="3" class="muted">Cargando…</td></tr></tbody></table>
    </section>

    <section class="card chart-card">
      <div class="filters" role="group" aria-label="Periodo">
        ${Object.entries(market.RANGES).map(([k, r]) => `<button class="chip ${k === p.range ? "on" : ""}" data-range="${k}">${r.label}</button>`).join("")}
      </div>
      <div class="hero" id="hero"></div>
      <div id="chart" class="chart-box"></div>
      <details class="small"><summary>Ver los datos en una tabla</summary><div id="chart-table"></div></details>
      <p class="muted small">Precio de cierre de cada vela de Binance (par en euros). Usa el ratón o las flechas del teclado sobre la gráfica.</p>
    </section>
  </div>

  <section class="card" id="alerts">
    <h2>Alertas de precio</h2>
    <form class="inline-form" id="alert-form" autocomplete="off">
      <span>Avísame cuando</span>
      <select id="al-asset">${ASSETS.map((a) => `<option value="${a.sym}" ${a.sym === p.sym ? "selected" : ""}>${a.sym}</option>`).join("")}</select>
      <select id="al-op"><option value="above">suba a</option><option value="below">baje a</option></select>
      <label class="field"><input type="number" id="al-price" step="any" min="0" required><b>€</b></label>
      <button class="btn">Crear alerta</button>
    </form>
    <div id="al-msg"></div>
    <ul class="txlist" id="al-list"></ul>
    <p class="small muted" id="al-note"></p>
  </section></div>`;
  const view = root.firstElementChild;

  let current = { ...p };
  let q = {};

  async function drawQuotes() {
    try {
      q = await market.quotes();
      $("#quotes", root).innerHTML = ASSETS.filter((a) => q[a.sym]).map((a) => `
        <tr class="${a.sym === current.sym ? "sel" : ""}" data-sym="${a.sym}" tabindex="0">
          <td><b>${a.sym}</b> <small class="muted">${esc(a.name)}</small></td>
          <td class="n">${fmtPrice(q[a.sym].price)}</td>
          <td class="n">${fmtChg(q[a.sym].chg)}</td>
        </tr>`).join("");
      if (!$("#al-price", root).value) $("#al-price", root).placeholder = num(q[$("#al-asset", root).value]?.price || 0, 2);
    } catch (err) {
      $("#quotes", root).innerHTML = `<tr><td colspan="3">${errorBox(err)}</td></tr>`;
    }
  }

  async function drawChart() {
    const { sym, range } = current;
    const box = $("#chart", root);
    box.classList.add("loading");
    try {
      const pts = await market.klines(sym, range);
      const first = pts[0]?.v, last = pts.at(-1)?.v;
      const chg = first ? (last / first - 1) * 100 : 0;
      $("#hero", root).innerHTML = `
        <span class="hero-name">${esc(BY_SYM[sym].name)} <small>${sym}/EUR</small></span>
        <span class="hero-price">${fmtPrice(last)}</span>
        <span class="hero-chg">${fmtChg(chg)} <small class="muted">en ${market.RANGES[range].label}</small></span>`;
      const series = [{ name: `${sym} en €`, color: "var(--s1)", points: pts, area: true }];
      lineChart(box, { series, fmt: (v, s) => fmtPrice(v, s), fmtT: longDate(range), fmtAxis: dateFmt(range), label: `Precio de ${BY_SYM[sym].name} en euros, ${market.RANGES[range].label}` });
      $("#chart-table", root).innerHTML = dataTable(series, (v) => fmtPrice(v), longDate(range), 200);
    } catch (err) {
      box.innerHTML = errorBox(err);
    } finally {
      box.classList.remove("loading");
    }
  }

  function drawAlerts() {
    const list = loadAlerts();
    $("#al-list", root).innerHTML = list.length ? list.map((a) => `
      <li class="${a.triggeredAt ? "done" : ""}">
        <span><b>${a.sym || a.asset}</b> ${a.op === "above" ? "sube a" : "baja a"} <b class="mono">${fmtPrice(a.price)}</b>
          ${q[a.asset] ? `<small class="muted"> · ahora ${fmtPrice(q[a.asset].price)}</small>` : ""}</span>
        <span>${a.triggeredAt ? `<small>✓ saltó ${new Date(a.triggeredAt).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</small> <button class="link" data-rearm="${a.id}">reactivar</button>` : "<small class='muted'>vigilando</small>"}
          <button class="link" data-del="${a.id}">quitar</button></span>
      </li>`).join("") : `<li class="muted">No tienes alertas.</li>`;
    const perm = typeof Notification === "undefined" ? "unsupported" : Notification.permission;
    $("#al-note", root).innerHTML = `Las alertas se guardan en este navegador y se comprueban cada minuto <b>mientras Crypto Lab esté abierto</b> en alguna pestaña (no hay un servidor vigilando por ti). ${
      perm === "default" ? `<button class="link" id="al-perm">Activar avisos del sistema</button> para que te salte un aviso aunque estés en otra ventana.` :
      perm === "granted" ? "Los avisos del sistema están activados." :
      perm === "denied" ? "Los avisos del sistema están bloqueados en este navegador: solo verás el aviso dentro de la página." : ""}`;
    $("#al-perm", root)?.addEventListener("click", async () => { await Notification.requestPermission(); drawAlerts(); });
  }

  view.addEventListener("click", (e) => {
    const r = e.target.closest("[data-range]");
    if (r) {
      current.range = r.dataset.range;
      setPrefs({ range: current.range });
      root.querySelectorAll("[data-range]").forEach((b) => b.classList.toggle("on", b === r));
      drawChart();
    }
    const row = e.target.closest("tr[data-sym]");
    if (row) select(row.dataset.sym);
    const del = e.target.closest("[data-del]");
    if (del) { saveAlerts(loadAlerts().filter((a) => a.id !== del.dataset.del)); drawAlerts(); }
    const re = e.target.closest("[data-rearm]");
    if (re) { saveAlerts(loadAlerts().map((a) => (a.id === re.dataset.rearm ? { ...a, triggeredAt: null } : a))); drawAlerts(); }
  });
  view.addEventListener("keydown", (e) => {
    const row = e.target.closest?.("tr[data-sym]");
    if (row && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); select(row.dataset.sym); }
  });

  function select(sym) {
    current.sym = sym;
    setPrefs({ sym });
    root.querySelectorAll("tr[data-sym]").forEach((tr) => tr.classList.toggle("sel", tr.dataset.sym === sym));
    $("#al-asset", root).value = sym;
    $("#al-price", root).placeholder = num(q[sym]?.price || 0, 2);
    drawChart();
  }

  $("#al-asset", root).addEventListener("change", (e) => { $("#al-price", root).placeholder = num(q[e.target.value]?.price || 0, 2); });
  $("#alert-form", root).addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      const a = makeAlert($("#al-asset", root).value, $("#al-op", root).value, $("#al-price", root).value);
      const now = q[a.asset]?.price;
      if (now != null && ((a.op === "above" && now >= a.price) || (a.op === "below" && now <= a.price))) {
        $("#al-msg", root).innerHTML = `<p class="warn small">Ojo: ${a.asset} ya está a ${fmtPrice(now)}, así que saltará enseguida.</p>`;
      } else $("#al-msg", root).innerHTML = "";
      saveAlerts([...loadAlerts(), a]);
      $("#al-price", root).value = "";
      drawAlerts();
    } catch (err) { $("#al-msg", root).innerHTML = errorBox(err); }
  });
  redrawAlerts = () => { if (view.isConnected) drawAlerts(); };

  drawQuotes().then(drawAlerts);
  drawChart();
  drawAlerts();
  const timer = setInterval(() => { if (!view.isConnected) return clearInterval(timer); drawQuotes().then(drawAlerts); }, 30_000);
}
