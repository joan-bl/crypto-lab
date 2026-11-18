// Mis inversiones: apunta tus compras y ventas reales y mira cuánto valen hoy.
// Todo se guarda solo en este navegador (se puede exportar como copia de seguridad).

import { ASSETS, BY_SYM } from "../lib/assets.js";
import * as market from "../lib/market.js";
import { lineChart, dataTable } from "../lib/chart.js";
import { loadBook, saveBook, normalizeTx, holdings, valuate, history, toCSV, fromJSON, newId } from "../lib/portfolio.js";
import { MAINNET_RPC } from "../lib/eth.js";
import { fmtPrice } from "./market.js";
import { $, esc, eur, num, errorBox, btcAmount } from "../lib/ui.js";

const today = () => new Date().toISOString().slice(0, 10);
const signed = (v, f = eur) => `<span class="${v >= 0 ? "up" : "down"}">${v >= 0 ? "+" : "−"}${f(Math.abs(v))}</span>`;
const qtyFmt = (q) => num(q, q >= 100 ? 2 : q >= 1 ? 4 : 8);

function download(name, text, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

export function renderPortfolio(root) {
  root.innerHTML = `<div class="view">
  <section class="intro">
    <h1>Mis inversiones</h1>
    <p class="lede">Apunta lo que compras y vendes (en cualquier exchange o app) y mira cuánto vale hoy, cuánto ganas o pierdes y cómo ha ido evolucionando. Se guarda <b>solo en este navegador</b>: nadie más lo ve.</p>
  </section>

  <div class="tiles" id="tiles"></div>

  <section class="card">
    <h2>Lo que tienes</h2>
    <div id="holdings"></div>
  </section>

  <section class="card">
    <h2>Evolución</h2>
    <div class="legend-row" id="hist-legend"></div>
    <div id="hist" class="chart-box"></div>
    <details class="small"><summary>Ver los datos en una tabla</summary><div id="hist-table"></div></details>
  </section>

  <div class="two-col">
    <section class="card">
      <h2 id="tx-title">Apuntar un movimiento</h2>
      <form id="tx-form" autocomplete="off">
        <div class="seg" role="radiogroup" aria-label="Tipo">
          <label><input type="radio" name="type" value="buy" checked><span>Compra</span></label>
          <label><input type="radio" name="type" value="sell"><span>Venta</span></label>
        </div>
        <div class="form-grid">
          <label class="field col"><span>Moneda</span><select name="asset">${ASSETS.map((a) => `<option value="${a.sym}">${a.sym} · ${esc(a.name)}</option>`).join("")}</select></label>
          <label class="field col"><span>Fecha</span><input type="date" name="date" value="${today()}" max="${today()}" required></label>
          <label class="field col"><span>Cantidad</span><input type="number" name="qty" step="any" min="0" required placeholder="0,05"></label>
          <label class="field col"><span>Precio por moneda (€) <button type="button" class="link small" id="use-now">usar el de ahora</button></span><input type="number" name="price" step="any" min="0" required></label>
          <label class="field col"><span>Comisión pagada (€)</span><input type="number" name="fee" step="any" min="0" value="0"></label>
          <label class="field col"><span>Nota <small class="muted">(opcional)</small></span><input name="note" maxlength="200" placeholder="p. ej. Bitvavo"></label>
        </div>
        <p class="small muted" id="tx-total"></p>
        <input type="hidden" name="txid">
        <button class="btn">Guardar</button> <button type="button" class="btn-ghost" id="tx-cancel" hidden>Cancelar edición</button>
        <div id="tx-msg"></div>
      </form>
    </section>
    <section class="card">
      <h2>Movimientos</h2>
      <ul class="txlist" id="tx-list"></ul>
    </section>
  </div>

  <section class="card">
    <h2>Direcciones vigiladas <small>solo lectura</small></h2>
    <p class="small muted">Si guardas cripto en tu propia cartera, pega aquí su dirección pública de Bitcoin o Ethereum para ver su saldo real. No hace falta ninguna clave: las direcciones son públicas.</p>
    <form class="inline-form" id="watch-form" autocomplete="off">
      <input id="w-addr" placeholder="bc1… o 0x…" spellcheck="false" class="grow" required>
      <input id="w-label" placeholder="Nombre (p. ej. Ledger)" maxlength="40">
      <button class="btn-ghost">Añadir</button>
    </form>
    <div id="w-msg"></div>
    <ul class="txlist" id="w-list"></ul>
  </section>

  <section class="card">
    <h2>Copia de seguridad</h2>
    <p class="small">Como todo está en este navegador, si borras los datos del navegador o cambias de ordenador lo pierdes. Guarda una copia de vez en cuando.</p>
    <div class="inline-form">
      <button class="btn-ghost" id="exp-json">Descargar copia (.json)</button>
      <button class="btn-ghost" id="exp-csv">Descargar movimientos para Excel (.csv)</button>
      <label class="btn-ghost file-btn">Restaurar copia<input type="file" id="imp-json" accept=".json,application/json" hidden></label>
    </div>
    <div id="bk-msg"></div>
  </section>
  </div>`;
  const view = root.firstElementChild;
  let book = loadBook();
  let q = {};

  const form = $("#tx-form", view);

  // ---------- resumen y posiciones ----------
  async function drawSummary() {
    try { q = await market.quotes(); } catch (err) { $("#holdings", view).innerHTML = errorBox(err); }
    const prices = Object.fromEntries(Object.entries(q).map(([k, v]) => [k, v.price]));
    const h = holdings(book.txs);
    const v = valuate(h, prices);
    const realizedFifo = Object.values(h).reduce((s, x) => s + x.realizedFifo, 0);
    const watched = await watchedValue(prices);
    $("#tiles", view).innerHTML = `
      <div class="tile"><small>Valor actual</small><b>${eur(v.total)}</b>${watched.total ? `<span class="muted">+ ${eur(watched.total)} en direcciones vigiladas</span>` : ""}</div>
      <div class="tile"><small>Te ha costado</small><b>${eur(v.cost)}</b><span class="muted">lo que sigues teniendo</span></div>
      <div class="tile"><small>Ganas o pierdes ahora</small><b>${signed(v.unrealized)}</b><span>${v.cost ? signed(v.pct, (x) => `${num(x, 2)} %`) : ""}</span></div>
      <div class="tile"><small>Ya realizado al vender</small><b>${signed(realizedFifo)}</b><span class="muted" title="Con el precio medio de compra: ${eur(v.realized)}">FIFO, como Hacienda</span></div>`;
    const warnings = Object.values(h).flatMap((x) => x.warnings);
    $("#holdings", view).innerHTML = (warnings.length ? `<p class="warn small">⚠ ${warnings.map(esc).join("<br>")}</p>` : "") + (v.rows.filter((r) => r.qty > 0).length ? `
      <div class="table-wrap"><table class="entries holdings">
        <thead><tr><th>Moneda</th><th class="n">Cantidad</th><th class="n">Precio medio</th><th class="n">Precio hoy</th><th class="n">Valor</th><th class="n">Ganancia</th><th>Peso</th></tr></thead>
        <tbody>${v.rows.filter((r) => r.qty > 0).map((r) => `
          <tr>
            <td><b>${r.asset}</b> <small class="muted">${esc(BY_SYM[r.asset]?.name || "")}</small></td>
            <td class="n">${qtyFmt(r.qty)}</td>
            <td class="n">${fmtPrice(r.avg)}</td>
            <td class="n">${r.price != null ? fmtPrice(r.price) : "—"}</td>
            <td class="n"><b>${r.value != null ? eur(r.value) : "—"}</b></td>
            <td class="n">${r.unrealized != null ? `${signed(r.unrealized)}<br><small>${r.pct != null ? signed(r.pct, (x) => `${num(x, 1)} %`) : ""}</small>` : "—"}</td>
            <td><span class="share" title="${num(r.share * 100, 1)} % de la cartera"><i style="width:${(r.share * 100).toFixed(1)}%"></i></span><small>${num(r.share * 100, 0)} %</small></td>
          </tr>`).join("")}
        </tbody></table></div>` : `<p class="muted">Todavía no has apuntado ninguna compra. Usa el formulario de abajo.</p>`);
  }

  // ---------- evolución ----------
  async function drawHistory() {
    const box = $("#hist", view);
    if (!book.txs.length) {
      box.innerHTML = `<p class="muted small">Aparecerá cuando apuntes tu primer movimiento.</p>`;
      $("#hist-legend", view).innerHTML = "";
      $("#hist-table", view).innerHTML = "";
      return;
    }
    box.classList.add("loading");
    try {
      const first = book.txs.map((t) => t.date).sort()[0];
      const since = Math.max(Date.parse(first + "T00:00:00Z"), Date.now() - 999 * 86400000);
      const syms = [...new Set(book.txs.map((t) => t.asset))].filter((s) => BY_SYM[s]);
      const closes = Object.fromEntries(await Promise.all(syms.map(async (s) => [s, await market.dailyCloses(s, since)])));
      const pts = history(book.txs, closes);
      const series = [
        { name: "Valor de la cartera", color: "var(--s1)", points: pts.map((p) => ({ t: p.t, v: p.value })), area: true },
        { name: "Dinero metido", color: "var(--s2)", points: pts.map((p) => ({ t: p.t, v: p.invested })) },
      ];
      $("#hist-legend", view).innerHTML = series.map((s) => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join("");
      const fmtT = (t) => new Date(t).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
      const span = pts.at(-1).t - pts[0].t;
      const fmtAxis = (t) => new Date(t).toLocaleDateString("es-ES", span > 200 * 86400000 ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short" });
      lineChart(box, { series, fmt: (v) => eur(v), fmtT, fmtAxis, label: "Valor de la cartera y dinero metido, por días" });
      $("#hist-table", view).innerHTML = dataTable(series, eur, fmtT, 200);
    } catch (err) {
      box.innerHTML = errorBox(err);
    } finally {
      box.classList.remove("loading");
    }
  }

  // ---------- movimientos ----------
  function drawTxs() {
    const sorted = [...book.txs].sort((a, b) => (a.date < b.date ? 1 : -1));
    $("#tx-list", view).innerHTML = sorted.length ? sorted.map((t) => `
      <li>
        <span><b class="${t.type === "buy" ? "credit" : "debit"}">${t.type === "buy" ? "Compra" : "Venta"}</b> ${qtyFmt(t.qty)} ${t.asset} a ${fmtPrice(t.price)}
          <small class="muted">${t.date}${t.fee ? ` · comisión ${eur(t.fee)}` : ""}${t.note ? ` · ${esc(t.note)}` : ""}</small></span>
        <span class="n">${eur(t.qty * t.price)} <button class="link" data-edit="${t.id}">editar</button> <button class="link" data-del="${t.id}">borrar</button></span>
      </li>`).join("") : `<li class="muted">Sin movimientos.</li>`;
  }

  function updateTotal() {
    const qty = +form.qty.value, price = +form.price.value, fee = +form.fee.value || 0;
    const buy = form.type.value === "buy";
    $("#tx-total", view).textContent = qty > 0 && price >= 0
      ? `${buy ? "Pagaste" : "Cobraste"} ${eur(buy ? qty * price + fee : qty * price - fee)} en total.`
      : "";
  }

  function resetForm() {
    form.reset();
    form.date.value = today();
    form.elements.txid.value = "";
    $("#tx-title", view).textContent = "Apuntar un movimiento";
    $("#tx-cancel", view).hidden = true;
    updateTotal();
  }

  form.addEventListener("input", updateTotal);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    try {
      const t = normalizeTx({ id: form.elements.txid.value || newId(), type: form.type.value, asset: form.asset.value, qty: form.qty.value, price: form.price.value, fee: form.fee.value, date: form.date.value, note: form.note.value });
      book.txs = [...book.txs.filter((x) => x.id !== t.id), t];
      saveBook(book);
      $("#tx-msg", view).innerHTML = `<p class="ok small">✓ Guardado.</p>`;
      setTimeout(() => { const m = $("#tx-msg", view); if (m) m.innerHTML = ""; }, 2500);
      resetForm();
      refresh();
    } catch (err) { $("#tx-msg", view).innerHTML = errorBox(err); }
  });
  $("#tx-cancel", view).addEventListener("click", resetForm);
  $("#use-now", view).addEventListener("click", async () => {
    try { q = await market.quotes(); } catch { /* */ }
    const p = q[form.asset.value]?.price;
    if (p) { form.price.value = +p.toPrecision(8); updateTotal(); }
  });

  // ---------- direcciones vigiladas ----------
  async function watchedValue(prices) {
    const list = book.watch || [];
    if (!list.length) { $("#w-list", view).innerHTML = `<li class="muted">Ninguna.</li>`; return { total: 0 }; }
    const rows = await Promise.all(list.map(async (w) => {
      try {
        const amt = w.chain === "BTC" ? await btcBalance(w.addr) : await ethBalance(w.addr);
        return { ...w, amt, value: amt * (prices[w.chain] || 0) };
      } catch (err) { return { ...w, error: err.message }; }
    }));
    $("#w-list", view).innerHTML = rows.map((w) => `
      <li><span><b>${esc(w.label || w.chain)}</b> <small class="mono muted">${esc(w.addr.slice(0, 10))}…${esc(w.addr.slice(-6))}</small></span>
        <span class="n">${w.error ? `<small class="err">${esc(w.error)}</small>` : `${w.chain === "BTC" ? btcAmount(Math.round(w.amt * 1e8)) : num(w.amt, 6)} ${w.chain} · <b>${eur(w.value)}</b>`}
        <a class="link" href="#seguir/${encodeURIComponent(w.addr)}">ver</a> <button class="link" data-unwatch="${esc(w.addr)}">quitar</button></span></li>`).join("");
    return { total: rows.reduce((s, w) => s + (w.value || 0), 0) };
  }

  $("#watch-form", view).addEventListener("submit", (e) => {
    e.preventDefault();
    const addr = $("#w-addr", view).value.trim();
    const chain = /^0x[0-9a-fA-F]{40}$/.test(addr) ? "ETH" : /^(bc1[02-9ac-hj-np-z]{11,71}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/.test(addr) ? "BTC" : null;
    if (!chain) { $("#w-msg", view).innerHTML = errorBox("No parece una dirección de Bitcoin (bc1…, 1…, 3…) ni de Ethereum (0x…)."); return; }
    if ((book.watch || []).some((w) => w.addr === addr)) { $("#w-msg", view).innerHTML = errorBox("Ya está en la lista."); return; }
    book.watch = [...(book.watch || []), { addr, chain, label: $("#w-label", view).value.trim() }];
    saveBook(book);
    $("#w-msg", view).innerHTML = "";
    e.target.reset();
    drawSummary();
  });

  // ---------- copia ----------
  $("#exp-json", view).addEventListener("click", () => download(`crypto-lab-copia-${today()}.json`, JSON.stringify(book, null, 2), "application/json"));
  $("#exp-csv", view).addEventListener("click", () => download(`crypto-lab-movimientos-${today()}.csv`, toCSV(book.txs), "text/csv;charset=utf-8"));
  $("#imp-json", view).addEventListener("change", async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    try {
      const imported = fromJSON(await f.text());
      book = imported;
      saveBook(book);
      $("#bk-msg", view).innerHTML = `<p class="ok small">✓ Restaurados ${imported.txs.length} movimientos.</p>`;
      refresh();
    } catch (err) { $("#bk-msg", view).innerHTML = errorBox(err.message || "No se pudo leer el archivo."); }
    e.target.value = "";
  });

  view.addEventListener("click", (e) => {
    const ed = e.target.closest("[data-edit]");
    if (ed) {
      const t = book.txs.find((x) => x.id === ed.dataset.edit);
      if (!t) return;
      form.querySelector(`input[name=type][value=${t.type}]`).checked = true;
      form.asset.value = t.asset; form.date.value = t.date; form.qty.value = t.qty; form.price.value = t.price;
      form.fee.value = t.fee; form.note.value = t.note || ""; form.elements.txid.value = t.id;
      $("#tx-title", view).textContent = "Editar movimiento";
      $("#tx-cancel", view).hidden = false;
      updateTotal();
      form.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    const del = e.target.closest("[data-del]");
    if (del) {
      const t = book.txs.find((x) => x.id === del.dataset.del);
      if (t && del.dataset.confirm !== "1") { del.dataset.confirm = "1"; del.textContent = "¿seguro?"; return; }
      book.txs = book.txs.filter((x) => x.id !== del.dataset.del);
      saveBook(book);
      refresh();
    }
    const un = e.target.closest("[data-unwatch]");
    if (un) { book.watch = book.watch.filter((w) => w.addr !== un.dataset.unwatch); saveBook(book); drawSummary(); }
  });

  function refresh() {
    drawTxs();
    drawSummary();
    drawHistory();
  }
  refresh();
}

async function btcBalance(addr) {
  const r = await fetch(`https://mempool.space/api/address/${addr}`);
  if (!r.ok) throw new Error("no se pudo consultar");
  const a = await r.json();
  return (a.chain_stats.funded_txo_sum - a.chain_stats.spent_txo_sum + a.mempool_stats.funded_txo_sum - a.mempool_stats.spent_txo_sum) / 1e8;
}

async function ethBalance(addr) {
  const r = await fetch(MAINNET_RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [addr, "latest"] }) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return Number(BigInt(j.result)) / 1e18;
}
