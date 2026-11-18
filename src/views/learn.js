import { mnemonicToEntropy } from "@scure/bip39";
import { HDKey } from "@scure/bip32";
import { sha256 } from "@noble/hashes/sha2.js";
import { ripemd160 } from "@noble/hashes/legacy.js";
import { hex } from "@scure/base";

import { fillAsks, midPrice } from "../lib/fees.js";
import * as market from "../lib/market.js";
import { newMnemonic, seedFrom, wordlist } from "../lib/vault.js";
import { deriveBtcKey } from "../lib/btc.js";
import { ethWallet } from "../lib/eth.js";
import { $, esc, eur, num, pct, errorBox, timeAgo } from "../lib/ui.js";

export function renderLearn(root) {
  root.innerHTML = `
  <section class="intro">
    <h1>Cómo funciona, con datos reales</h1>
    <p class="lede">Cuatro ideas para entender de dónde sale la cripto cuando compras, dónde está cuando la tienes y a dónde va cuando la envías.</p>
  </section>

  <article class="chapter" id="c1">
    <h2><span class="num">1</span>Comprar es comprarle a alguien</h2>
    <p>Un exchange no «fabrica» bitcoins. Tiene un <b>libro de órdenes</b>: una lista de personas y empresas que quieren vender y a qué precio. Cuando compras, te emparejan con los vendedores más baratos, de uno en uno, hasta completar tu cantidad. El exchange cobra una comisión por emparejaros.</p>
    <p>Abajo está el libro real de Binance para BTC/EUR, ahora mismo. Cambia la cantidad y mira qué vendedores te «comes».</p>
    <div class="inline-form">
      <label class="field"><span>Compro</span><input type="number" id="ob-amount" value="5000" min="1" step="100"><b>€</b></label>
      <div class="seg" role="radiogroup">
        <label><input type="radio" name="ob-asset" value="BTC" checked><span>BTC</span></label>
        <label><input type="radio" name="ob-asset" value="ETH"><span>ETH</span></label>
      </div>
    </div>
    <div id="ob"></div>
    <p class="aside">Y después, ¿dónde está tu bitcoin? <b>En la cartera del exchange.</b> En su base de datos pone que una parte es tuya, pero en la blockchain sigue a su nombre. Por eso se dice <i>«not your keys, not your coins»</i>: hasta que no lo retiras a una cartera cuyas claves tienes tú, dependes de que el exchange no quiebre ni te bloquee la cuenta.</p>
  </article>

  <article class="chapter" id="c2">
    <h2><span class="num">2</span>Una cartera son solo números</h2>
    <p>Una cartera no guarda monedas: las monedas están anotadas en la blockchain. Lo que guarda es una <b>clave privada</b>, el número que permite firmar «yo, el dueño de esta dirección, autorizo este pago». Todo sale de 12 palabras, paso a paso:</p>
    <button class="btn" id="gen">Generar 12 palabras de ejemplo</button>
    <div id="derive"></div>
  </article>

  <article class="chapter" id="c3">
    <h2><span class="num">3</span>Enviar es pagar para que te anoten</h2>
    <p>Cuando envías, tu cartera firma la transacción y la manda a la red. Queda en una sala de espera (la <b>mempool</b>) hasta que un minero la mete en un bloque. Los mineros eligen primero las que pagan más por byte, así que <b>la comisión depende de cuánta gente quiere entrar en el siguiente bloque</b>, no de cuánto dinero envías. Mandar 10 € o 10 millones cuesta lo mismo.</p>
    <div id="mempool"></div>
  </article>

  <article class="chapter" id="c4">
    <h2><span class="num">4</span>Bitcoin y Ethereum llevan las cuentas distinto</h2>
    <div class="two-col">
      <div>
        <h3>Bitcoin: billetes (UTXO)</h3>
        <p>Tu saldo es un montón de «billetes» de tamaños distintos que te han enviado. Para pagar 30 con un billete de 50, el billete se gasta entero: 30 van al destinatario, 19,99 vuelven a ti como <b>cambio</b> (a otra dirección tuya) y el 0,01 que falta para llegar a 50 es la comisión del minero.</p>
        <div class="utxo-demo"><span class="note-50">50</span><span class="arrow">→</span><span class="note-30">30 destino</span><span class="note-19">19,99 cambio</span><span class="note-fee">0,01 minero</span></div>
      </div>
      <div>
        <h3>Ethereum: saldo (cuentas)</h3>
        <p>Cada dirección tiene un saldo, como una cuenta bancaria. Enviar resta de una y suma a otra. La comisión (el <b>gas</b>) depende del trabajo que haga la red: una transferencia simple son 21 000 unidades de gas; un intercambio en un DEX, unas 150 000.</p>
        <div class="utxo-demo"><span class="acct">A: 1,00</span><span class="arrow">→</span><span class="acct">A: 0,69</span><span class="acct">B: +0,30</span><span class="note-fee">0,01 gas</span></div>
      </div>
    </div>
    <p>En la pestaña <a href="#cartera">Mi cartera de pruebas</a> puedes hacerlo de verdad, con monedas de prueba que no valen dinero.</p>
  </article>`;

  // ---------- 1. libro de órdenes ----------
  const obAmount = $("#ob-amount", root);
  async function drawBook() {
    const asset = root.querySelector("input[name=ob-asset]:checked").value;
    const el = $("#ob", root);
    try {
      const book = await market.orderBook(asset);
      const amount = +obAmount.value || 0;
      const mid = midPrice(book);
      const fill = fillAsks(book.asks, amount);
      const shown = Math.max(12, Math.min(fill.levels + 2, 40));
      let left = amount;
      const rows = book.asks.slice(0, shown).map(([p, q], i) => {
        const cost = +p * +q;
        const used = Math.max(0, Math.min(cost, left));
        left -= used;
        const share = cost ? used / cost : 0;
        return `<tr class="${share > 0 ? "eaten" : ""}">
          <td class="n">${i + 1}</td><td class="n">${eur(+p)}</td><td class="n">${num(+q, 5)} ${asset}</td>
          <td class="n">${eur(cost)}</td>
          <td><span class="fillbar"><i style="width:${share * 100}%"></i></span></td></tr>`;
      }).join("");
      const extra = amount - fill.qty * mid;
      el.innerHTML = `
        <div class="table-wrap"><table class="book">
          <thead><tr><th>#</th><th>Precio de venta</th><th>Vende</th><th>Valor</th><th>Te lo llevas</th></tr></thead>
          <tbody>${rows}</tbody></table></div>
        <p class="result">Con ${eur(amount)} te llevas <b>${num(fill.qty, 6)} ${asset}</b> de <b>${fill.levels}</b> vendedor${fill.levels === 1 ? "" : "es"} distinto${fill.levels === 1 ? "" : "s"}.
        Precio medio: <b>${eur(fill.avgPrice)}</b>, un ${pct((fill.avgPrice / mid - 1) * 100)} por encima del precio medio de mercado (${eur(mid)}).
        Eso son <b>${eur(extra)}</b> que van a los vendedores, antes incluso de la comisión del exchange.</p>
        ${!fill.filled ? `<p class="warn">El libro descargado no llega para tanta cantidad.</p>` : ""}`;
    } catch (err) {
      el.innerHTML = errorBox(err);
    }
  }
  obAmount.addEventListener("input", drawBook);
  root.querySelectorAll("input[name=ob-asset]").forEach((r) => r.addEventListener("change", drawBook));
  drawBook();

  // ---------- 2. derivación ----------
  $("#gen", root).addEventListener("click", () => {
    const m = newMnemonic();
    const entropy = mnemonicToEntropy(m, wordlist);
    const seed = seedFrom(m);
    const k = deriveBtcKey(seed, 0, 0);
    const h160 = ripemd160(sha256(k.publicKey));
    const master = HDKey.fromMasterSeed(seed);
    const eth = ethWallet(m);
    $("#derive", root).innerHTML = `
      <ol class="steps">
        <li><b>12 palabras</b> elegidas al azar de una lista de 2048. <span class="muted">(Solo de ejemplo: no se guardan.)</span>
          <div class="words">${m.split(" ").map((w, i) => `<span><small>${i + 1}</small>${w}</span>`).join("")}</div></li>
        <li><b>Son un número de 128 bits</b>, escrito en palabras para que sea fácil apuntarlo. Hay 2<sup>128</sup> posibilidades: más que granos de arena en la Tierra, multiplicado por billones. Nadie puede adivinarlo.
          <code>${hex.encode(entropy)}</code></li>
        <li><b>Semilla</b>: se pasa por una función lenta (PBKDF2, 2048 vueltas) y sale un número de 512 bits.
          <code>${hex.encode(seed)}</code></li>
        <li><b>Clave privada</b>: de la semilla se derivan infinitas claves siguiendo un «camino». Esta es la del camino <code class="inline">${k.path}</code> (SegWit, red de pruebas, cuenta 0, dirección 0). <span class="danger">Quien tenga esto puede gastar.</span>
          <code>${hex.encode(k.privateKey)}</code></li>
        <li><b>Clave pública</b>: un punto de la curva elíptica secp256k1, calculado a partir de la privada. Ir hacia delante es fácil; volver atrás, imposible en la práctica.
          <code>${hex.encode(k.publicKey)}</code></li>
        <li><b>Huella</b>: SHA-256 y luego RIPEMD-160 de la clave pública (20 bytes).
          <code>${hex.encode(h160)}</code></li>
        <li><b>Dirección</b>: la huella con un prefijo de red (<code class="inline">tb</code> = pruebas; en la red real es <code class="inline">bc</code>) y una suma de control para que un error al copiarla se detecte. <b>Esto es lo que das para que te paguen.</b>
          <code class="addr">${k.address}</code></li>
        <li><b>Y en Ethereum</b>, con las mismas palabras y otro camino (<code class="inline">m/44'/60'/0'/0/0</code>): los últimos 20 bytes del hash Keccak-256 de la clave pública.
          <code class="addr">${eth.address}</code></li>
      </ol>
      <p class="aside">La huella de la clave maestra es <code class="inline">${master.fingerprint.toString(16).padStart(8, "0")}</code>. Cualquier cartera estándar (Electrum, Sparrow, MetaMask…) daría exactamente las mismas direcciones con estas 12 palabras. Por eso <b>las palabras son la cartera</b>: si las pierdes, pierdes el dinero; si alguien las ve, se lo puede llevar.</p>`;
  });

  // ---------- 3. mempool ----------
  (async () => {
    const el = $("#mempool", root);
    try {
      const [fees, next, blocks, gas, p] = await Promise.all([
        market.btcFees(), market.btcMempoolBlocks(), market.btcRecentBlocks(), market.ethGas().catch(() => null), market.prices(),
      ]);
      const txCost = (rate) => eur((rate * 141 / 1e8) * p.BTC);
      el.innerHTML = `
        <div class="chain">
          ${next.slice(0, 3).reverse().map((b, i, arr) => `
            <div class="block pending">
              <small>${i === arr.length - 1 ? "siguiente bloque" : `en ~${(arr.length - i) * 10} min`}</small>
              <b>~${num(b.medianFee, 1)} sat/vB</b>
              <span>${num(b.nTx, 0)} transacciones</span>
              <span class="muted">${num(b.feeRange[0], 1)}–${num(b.feeRange.at(-1), 1)} sat/vB</span>
            </div>`).join("")}
          <div class="divider" title="Ahora"></div>
          ${blocks.slice(0, 3).map((b) => `
            <div class="block mined">
              <small>bloque ${num(b.height, 0)}</small>
              <b>${num(b.tx_count, 0)} tx</b>
              <span>${timeAgo(b.timestamp)}</span>
              <span class="muted">${b.extras?.pool?.name ? esc(b.extras.pool.name) : ""}</span>
            </div>`).join("")}
        </div>
        <p class="muted small">A la izquierda, los bloques que se están formando en la mempool; a la derecha, los últimos minados. Datos de mempool.space.</p>
        <table class="entries compact">
          <tr><td>Rápido (siguiente bloque)</td><td class="n">${fees.fastestFee} sat/vB</td><td class="n">≈ ${txCost(fees.fastestFee)}</td></tr>
          <tr><td>En media hora</td><td class="n">${fees.halfHourFee} sat/vB</td><td class="n">≈ ${txCost(fees.halfHourFee)}</td></tr>
          <tr><td>Sin prisa</td><td class="n">${fees.economyFee} sat/vB</td><td class="n">≈ ${txCost(fees.economyFee)}</td></tr>
          ${gas ? `<tr><td>Ethereum: transferencia (21 000 gas)</td><td class="n">${num(gas.totalGwei, 3)} gwei</td><td class="n">≈ ${eur(gas.totalGwei * 21000 / 1e9 * p.ETH)}</td></tr>` : ""}
        </table>
        <p class="muted small">Coste de una transacción típica de Bitcoin (141 vB: una entrada y dos salidas) al precio actual.</p>`;
    } catch (err) {
      el.innerHTML = errorBox(err);
    }
  })();
}
