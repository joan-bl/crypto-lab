// Cartera de pruebas: Bitcoin (testnet4 / signet) y Ethereum (Sepolia).
// Las monedas de prueba no valen dinero. Sirven para aprender a recibir, firmar y enviar.

import qrcode from "qrcode-generator";
import { formatEther, parseEther } from "ethers";

import { newMnemonic, isValidMnemonic, seedFrom, normalize, encryptMnemonic, decryptMnemonic, loadBox, saveBox, deleteBox } from "../lib/vault.js";
import { NETWORKS, btcAccount, buildBtcTx, fetchUtxos, fetchAddress, fetchTxs, fetchFeeRates, broadcast } from "../lib/btc.js";
import { SEPOLIA, ethWallet, ethBalance, prepareEthTransfer, sendEth, ethHistory } from "../lib/eth.js";
import { $, esc, num, btcAmount, shortHash, copyButton, timeAgo, errorBox } from "../lib/ui.js";

const PREFS = "cryptolab.wallet.prefs";
let session = null; // { mnemonic, btc, eth } solo en memoria

const FAUCETS = {
  testnet4: [
    ["mempool.space", "https://mempool.space/testnet4/faucet"],
    ["coinfaucet.eu", "https://coinfaucet.eu/en/btc-testnet4/"],
  ],
  signet: [
    ["signetfaucet.com", "https://signetfaucet.com/"],
    ["alt.signetfaucet.com", "https://alt.signetfaucet.com/"],
  ],
  sepolia: [
    ["Google Cloud", "https://cloud.google.com/application/web3/faucet/ethereum/sepolia"],
    ["PoW faucet (minando en el navegador)", "https://sepolia-faucet.pk910.de/"],
    ["Alchemy", "https://www.alchemy.com/faucets/ethereum-sepolia"],
  ],
};

function prefs() {
  try { return { net: "testnet4", ...JSON.parse(localStorage.getItem(PREFS) || "{}") }; } catch { return { net: "testnet4" }; }
}
function setPref(k, v) {
  try { localStorage.setItem(PREFS, JSON.stringify({ ...prefs(), [k]: v })); } catch { /* */ }
}

function qr(text) {
  const q = qrcode(0, "M");
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
}

function openSession(mnemonic) {
  const seed = seedFrom(mnemonic);
  session = { mnemonic, btc: btcAccount(seed), eth: ethWallet(mnemonic) };
}

export function renderWallet(root) {
  const box = loadBox();
  if (session) return drawWallet(root);
  if (box) return drawUnlock(root, box);
  return drawOnboarding(root);
}

const BANNER = `<div class="banner">🧪 <b>Solo redes de prueba.</b> Estas monedas no valen dinero y la app no puede tocar la red real. No uses estas 12 palabras para guardar dinero de verdad.</div>`;

// ---------- crear / importar ----------
function drawOnboarding(root) {
  root.innerHTML = `
  <section class="intro">
    <h1>Mi cartera de pruebas</h1>
    <p class="lede">Tu propia cartera de Bitcoin y Ethereum, sin exchange ni intermediarios: las claves se generan y se quedan en este navegador. Funciona con monedas de prueba gratuitas, así que puedes equivocarte sin perder nada.</p>
  </section>
  ${BANNER}
  <div class="two-col">
    <div class="card">
      <h2>Crear una cartera nueva</h2>
      <p>Se generan 12 palabras al azar. De ellas salen tus claves.</p>
      <button class="btn" id="create">Crear</button>
    </div>
    <div class="card">
      <h2>Importar 12 palabras</h2>
      <p>Si ya tenías una cartera de pruebas de Crypto Lab o de otra app.</p>
      <button class="btn-ghost" id="import">Importar</button>
    </div>
  </div>
  <div id="flow"></div>`;
  $("#create", root).onclick = () => createFlow(root);
  $("#import", root).onclick = () => importFlow(root);
}

function passwordForm(id) {
  return `
    <label class="field col"><span>Contraseña para cifrar las palabras en este navegador</span><input type="password" id="${id}1" minlength="8" autocomplete="new-password"></label>
    <label class="field col"><span>Repite la contraseña</span><input type="password" id="${id}2" autocomplete="new-password"></label>`;
}

function readPassword(root, id) {
  const a = $(`#${id}1`, root).value, b = $(`#${id}2`, root).value;
  if (a.length < 8) throw new Error("La contraseña tiene que tener al menos 8 caracteres.");
  if (a !== b) throw new Error("Las contraseñas no coinciden.");
  return a;
}

async function finishSetup(root, mnemonic, password, msgEl) {
  msgEl.innerHTML = `<p class="muted">Cifrando…</p>`;
  const box = await encryptMnemonic(mnemonic, password);
  saveBox(box);
  openSession(normalize(mnemonic));
  drawWallet(root);
}

function createFlow(root) {
  const m = newMnemonic();
  $("#flow", root).innerHTML = `
  <div class="card">
    <h2>Tus 12 palabras</h2>
    <p>Apúntalas en papel, en orden. Son la cartera: con ellas se recupera en cualquier app. Nadie más debería verlas.</p>
    <div class="words big">${m.split(" ").map((w, i) => `<span><small>${i + 1}</small>${w}</span>`).join("")}</div>
    <label class="check"><input type="checkbox" id="saved"><span>Las he apuntado (o entiendo que, si las pierdo, pierdo las monedas de prueba)</span></label>
    ${passwordForm("np")}
    <button class="btn" id="go">Guardar cartera</button>
    <div id="msg"></div>
  </div>`;
  $("#go", root).onclick = async () => {
    const msg = $("#msg", root);
    try {
      if (!$("#saved", root).checked) throw new Error("Marca la casilla cuando hayas apuntado las palabras.");
      await finishSetup(root, m, readPassword(root, "np"), msg);
    } catch (err) { msg.innerHTML = errorBox(err); }
  };
}

function importFlow(root) {
  $("#flow", root).innerHTML = `
  <div class="card">
    <h2>Importar</h2>
    <label class="field col"><span>Las 12 (o 24) palabras, separadas por espacios</span><textarea id="words" rows="3" spellcheck="false" autocomplete="off"></textarea></label>
    ${passwordForm("ip")}
    <button class="btn" id="go">Importar</button>
    <div id="msg"></div>
  </div>`;
  $("#go", root).onclick = async () => {
    const msg = $("#msg", root);
    try {
      const words = normalize($("#words", root).value);
      if (!isValidMnemonic(words)) throw new Error("Esas palabras no son válidas (alguna palabra está mal escrita o la suma de control no cuadra).");
      await finishSetup(root, words, readPassword(root, "ip"), msg);
    } catch (err) { msg.innerHTML = errorBox(err); }
  };
}

// ---------- desbloquear ----------
function drawUnlock(root, box) {
  root.innerHTML = `
  <section class="intro"><h1>Mi cartera de pruebas</h1></section>
  ${BANNER}
  <form class="card narrow" id="unlock">
    <h2>Desbloquear</h2>
    <label class="field col"><span>Contraseña</span><input type="password" id="pw" autocomplete="current-password" autofocus></label>
    <button class="btn">Abrir</button>
    <div id="msg"></div>
    <details class="small"><summary>He olvidado la contraseña</summary>
      <p>Sin la contraseña no se pueden descifrar las palabras guardadas. Si las tienes apuntadas, borra la cartera de este navegador e impórtalas de nuevo.</p>
      <div class="inline-form"><input id="wipe-confirm" placeholder="Escribe BORRAR" autocomplete="off">
      <button type="button" class="btn-danger" id="wipe">Borrar la cartera de este navegador</button></div>
    </details>
  </form>`;
  $("#unlock", root).onsubmit = async (e) => {
    e.preventDefault();
    const msg = $("#msg", root);
    msg.innerHTML = `<p class="muted">Descifrando…</p>`;
    try {
      openSession(await decryptMnemonic(box, $("#pw", root).value));
      drawWallet(root);
    } catch (err) { msg.innerHTML = errorBox(err); }
  };
  $("#wipe", root).onclick = () => {
    const c = $("#wipe-confirm", root);
    if (c.value.trim() !== "BORRAR") {
      c.focus();
      $("#msg", root).innerHTML = errorBox("Escribe BORRAR en la casilla para confirmar.");
      return;
    }
    deleteBox();
    renderWallet(root);
  };
}

// ---------- cartera abierta ----------
function drawWallet(root) {
  const p = prefs();
  const { btc, eth } = session;
  root.innerHTML = `
  <section class="intro row">
    <h1>Mi cartera de pruebas</h1>
    <div class="actions">
      <button class="btn-ghost" id="show-words">Ver mis 12 palabras</button>
      <button class="btn-ghost" id="lock">Bloquear</button>
    </div>
  </section>
  <div id="words-box" class="card" hidden></div>
  ${BANNER}
  <div class="two-col wallet">
    <section class="card coin" id="btc-card">
      <header>
        <h2>Bitcoin <small>de pruebas</small></h2>
        <select id="btc-net">${Object.values(NETWORKS).map((n) => `<option value="${n.id}" ${p.net === n.id ? "selected" : ""}>${n.label}</option>`).join("")}</select>
      </header>
      <div class="receive">
        <div class="qr">${qr(btc.receive.address)}</div>
        <div>
          <small class="muted">Tu dirección para recibir</small>
          <p class="mono addr">${btc.receive.address}</p>
          ${copyButton(btc.receive.address, "Copiar dirección")}
          <p class="small muted">Pide monedas gratis en: <span id="btc-faucets"></span></p>
        </div>
      </div>
      <div class="balance" id="btc-bal">…</div>
      <details class="send"><summary>Enviar</summary>
        <form id="btc-send" autocomplete="off">
          <label class="field col"><span>Dirección de destino (tb1…)</span><input id="btc-to" spellcheck="false" required></label>
          <div class="inline-form">
            <label class="field"><span>Cantidad</span><input id="btc-amt" type="number" step="0.00000001" min="0"><b>BTC</b></label>
            <label class="check"><input type="checkbox" id="btc-all"><span>Todo</span></label>
          </div>
          <label class="field"><span>Comisión</span><select id="btc-fee"></select></label>
          <button class="btn">Revisar</button>
        </form>
        <div id="btc-review"></div>
      </details>
      <details><summary>Mis «billetes» (UTXO)</summary><div id="btc-utxos"></div></details>
      <h3>Movimientos</h3>
      <ul class="txlist" id="btc-hist"><li class="muted">…</li></ul>
    </section>

    <section class="card coin" id="eth-card">
      <header><h2>Ether <small>de pruebas · ${SEPOLIA.label}</small></h2></header>
      <div class="receive">
        <div class="qr">${qr(eth.address)}</div>
        <div>
          <small class="muted">Tu dirección</small>
          <p class="mono addr">${eth.address}</p>
          ${copyButton(eth.address, "Copiar dirección")}
          <p class="small muted">Pide ETH de prueba en: ${FAUCETS.sepolia.map(([n, u]) => `<a href="${u}" target="_blank" rel="noopener">${n}</a>`).join(" · ")}</p>
        </div>
      </div>
      <div class="balance" id="eth-bal">…</div>
      <details class="send"><summary>Enviar</summary>
        <form id="eth-send" autocomplete="off">
          <label class="field col"><span>Dirección de destino (0x…)</span><input id="eth-to" spellcheck="false" required></label>
          <label class="field"><span>Cantidad</span><input id="eth-amt" type="number" step="0.000001" min="0" required><b>ETH</b></label>
          <button class="btn">Revisar</button>
        </form>
        <div id="eth-review"></div>
      </details>
      <h3>Movimientos</h3>
      <ul class="txlist" id="eth-hist"><li class="muted">…</li></ul>
      <p class="small muted">Esta dirección también existe en la red real de Ethereum (es la misma en todas las redes). No envíes ETH de verdad a ella.</p>
    </section>
  </div>`;

  $("#lock", root).onclick = () => { session = null; renderWallet(root); };
  $("#show-words", root).onclick = () => {
    const box = $("#words-box", root);
    box.hidden = !box.hidden;
    box.innerHTML = `<form class="inline-form" id="words-form">
        <label class="field"><span>Por seguridad, tu contraseña</span><input type="password" id="words-pw" autocomplete="current-password"></label>
        <button class="btn-ghost">Mostrar</button></form><div id="words-out"></div>`;
    $("#words-form", root).onsubmit = async (e) => {
      e.preventDefault();
      const outEl = $("#words-out", root);
      try {
        const m = await decryptMnemonic(loadBox(), $("#words-pw", root).value);
        outEl.innerHTML = `<div class="words">${m.split(" ").map((w, i) => `<span><small>${i + 1}</small>${w}</span>`).join("")}</div><p class="small muted">No las compartas con nadie.</p>`;
      } catch (err) { outEl.innerHTML = errorBox(err); }
    };
  };
  $("#btc-net", root).onchange = (e) => { setPref("net", e.target.value); refreshBtc(root); };
  setupBtcSend(root);
  setupEthSend(root);
  refreshBtc(root);
  refreshEth(root);
}

// ---------- Bitcoin ----------
let btcState = { utxos: [] };

async function refreshBtc(root) {
  const net = prefs().net;
  const { btc } = session;
  $("#btc-faucets", root).innerHTML = FAUCETS[net].map(([n, u]) => `<a href="${u}" target="_blank" rel="noopener">${n}</a>`).join(" · ");
  const bal = $("#btc-bal", root);
  bal.innerHTML = `<span class="muted">Consultando ${NETWORKS[net].label}…</span>`;
  try {
    const addrs = [btc.receive.address, btc.change.address];
    const [infos, utxoLists, txLists, rates] = await Promise.all([
      Promise.all(addrs.map((a) => fetchAddress(net, a))),
      Promise.all(addrs.map((a) => fetchUtxos(net, a))),
      Promise.all(addrs.map((a) => fetchTxs(net, a))),
      fetchFeeRates(net).catch(() => null),
    ]);
    const confirmed = infos.reduce((s, i) => s + i.confirmed, 0);
    const pending = infos.reduce((s, i) => s + i.pending, 0);
    btcState = { utxos: utxoLists.flat(), net };
    bal.innerHTML = `<b>${btcAmount(confirmed)}</b> <span>tBTC</span>${pending ? `<small>${pending > 0 ? "+" : ""}${btcAmount(pending)} pendiente de confirmar</small>` : ""}`;

    const sel = $("#btc-fee", root);
    const r = rates || { fastestFee: 2, halfHourFee: 1, economyFee: 1 };
    sel.innerHTML = [["Rápida", r.fastestFee], ["Normal", r.halfHourFee], ["Lenta", r.economyFee]]
      .map(([l, v]) => `<option value="${Math.max(1, v)}">${l}: ${Math.max(1, v)} sat/vB</option>`).join("");

    $("#btc-utxos", root).innerHTML = btcState.utxos.length
      ? `<p class="small muted">Tu saldo no es un número: son estos «billetes» que te han enviado. Al pagar se gastan enteros y te vuelve el cambio.</p>
         <table class="entries compact">${btcState.utxos.map((u) => `<tr><td class="mono">${shortHash(u.txid)}:${u.vout}</td><td>${u.address === btc.change.address ? "cambio" : "recibido"}</td><td class="n">${btcAmount(u.value)}</td><td>${u.confirmed ? "" : "<small class='muted'>sin confirmar</small>"}</td></tr>`).join("")}</table>`
      : `<p class="muted small">Aún no tienes ningún billete. Pide monedas en un faucet.</p>`;

    const seen = new Map();
    for (const t of txLists.flat()) seen.set(t.txid, t);
    const txs = [...seen.values()].sort((a, b) => (b.status.block_time || 9e9) - (a.status.block_time || 9e9));
    $("#btc-hist", root).innerHTML = txs.slice(0, 20).map((t) => {
      const mine = (a) => addrs.includes(a);
      const got = t.vout.filter((v) => mine(v.scriptpubkey_address)).reduce((s, v) => s + v.value, 0);
      const spent = t.vin.filter((v) => mine(v.prevout?.scriptpubkey_address)).reduce((s, v) => s + v.prevout.value, 0);
      const d = got - spent;
      return `<li><a class="mono" href="${NETWORKS[net].explorer}/tx/${t.txid}" target="_blank" rel="noopener">${shortHash(t.txid)}</a><span class="${d >= 0 ? "credit" : "debit"}">${d >= 0 ? "+" : ""}${btcAmount(d)}</span><small class="muted">${t.status.confirmed ? timeAgo(t.status.block_time) : "en la mempool"}</small></li>`;
    }).join("") || `<li class="muted">Sin movimientos todavía.</li>`;
  } catch (err) {
    bal.innerHTML = errorBox(`No se pudo consultar la red (${err.message}).`);
  }
}

function setupBtcSend(root) {
  const all = $("#btc-all", root);
  all.onchange = () => { $("#btc-amt", root).disabled = all.checked; };
  $("#btc-send", root).onsubmit = (e) => {
    e.preventDefault();
    const out = $("#btc-review", root);
    const { btc } = session;
    try {
      const sendAll = all.checked;
      const amount = sendAll ? 0n : BigInt(Math.round(+$("#btc-amt", root).value * 1e8));
      const keys = { [btc.receive.address]: btc.receive, [btc.change.address]: btc.change };
      const tx = buildBtcTx({
        utxos: btcState.utxos, keys, to: $("#btc-to", root).value.trim(), amount,
        feeRate: +$("#btc-fee", root).value, changeAddress: btc.change.address, sendAll,
      });
      out.innerHTML = `
        <div class="review">
          <h4>Así queda tu transacción (aún sin enviar)</h4>
          <div class="flow">
            <div class="side"><h5>Gastas estos billetes</h5>${tx.inputs.map((i) => `<div class="io"><span class="mono">${shortHash(i.txid)}:${i.vout}</span><b>${btcAmount(i.value)}</b></div>`).join("")}</div>
            <div class="arrow-col">→</div>
            <div class="side"><h5>Y se crean estos</h5>${tx.outputs.map((o) => `<div class="io"><span class="mono">${shortHash(o.address, 10)}</span><b>${btcAmount(o.value)}</b><small>${o.role === "cambio" ? "vuelve a ti (cambio)" : "para el destinatario"}</small></div>`).join("")}
              <div class="io fee"><span>Para el minero</span><b>${btcAmount(tx.fee)}</b><small>${tx.vsize} vB × ${num(tx.feeRateReal, 2)} sat/vB</small></div></div>
          </div>
          <details class="small"><summary>Ver la transacción firmada en bruto</summary><code class="raw">${tx.hex}</code><p class="muted">Esto es lo que se manda a la red: entradas, salidas y tus firmas. Cualquier nodo puede comprobar que las firmas son válidas sin conocer tu clave privada.</p></details>
          <button class="btn" id="btc-go">Firmar y enviar</button>
          <div id="btc-result"></div>
        </div>`;
      $("#btc-go", root).onclick = async () => {
        const res = $("#btc-result", root);
        const net = btcState.net;
        res.innerHTML = `<p class="muted">Enviando a la red…</p>`;
        try {
          const txid = await broadcast(net, tx.hex);
          res.innerHTML = `<p class="ok">✓ Enviada. Ahora está en la mempool esperando a un minero. <a href="${NETWORKS[net].explorer}/tx/${txid}" target="_blank" rel="noopener">Seguirla ↗</a></p>`;
          setTimeout(() => refreshBtc(root), 2500);
        } catch (err) { res.innerHTML = errorBox(`La red la ha rechazado: ${err.message}`); }
      };
    } catch (err) {
      out.innerHTML = errorBox(err);
    }
  };
}

// ---------- Ethereum ----------
async function refreshEth(root) {
  const { eth } = session;
  const bal = $("#eth-bal", root);
  try {
    const [b, hist] = await Promise.all([ethBalance(eth.address), ethHistory(eth.address).catch(() => null)]);
    bal.innerHTML = `<b>${num(+formatEther(b), 6)}</b> <span>SepoliaETH</span>`;
    $("#eth-hist", root).innerHTML = hist === null
      ? `<li class="muted">No se pudo cargar el historial.</li>`
      : hist.slice(0, 20).map((t) => {
        const out = t.from?.hash?.toLowerCase() === eth.address.toLowerCase();
        const v = +formatEther(BigInt(t.value || "0"));
        return `<li><a class="mono" href="${SEPOLIA.explorer}/tx/${t.hash}" target="_blank" rel="noopener">${shortHash(t.hash)}</a><span class="${out ? "debit" : "credit"}">${out ? "−" : "+"}${num(v, 6)}</span><small class="muted">${t.timestamp ? timeAgo(Date.parse(t.timestamp) / 1000) : "pendiente"}</small></li>`;
      }).join("") || `<li class="muted">Sin movimientos todavía.</li>`;
  } catch (err) {
    bal.innerHTML = errorBox(`No se pudo consultar Sepolia (${err.message}).`);
  }
}

function setupEthSend(root) {
  $("#eth-send", root).onsubmit = async (e) => {
    e.preventDefault();
    const out = $("#eth-review", root);
    out.innerHTML = `<p class="muted">Preparando…</p>`;
    try {
      const amount = $("#eth-amt", root).value;
      parseEther(amount || "0");
      const prep = await prepareEthTransfer(session.eth, $("#eth-to", root).value.trim(), amount);
      out.innerHTML = `
        <div class="review">
          <h4>Así queda tu transacción (aún sin enviar)</h4>
          <table class="entries compact">
            <tr><td>Saldo actual</td><td class="n">${num(+formatEther(prep.balance), 6)}</td></tr>
            <tr class="debit"><td>Envías a ${shortHash(prep.tx.to, 6)}</td><td class="n">−${num(+formatEther(prep.tx.value), 6)}</td></tr>
            <tr class="debit"><td>Gas máximo (21 000 × ${num(Number(prep.tx.maxFeePerGas) / 1e9, 3)} gwei)</td><td class="n">−${num(+formatEther(prep.maxCost), 8)}</td></tr>
            <tr><td>Número de orden (nonce)</td><td class="n">${prep.tx.nonce}</td></tr>
          </table>
          <p class="small muted">El gas real suele ser menor que el máximo; lo que no se usa no se cobra. El «nonce» numera tus transacciones para que nadie pueda repetir una ya enviada.</p>
          <button class="btn" id="eth-go">Firmar y enviar</button>
          <div id="eth-result"></div>
        </div>`;
      $("#eth-go", root).onclick = async () => {
        const res = $("#eth-result", root);
        res.innerHTML = `<p class="muted">Firmando y enviando…</p>`;
        try {
          const hash = await sendEth(session.eth, prep);
          res.innerHTML = `<p class="ok">✓ Enviada. En unos 12 segundos un validador la incluirá en un bloque. <a href="${SEPOLIA.explorer}/tx/${hash}" target="_blank" rel="noopener">Seguirla ↗</a></p>`;
          setTimeout(() => refreshEth(root), 15000);
        } catch (err) { res.innerHTML = errorBox(err.shortMessage || err.message); }
      };
    } catch (err) {
      out.innerHTML = errorBox(err.shortMessage || err.message);
    }
  };
}

