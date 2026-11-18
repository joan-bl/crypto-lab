// "Sigue el dinero": consultar direcciones y transacciones REALES, solo lectura.

import { formatEther } from "ethers";
import { MAINNET_RPC } from "../lib/eth.js";
import * as market from "../lib/market.js";
import { $, esc, eur, num, btcAmount, shortHash, timeAgo, errorBox } from "../lib/ui.js";

const BTC_API = "https://mempool.space/api";
const ETH_API = "https://eth.blockscout.com/api/v2";

const EXAMPLES = [
  { q: "f4184fc596403b9d638783cf57adfe4c75c605f6356fbc91338530e9831e9e16", label: "Primera transferencia de la historia (Satoshi → Hal Finney, 2009)" },
  { q: "a1075db55d416d3ca199f55b6084e2115b9345e16c5cf302fc80e9d5fbf5d48d", label: "Las dos pizzas de 10 000 BTC (2010)" },
  { q: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa", label: "La dirección del bloque génesis" },
  { q: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045", label: "Cartera pública de Vitalik Buterin (Ethereum)" },
];

export function detect(q) {
  q = q.trim();
  if (/^0x[0-9a-fA-F]{40}$/.test(q)) return "eth-address";
  if (/^0x[0-9a-fA-F]{64}$/.test(q)) return "eth-tx";
  if (/^[0-9a-fA-F]{64}$/.test(q)) return "btc-tx";
  if (/^(bc1[02-9ac-hj-np-z]{11,71}|[13][1-9A-HJ-NP-Za-km-z]{25,34})$/.test(q)) return "btc-address";
  return null;
}

async function getJSON(url) {
  const r = await fetch(url);
  if (r.status === 404 || r.status === 400) throw new Error("No encontrado.");
  if (!r.ok) throw new Error(`${new URL(url).host}: ${r.status}`);
  return r.json();
}

export function renderExplorer(root) {
  root.innerHTML = `
  <section class="intro">
    <h1>Sigue el dinero</h1>
    <p class="lede">La blockchain es un libro de cuentas público: cualquiera puede leerlo. Pega una dirección o una transacción <b>real</b> de Bitcoin o Ethereum y mira de dónde viene y a dónde va el dinero. Solo lectura: aquí no se firma nada.</p>
  </section>
  <form class="search" id="xform">
    <input id="xq" placeholder="Dirección (bc1…, 1…, 0x…) o identificador de transacción" spellcheck="false" autocomplete="off">
    <button class="btn">Buscar</button>
  </form>
  <ul class="examples">${EXAMPLES.map((e) => `<li><button class="link" data-q="${e.q}">${esc(e.label)}</button></li>`).join("")}</ul>
  <div id="xout"></div>`;

  const form = $("#xform", root);
  const input = $("#xq", root);
  const out = $("#xout", root);

  async function search(q) {
    q = q.trim();
    const kind = detect(q);
    if (!kind) {
      out.innerHTML = errorBox("No reconozco eso como una dirección o transacción de Bitcoin o Ethereum.");
      return;
    }
    out.innerHTML = `<p class="muted">Consultando…</p>`;
    try {
      const p = await market.prices().catch(() => ({ BTC: 0, ETH: 0 }));
      if (kind === "btc-tx") out.innerHTML = await btcTx(q, p.BTC);
      if (kind === "btc-address") out.innerHTML = await btcAddress(q, p.BTC);
      if (kind === "eth-address") out.innerHTML = await ethAddress(q, p.ETH);
      if (kind === "eth-tx") out.innerHTML = await ethTx(q, p.ETH);
      try { history.replaceState(null, "", `#seguir/${q}`); } catch { /* */ }
    } catch (err) {
      out.innerHTML = errorBox(err);
    }
  }

  form.addEventListener("submit", (e) => { e.preventDefault(); search(input.value); });
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-q]");
    if (b) { e.preventDefault(); input.value = b.dataset.q; search(b.dataset.q); }
  });
  const initial = decodeURIComponent(location.hash.split("/")[1] || "");
  if (initial) { input.value = initial; search(initial); }
}

const btcEur = (sats, price) => price ? ` <small>${eur(sats / 1e8 * price)}</small>` : "";
const SCRIPT_LABEL = { p2pk: "clave pública (formato de 2009)", op_return: "datos (OP_RETURN, no es dinero)", multisig: "multifirma" };
const scriptLabel = (t) => SCRIPT_LABEL[t] || t;
const qlink = (q, text) => `<button class="link mono" data-q="${esc(q)}">${esc(text || shortHash(q, 10))}</button>`;

async function btcTx(txid, price) {
  const tx = await getJSON(`${BTC_API}/tx/${txid}`);
  const tip = tx.status.confirmed ? +(await (await fetch(`${BTC_API}/blocks/tip/height`)).text()) : 0;
  const conf = tx.status.confirmed ? tip - tx.status.block_height + 1 : 0;
  const inSum = tx.vin.reduce((s, v) => s + (v.prevout?.value || 0), 0);
  const outSum = tx.vout.reduce((s, v) => s + v.value, 0);
  const coinbase = tx.vin[0]?.is_coinbase;
  const vsize = Math.ceil(tx.weight / 4);
  return `
    <article class="card">
      <h2>Transacción de Bitcoin</h2>
      <p class="mono small">${esc(tx.txid)}</p>
      <p>${tx.status.confirmed
        ? `Anotada en el bloque <b>${num(tx.status.block_height, 0)}</b> (${new Date(tx.status.block_time * 1000).toLocaleString("es-ES")}). Desde entonces se han añadido ${num(conf - 1, 0)} bloques encima: deshacerla es imposible en la práctica.`
        : "Todavía en la mempool, esperando a que un minero la incluya en un bloque."}</p>
      <div class="flow">
        <div class="side">
          <h3>Entradas <small>(billetes que se gastan)</small></h3>
          ${coinbase ? `<div class="io coinbase"><b>Monedas nuevas</b><small>Recompensa del minero: así es como «nacen» los bitcoins.</small></div>` :
            tx.vin.map((v) => `<div class="io">${v.prevout?.scriptpubkey_address ? qlink(v.prevout.scriptpubkey_address) : "<span class='muted'>(script)</span>"}<b>${btcAmount(v.prevout?.value || 0)} BTC</b>${btcEur(v.prevout?.value || 0, price)}</div>`).join("")}
        </div>
        <div class="arrow-col">→</div>
        <div class="side">
          <h3>Salidas <small>(billetes nuevos)</small></h3>
          ${tx.vout.map((v) => `<div class="io ${v.scriptpubkey_type === "op_return" ? "muted" : ""}">${v.scriptpubkey_address ? qlink(v.scriptpubkey_address) : `<span class="muted">${esc(scriptLabel(v.scriptpubkey_type))}</span>`}<b>${btcAmount(v.value)} BTC</b>${btcEur(v.value, price)}</div>`).join("")}
        </div>
      </div>
      ${coinbase ? "" : `<table class="entries compact">
        <tr><td>Entra</td><td class="n">${btcAmount(inSum)} BTC</td></tr>
        <tr><td>Sale</td><td class="n">${btcAmount(outSum)} BTC</td></tr>
        <tr class="debit"><td>Diferencia = comisión para el minero</td><td class="n">${btcAmount(tx.fee)} BTC${btcEur(tx.fee, price)}</td></tr>
        <tr><td>Tamaño</td><td class="n">${num(vsize, 0)} vB · ${num(tx.fee / vsize, 1)} sat/vB</td></tr>
      </table>
      <p class="muted small">Nadie «cobra» la comisión explícitamente: es lo que sobra entre entradas y salidas, y se lo queda el minero del bloque.</p>`}
      <p class="small"><a href="https://mempool.space/tx/${tx.txid}" target="_blank" rel="noopener">Ver en mempool.space ↗</a></p>
    </article>`;
}

async function btcAddress(addr, price) {
  const [a, txs] = await Promise.all([getJSON(`${BTC_API}/address/${addr}`), getJSON(`${BTC_API}/address/${addr}/txs`)]);
  const c = a.chain_stats;
  const bal = c.funded_txo_sum - c.spent_txo_sum + a.mempool_stats.funded_txo_sum - a.mempool_stats.spent_txo_sum;
  return `
    <article class="card">
      <h2>Dirección de Bitcoin</h2>
      <p class="mono small">${esc(addr)}</p>
      <table class="entries compact">
        <tr><td>Saldo</td><td class="n"><b>${btcAmount(bal)} BTC</b>${btcEur(bal, price)}</td></tr>
        <tr><td>Recibido en total</td><td class="n">${btcAmount(c.funded_txo_sum)} BTC</td></tr>
        <tr><td>Transacciones</td><td class="n">${num(c.tx_count + a.mempool_stats.tx_count, 0)}</td></tr>
      </table>
      <h3>Últimos movimientos</h3>
      <ul class="txlist">${txs.slice(0, 15).map((t) => {
        const got = t.vout.filter((v) => v.scriptpubkey_address === addr).reduce((s, v) => s + v.value, 0);
        const spent = t.vin.filter((v) => v.prevout?.scriptpubkey_address === addr).reduce((s, v) => s + v.prevout.value, 0);
        const delta = got - spent;
        return `<li>${qlink(t.txid)}<span class="${delta >= 0 ? "credit" : "debit"}">${delta >= 0 ? "+" : ""}${btcAmount(delta)} BTC</span><small class="muted">${t.status.confirmed ? timeAgo(t.status.block_time) : "pendiente"}</small></li>`;
      }).join("")}</ul>
      <p class="muted small">Cualquiera puede ver el saldo y el historial de cualquier dirección. Bitcoin es seudónimo, no anónimo: si alguien sabe que una dirección es tuya, lo ve todo.</p>
    </article>`;
}

async function rpc(method, params) {
  const r = await fetch(MAINNET_RPC, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

async function ethAddress(addr, price) {
  const [balHex, info, txs] = await Promise.all([
    rpc("eth_getBalance", [addr, "latest"]),
    getJSON(`${ETH_API}/addresses/${addr}`).catch(() => ({})),
    getJSON(`${ETH_API}/addresses/${addr}/transactions`).catch(() => ({ items: [] })),
  ]);
  const bal = +formatEther(BigInt(balHex));
  return `
    <article class="card">
      <h2>Cuenta de Ethereum ${info.ens_domain_name ? `<small>${esc(info.ens_domain_name)}</small>` : ""}</h2>
      <p class="mono small">${esc(addr)}</p>
      <table class="entries compact">
        <tr><td>Saldo</td><td class="n"><b>${num(bal, 6)} ETH</b> <small>${eur(bal * price)}</small></td></tr>
        ${info.is_contract ? `<tr><td>Tipo</td><td class="n">Tiene código: contrato o «cuenta inteligente»</td></tr>` : ""}
      </table>
      <h3>Últimos movimientos</h3>
      <ul class="txlist">${(txs.items || []).slice(0, 15).map((t) => {
        const out = t.from?.hash?.toLowerCase() === addr.toLowerCase();
        const v = +formatEther(BigInt(t.value || "0"));
        return `<li>${qlink(t.hash)}<span class="${out ? "debit" : "credit"}">${out ? "−" : "+"}${num(v, 6)} ETH</span><small class="muted">${t.method ? esc(t.method) + " · " : ""}${t.timestamp ? timeAgo(Date.parse(t.timestamp) / 1000) : ""}</small></li>`;
      }).join("") || "<li class='muted'>Sin movimientos recientes.</li>"}</ul>
      <p class="muted small">Ethereum funciona por cuentas: un saldo que sube y baja. Datos de Blockscout y PublicNode.</p>
    </article>`;
}

async function ethTx(hash, price) {
  const t = await getJSON(`${ETH_API}/transactions/${hash}`);
  const v = +formatEther(BigInt(t.value || "0"));
  const fee = +formatEther(BigInt(t.fee?.value || "0"));
  return `
    <article class="card">
      <h2>Transacción de Ethereum</h2>
      <p class="mono small">${esc(t.hash)}</p>
      <div class="flow">
        <div class="side"><h3>De</h3><div class="io">${qlink(t.from.hash)}</div></div>
        <div class="arrow-col">→</div>
        <div class="side"><h3>Para</h3><div class="io">${t.to ? qlink(t.to.hash) : "<span class='muted'>(crea un contrato)</span>"}${t.to?.is_contract ? "<small>contrato</small>" : ""}</div></div>
      </div>
      <table class="entries compact">
        <tr><td>Valor enviado</td><td class="n"><b>${num(v, 6)} ETH</b> <small>${eur(v * price)}</small></td></tr>
        <tr class="debit"><td>Gas pagado (${num(+t.gas_used, 0)} unidades)</td><td class="n">${num(fee, 6)} ETH <small>${eur(fee * price)}</small></td></tr>
        ${t.method ? `<tr><td>Función llamada</td><td class="n mono">${esc(t.method)}</td></tr>` : ""}
        <tr><td>Estado</td><td class="n">${t.status === "ok" ? "Confirmada" : esc(t.status || t.result)}</td></tr>
      </table>
      <p class="muted small">Desde 2021, parte del gas (la «base») se quema y desaparece; solo la propina va al validador.</p>
      <p class="small"><a href="https://etherscan.io/tx/${t.hash}" target="_blank" rel="noopener">Ver en Etherscan ↗</a></p>
    </article>`;
}
