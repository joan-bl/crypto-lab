// Bitcoin de pruebas: derivar direcciones desde las 12 palabras y construir/firmar transacciones.
// Solo redes de prueba (testnet4 y signet). Las direcciones empiezan por "tb1".

import * as btc from "@scure/btc-signer";
import { HDKey } from "@scure/bip32";
import { hex } from "@scure/base";

export const NETWORKS = {
  testnet4: { id: "testnet4", label: "Testnet4", api: "https://mempool.space/testnet4/api", explorer: "https://mempool.space/testnet4" },
  signet: { id: "signet", label: "Signet", api: "https://mempool.space/signet/api", explorer: "https://mempool.space/signet" },
};

// m / propósito' / moneda' / cuenta' / cambio / índice
// 84' = SegWit nativo (direcciones tb1q…), 1' = "cualquier testnet"
export const BTC_PATH = "m/84'/1'/0'";
export const DUST = 294n; // por debajo de esto una salida P2WPKH no es estándar

export function deriveBtcKey(seed, chain = 0, index = 0) {
  const root = HDKey.fromMasterSeed(seed);
  const node = root.derive(`${BTC_PATH}/${chain}/${index}`);
  const payment = btc.p2wpkh(node.publicKey, btc.TEST_NETWORK);
  return {
    path: `${BTC_PATH}/${chain}/${index}`,
    privateKey: node.privateKey,
    publicKey: node.publicKey,
    address: payment.address,
    script: payment.script,
  };
}

/** Las dos direcciones que usa la cartera: una para recibir y otra para el "cambio". */
export function btcAccount(seed) {
  return { receive: deriveBtcKey(seed, 0, 0), change: deriveBtcKey(seed, 1, 0) };
}

export function isTestnetAddress(addr) {
  try {
    btc.Address(btc.TEST_NETWORK).decode(addr);
    return true;
  } catch {
    return false;
  }
}

/** vbytes aproximados de una transacción P2WPKH. */
export function estimateVsize(nIn, nOut) {
  return Math.ceil(10.5 + 68 * nIn + 31 * nOut);
}

/**
 * Elige monedas (UTXO), construye y firma la transacción.
 * utxos: [{ txid, vout, value (sats), address }]
 * keys: { [address]: { privateKey, script } }
 * amount: sats a enviar (bigint). sendAll: enviar todo menos la comisión.
 */
export function buildBtcTx({ utxos, keys, to, amount, feeRate, changeAddress, sendAll = false }) {
  if (!isTestnetAddress(to)) throw new Error("La dirección de destino no es válida en la red de pruebas. Revisa que esté bien copiada (las de prueba empiezan por tb1, m, n o 2; las de la red real, por bc1, 1 o 3, no se aceptan).");
  const sorted = [...utxos].sort((a, b) => b.value - a.value);
  const selected = [];
  let total = 0n;
  let fee = 0n;
  let change = 0n;
  let sendAmount = BigInt(amount || 0);

  if (sendAll) {
    selected.push(...sorted);
    total = sorted.reduce((s, u) => s + BigInt(u.value), 0n);
    fee = BigInt(Math.ceil(estimateVsize(selected.length, 1) * feeRate));
    sendAmount = total - fee;
    if (sendAmount < DUST) throw new Error("No hay saldo suficiente para pagar la comisión.");
  } else {
    if (sendAmount < DUST) throw new Error(`El mínimo que se puede enviar son ${DUST} sats.`);
    for (const u of sorted) {
      selected.push(u);
      total += BigInt(u.value);
      fee = BigInt(Math.ceil(estimateVsize(selected.length, 2) * feeRate));
      if (total >= sendAmount + fee) break;
    }
    if (total < sendAmount + fee) throw new Error("Saldo insuficiente para esa cantidad más la comisión.");
    change = total - sendAmount - fee;
    if (change < DUST) {
      // El cambio sería tan pequeño que no compensa: se queda como comisión para el minero
      fee = total - sendAmount;
      change = 0n;
    }
  }

  const tx = new btc.Transaction();
  for (const u of selected) {
    const k = keys[u.address];
    if (!k) throw new Error(`No tengo la clave de ${u.address}`);
    tx.addInput({
      txid: u.txid,
      index: u.vout,
      witnessUtxo: { script: k.script, amount: BigInt(u.value) },
    });
  }
  tx.addOutputAddress(to, sendAmount, btc.TEST_NETWORK);
  if (change > 0n) tx.addOutputAddress(changeAddress, change, btc.TEST_NETWORK);
  for (const u of selected) {
    // cada entrada se firma con la clave de su dirección
    tx.signIdx(keys[u.address].privateKey, selected.indexOf(u));
  }
  tx.finalize();

  return {
    hex: tx.hex,
    txid: tx.id,
    vsize: tx.vsize,
    fee,
    feeRateReal: Number(fee) / tx.vsize,
    inputs: selected.map((u) => ({ txid: u.txid, vout: u.vout, value: BigInt(u.value), address: u.address })),
    outputs: [
      { address: to, value: sendAmount, role: "destino" },
      ...(change > 0n ? [{ address: changeAddress, value: change, role: "cambio" }] : []),
    ],
  };
}

export const toHex = (b) => hex.encode(b);

// ---------- API (mempool.space, Esplora) ----------
async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

export async function fetchUtxos(net, address) {
  const list = await getJSON(`${NETWORKS[net].api}/address/${address}/utxo`);
  return list.map((u) => ({ txid: u.txid, vout: u.vout, value: u.value, address, confirmed: u.status?.confirmed }));
}

export async function fetchAddress(net, address) {
  const a = await getJSON(`${NETWORKS[net].api}/address/${address}`);
  const c = a.chain_stats, m = a.mempool_stats;
  return {
    confirmed: c.funded_txo_sum - c.spent_txo_sum,
    pending: m.funded_txo_sum - m.spent_txo_sum,
    txCount: c.tx_count + m.tx_count,
  };
}

export async function fetchTxs(net, address) {
  return getJSON(`${NETWORKS[net].api}/address/${address}/txs`);
}

export async function fetchFeeRates(net) {
  return getJSON(`${NETWORKS[net].api}/v1/fees/recommended`);
}

export async function broadcast(net, txHex) {
  const r = await fetch(`${NETWORKS[net].api}/tx`, { method: "POST", body: txHex });
  const text = await r.text();
  if (!r.ok) throw new Error(text);
  return text; // txid
}
