import { computePath, rankPaths, midPrice, RECIPIENTS, btcNetworkEur, ethNetworkEur, ETH_SWAP_GAS, BTC_TX_VBYTES } from "../lib/fees.js";
import { DEFAULT_PROVIDERS, KIND_LABEL, CHECKED } from "../lib/providers.js";
import * as market from "../lib/market.js";
import { $, $$, esc, eur, num, pct, errorBox } from "../lib/ui.js";

const LS = "cryptolab.providers.v1";
const PREFS = "cryptolab.calc.v1";

function loadProviders() {
  try {
    const saved = JSON.parse(localStorage.getItem(LS) || "null");
    if (saved) return DEFAULT_PROVIDERS.map((p) => ({ ...p, ...(saved[p.id] || {}) }));
  } catch { /* sin almacenamiento */ }
  return DEFAULT_PROVIDERS.map((p) => ({ ...p }));
}

function saveProviders(list) {
  const diff = {};
  for (const p of list) {
    const d = DEFAULT_PROVIDERS.find((x) => x.id === p.id);
    const changed = {};
    for (const k of ["depositPct", "tradePct", "spreadPct", "poolPct"]) if (p[k] !== d[k]) changed[k] = p[k];
    if (Object.keys(changed).length) diff[p.id] = changed;
  }
  try { localStorage.setItem(LS, JSON.stringify(diff)); } catch { /* */ }
}

function loadPrefs() {
  try { return { amount: 500, asset: "BTC", self: true, ...JSON.parse(localStorage.getItem(PREFS) || "{}") }; } catch { return { amount: 500, asset: "BTC", self: true }; }
}

export function renderCalculator(root) {
  const prefs = loadPrefs();
  let providers = loadProviders();
  root.innerHTML = `
  <section class="intro">
    <h1>¿Cuánto te cuesta <em>de verdad</em> comprar cripto?</h1>
    <p class="lede">Pon una cantidad y compara todas las vías: exchanges, apps, tarjeta y DEX.
    Cada euro de comisión se anota en el libro con su destinatario: la plataforma, el banco, los vendedores del libro de órdenes o los mineros.</p>
  </section>

  <form class="calc-form" autocomplete="off">
    <label class="field big">
      <span>Pongo</span>
      <input type="number" name="amount" min="1" step="1" value="${prefs.amount}" inputmode="decimal">
      <b>€</b>
    </label>
    <div class="field">
      <span>para comprar</span>
      <div class="seg" role="radiogroup">
        ${["BTC", "ETH"].map((a) => `<label><input type="radio" name="asset" value="${a}" ${prefs.asset === a ? "checked" : ""}><span>${a === "BTC" ? "Bitcoin" : "Ether"}</span></label>`).join("")}
      </div>
    </div>
    <label class="check">
      <input type="checkbox" name="self" ${prefs.self ? "checked" : ""}>
      <span>y sacarla a <b>mi propia cartera</b> <small>(si no, se queda en la plataforma: es suya hasta que la retiras)</small></span>
    </label>
  </form>

  <div class="market-line" id="calc-market">Cargando precios y libro de órdenes…</div>
  <div id="calc-results" class="ledger"></div>

  <section class="legend-box">
    <h3>¿A dónde va cada euro?</h3>
    <ul class="legend">
      ${Object.entries(RECIPIENTS).map(([k, r]) => `<li><i style="background:${r.color}"></i><b>${r.label}.</b> ${LEGEND_TEXT[k]}</li>`).join("")}
    </ul>
  </section>

  <details class="edit-fees">
    <summary>Editar comisiones <small>(valores públicos aproximados, revisados en ${CHECKED})</small></summary>
    <p class="muted">Las comisiones cambian a menudo y dependen de tu país, tu volumen y tu plan. Si las de tu cuenta son otras, cámbialas aquí: se guardan solo en este navegador.</p>
    <div class="table-wrap"><table class="fees-table">
      <thead><tr><th>Plataforma</th><th>Depósito %</th><th>Comisión %</th><th>Margen %</th><th>Fuente</th></tr></thead>
      <tbody>${providers.map((p) => `
        <tr data-id="${p.id}">
          <td>${esc(p.name)}<br><small class="muted">${KIND_LABEL[p.kind]}</small></td>
          <td><input type="number" step="0.01" min="0" data-k="depositPct" value="${p.depositPct ?? 0}" ${p.kind === "dex" ? "disabled" : ""}></td>
          <td><input type="number" step="0.01" min="0" data-k="${p.kind === "dex" ? "poolPct" : "tradePct"}" value="${p.kind === "dex" ? p.poolPct : p.tradePct}"></td>
          <td>${p.kind === "broker" || p.kind === "onramp" ? `<input type="number" step="0.01" min="0" data-k="spreadPct" value="${p.spreadPct ?? 0}">` : `<small class="muted">${p.kind === "exchange" ? "libro real" : "—"}</small>`}</td>
          <td><a href="${p.source}" target="_blank" rel="noopener">oficial ↗</a></td>
        </tr>`).join("")}
      </tbody></table></div>
    <button type="button" class="btn-ghost" id="reset-fees">Volver a los valores por defecto</button>
  </details>`;

  const form = $(".calc-form", root);
  let data = null;

  async function load() {
    const asset = form.asset.value;
    try {
      const [p, book, bf, gas] = await Promise.all([
        market.prices(), market.orderBook(asset), market.btcFees().catch(() => null), market.ethGas().catch(() => null),
      ]);
      data = { p, book, bf, gas, asset };
      draw();
    } catch (err) {
      $("#calc-results", root).innerHTML = errorBox(`No se pudieron cargar los datos de mercado (${err.message}). ¿Hay conexión?`);
    }
  }

  function draw() {
    if (!data || data.asset !== form.asset.value) return load();
    const amount = +form.amount.value;
    const asset = form.asset.value;
    const self = form.self.checked;
    try { localStorage.setItem(PREFS, JSON.stringify({ amount, asset, self })); } catch { /* */ }

    const { p, book, bf, gas } = data;
    const mid = midPrice(book) || p[asset];
    const network = asset === "BTC"
      ? { withdrawEur: bf ? btcNetworkEur(bf.halfHourFee, mid) : 0 }
      : { withdrawEur: gas ? ethNetworkEur(gas.totalGwei, mid) : 0, swapEur: gas ? ethNetworkEur(gas.totalGwei, mid, ETH_SWAP_GAS) : 0 };

    const spreadBook = (+book.asks[0][0] - +book.bids[0][0]) / mid * 100;
    $("#calc-market", root).innerHTML = `
      <span>1 ${asset} = <b>${eur(mid)}</b> <small>(punto medio del libro de ${book.source})</small></span>
      <span>Diferencia entre la mejor oferta de compra y de venta: <b>${eur(+book.asks[0][0] - +book.bids[0][0])}</b> <small>(${spreadBook < 0.01 ? "menos del 0,01 %" : pct(spreadBook)})</small></span>
      <span>Red ${asset === "BTC" ? `Bitcoin: <b>${bf?.halfHourFee ?? "?"} sat/vB</b> → enviar ≈ ${eur(network.withdrawEur)}` : `Ethereum: <b>${gas ? num(gas.totalGwei, 3) : "?"} gwei</b> → enviar ≈ ${eur(network.withdrawEur)}`}</span>`;

    if (!(amount > 0)) {
      $("#calc-results", root).innerHTML = `<p class="muted">Escribe una cantidad.</p>`;
      return;
    }
    const ranked = rankPaths(providers.map((provider) => computePath({ amountEur: amount, asset, price: mid, provider, book, selfCustody: self, network })));
    const max = Math.max(...ranked.map((r) => r.totalFee));
    const unit = asset === "BTC" ? 8 : 6;

    $("#calc-results", root).innerHTML = `
      <div class="ledger-head"><span>#</span><span>Vía</span><span>Te llega</span><span>Pagas en comisiones</span></div>
      ${ranked.map((r, i) => `
      <details class="ledger-row ${i === 0 ? "best" : ""}">
        <summary>
          <span class="rank">${i + 1}</span>
          <span class="who"><b>${esc(r.provider.name)}</b><small>${KIND_LABEL[r.provider.kind]}${r.custody === "self" ? " · en tu cartera" : " · custodiado por la plataforma"}</small></span>
          <span class="get">${num(r.qty, unit)} ${asset}<small>${eur(r.valueEur)}</small></span>
          <span class="cost"><b>${eur(r.totalFee)}</b><small>${pct(r.pct)}</small>
            <span class="bar" style="width:${max ? (r.totalFee / max) * 100 : 0}%">${r.steps.map((s) => `<i style="flex:${s.eur};background:${RECIPIENTS[s.to].color}" title="${esc(s.label)}: ${eur(s.eur)}"></i>`).join("")}</span>
          </span>
        </summary>
        <div class="row-detail">
          <table class="entries">
            <tr><td>Pones</td><td class="n">${eur(amount)}</td><td></td></tr>
            ${r.steps.map((s) => `<tr class="debit"><td><i class="dot" style="background:${RECIPIENTS[s.to].color}"></i>${esc(s.label)}</td><td class="n">−${eur(s.eur)}</td><td class="muted">→ ${RECIPIENTS[s.to].label}</td></tr>`).join("")}
            <tr class="total"><td>Te llega</td><td class="n">${eur(r.valueEur)}</td><td>${num(r.qty, unit)} ${asset}</td></tr>
          </table>
          ${r.provider.spreadNote ? `<p class="muted small">${esc(r.provider.spreadNote)}</p>` : ""}
          ${r.provider.kind === "exchange" ? `<p class="muted small">El spread y el deslizamiento se calculan con el libro de órdenes real de ${book.source}; en los demás exchanges grandes es parecido.</p>` : ""}
          ${r.note ? `<p class="warn small">${esc(r.note)}</p>` : ""}
          <p class="small"><a href="${r.provider.source}" target="_blank" rel="noopener">Comisiones oficiales de ${esc(r.provider.name)} ↗</a></p>
        </div>
      </details>`).join("")}
      <p class="muted small">Comisiones de red calculadas para una transferencia normal (${asset === "BTC" ? `${BTC_TX_VBYTES} vB` : "21 000 de gas"}) con la tarifa actual. Muchos exchanges cobran por retirar algo más que eso.</p>`;
  }

  form.addEventListener("input", () => draw());
  $$(".fees-table input", root).forEach((inp) =>
    inp.addEventListener("change", () => {
      const id = inp.closest("tr").dataset.id;
      const p = providers.find((x) => x.id === id);
      p[inp.dataset.k] = Math.max(0, +inp.value || 0);
      saveProviders(providers);
      draw();
    }));
  $("#reset-fees", root).addEventListener("click", () => {
    try { localStorage.removeItem(LS); } catch { /* */ }
    renderCalculator(root);
  });
  load();
}

const LEGEND_TEXT = {
  bank: "Lo que cuesta meter el dinero: casi nada por transferencia SEPA, bastante con tarjeta.",
  platform: "La comisión que la plataforma cobra por cada compra. Es su negocio principal.",
  spread: "Las apps «sin comisiones» te venden algo más caro que el precio de mercado y se quedan la diferencia. No aparece como comisión, pero la pagas.",
  book: "En un exchange compras a personas o empresas que han puesto órdenes de venta. Cuanto más compras, más caros son los siguientes vendedores del libro.",
  network: "Para mover la cripto a tu cartera hay que pagar a quien añade la transacción a un bloque. Es el único coste que no va a un intermediario.",
  lp: "En un DEX no hay empresa: compras a un fondo común (pool) y una pequeña comisión va a quienes han puesto el dinero de ese fondo.",
};
