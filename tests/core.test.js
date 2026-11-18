import { test } from "node:test";
import assert from "node:assert/strict";
import * as btc from "@scure/btc-signer";
import { HDKey } from "@scure/bip32";

import { fillAsks, computePath, rankPaths, btcNetworkEur, midPrice } from "../src/lib/fees.js";
import { DEFAULT_PROVIDERS } from "../src/lib/providers.js";
import { deriveBtcKey, btcAccount, buildBtcTx, isTestnetAddress, estimateVsize } from "../src/lib/btc.js";
import { ethWallet } from "../src/lib/eth.js";
import { seedFrom, isValidMnemonic, newMnemonic, encryptMnemonic, decryptMnemonic } from "../src/lib/vault.js";

const ABANDON = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";

// ---------- claves (vectores de prueba públicos) ----------
test("BIP84 mainnet vector (comprueba la derivación)", () => {
  const node = HDKey.fromMasterSeed(seedFrom(ABANDON)).derive("m/84'/0'/0'/0/0");
  assert.equal(btc.p2wpkh(node.publicKey).address, "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu");
});

test("dirección de testnet BIP84", () => {
  const k = deriveBtcKey(seedFrom(ABANDON), 0, 0);
  assert.equal(k.address, "tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl");
  assert.ok(isTestnetAddress(k.address));
  assert.ok(!isTestnetAddress("bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu"), "rechaza direcciones reales");
});

test("dirección de Ethereum (vector conocido)", () => {
  assert.equal(ethWallet(ABANDON).address, "0x9858EfFD232B4033E47d90003D41EC34EcaEda94");
});

test("12 palabras nuevas válidas", () => {
  const m = newMnemonic();
  assert.equal(m.split(" ").length, 12);
  assert.ok(isValidMnemonic(m));
  assert.ok(!isValidMnemonic(ABANDON.replace("about", "abandon")));
});

test("cifrado de las palabras", async () => {
  const box = await encryptMnemonic(ABANDON, "contraseña buena", 1000);
  assert.ok(!JSON.stringify(box).includes("abandon"));
  assert.equal(await decryptMnemonic(box, "contraseña buena"), ABANDON);
  await assert.rejects(() => decryptMnemonic(box, "mala"), /incorrecta/);
});

// ---------- transacciones ----------
function wallet() {
  const acc = btcAccount(seedFrom(ABANDON));
  const keys = { [acc.receive.address]: acc.receive, [acc.change.address]: acc.change };
  return { acc, keys };
}

test("transacción con cambio", () => {
  const { acc, keys } = wallet();
  const utxos = [
    { txid: "aa".repeat(32), vout: 0, value: 50_000, address: acc.receive.address },
    { txid: "bb".repeat(32), vout: 1, value: 20_000, address: acc.change.address },
  ];
  const to = deriveBtcKey(seedFrom(ABANDON), 0, 5).address;
  const r = buildBtcTx({ utxos, keys, to, amount: 30_000n, feeRate: 2, changeAddress: acc.change.address });
  assert.equal(r.inputs.length, 1, "con la moneda grande basta");
  assert.equal(r.outputs.length, 2);
  const outSum = r.outputs.reduce((s, o) => s + o.value, 0n);
  assert.equal(outSum + r.fee, 50_000n, "entradas = salidas + comisión");
  assert.ok(r.feeRateReal >= 1.9, `comisión real ${r.feeRateReal} sat/vB`);
  // La transacción firmada se puede volver a leer y tiene firmas
  const parsed = btc.Transaction.fromRaw(Buffer.from(r.hex, "hex"));
  assert.equal(parsed.inputsLength, 1);
  assert.ok(parsed.getInput(0).finalScriptWitness?.length === 2);
  assert.equal(parsed.id, r.txid);
});

test("enviar todo y cambio demasiado pequeño", () => {
  const { acc, keys } = wallet();
  const utxos = [{ txid: "cc".repeat(32), vout: 0, value: 10_000, address: acc.receive.address }];
  const to = deriveBtcKey(seedFrom(ABANDON), 0, 7).address;
  const all = buildBtcTx({ utxos, keys, to, feeRate: 1, changeAddress: acc.change.address, sendAll: true });
  assert.equal(all.outputs.length, 1);
  assert.equal(all.outputs[0].value + all.fee, 10_000n);
  // 9 700 + comisión ~ deja menos de 294 sats de cambio → sin salida de cambio
  const r = buildBtcTx({ utxos, keys, to, amount: 9_700n, feeRate: 1, changeAddress: acc.change.address });
  assert.equal(r.outputs.length, 1);
  assert.equal(r.fee, 300n);
});

test("errores claros", () => {
  const { acc, keys } = wallet();
  const utxos = [{ txid: "dd".repeat(32), vout: 0, value: 1_000, address: acc.receive.address }];
  assert.throws(() => buildBtcTx({ utxos, keys, to: "bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu", amount: 500n, feeRate: 1, changeAddress: acc.change.address }), /red de pruebas/);
  assert.throws(() => buildBtcTx({ utxos, keys, to: acc.receive.address, amount: 5_000n, feeRate: 1, changeAddress: acc.change.address }), /insuficiente/);
  assert.throws(() => buildBtcTx({ utxos, keys, to: acc.receive.address, amount: 100n, feeRate: 1, changeAddress: acc.change.address }), /mínimo/);
});

test("estimación de tamaño", () => {
  assert.equal(estimateVsize(1, 2), 141);
});

// ---------- calculadora ----------
const book = {
  asks: [["100", "1"], ["101", "1"], ["110", "10"]],
  bids: [["99", "1"]],
};

test("recorrer el libro de órdenes", () => {
  const f = fillAsks(book.asks, 150);
  assert.ok(Math.abs(f.qty - (1 + 50 / 101)) < 1e-9);
  assert.equal(f.levels, 2);
  assert.ok(f.filled);
  assert.ok(!fillAsks(book.asks, 1e6).filled);
  assert.equal(midPrice(book), 99.5);
});

test("vía exchange: comisión + deslizamiento + retirada", () => {
  const p = { id: "x", kind: "exchange", tradePct: 0.5, depositPct: 0 };
  const r = computePath({ amountEur: 150, asset: "BTC", price: 99.5, provider: p, book, selfCustody: true, network: { withdrawEur: 1 } });
  const sum = r.steps.reduce((s, x) => s + x.eur, 0);
  assert.ok(Math.abs(sum - r.totalFee) < 1e-9);
  // lo que recibes + comisiones = lo que pones (al precio medio)
  assert.ok(Math.abs(r.valueEur + r.totalFee - 150) < 1e-6, `${r.valueEur} + ${r.totalFee}`);
  assert.equal(r.custody, "self");
  assert.ok(r.steps.some((s) => s.to === "book"));
});

test("vía bróker y DEX; ranking", () => {
  const providers = DEFAULT_PROVIDERS;
  const paths = providers.map((provider) =>
    computePath({ amountEur: 1000, asset: "BTC", price: 100, provider, book: { asks: [["100.05", "1000"]], bids: [["99.95", "1"]] }, selfCustody: false, network: { withdrawEur: 0.5, swapEur: 2 } }));
  assert.equal(paths.find((p, i) => providers[i].id === "uniswap"), null, "Uniswap no vende BTC");
  const ranked = rankPaths(paths);
  assert.ok(ranked[0].totalFee <= ranked.at(-1).totalFee);
  const card = ranked.find((r) => r.provider.id === "card");
  assert.ok(card.pct > 5, "la tarjeta es de lo más caro");
  for (const r of ranked) assert.ok(Math.abs(r.valueEur + r.totalFee - 1000) < 1e-6);
});

test("coste de red", () => {
  assert.ok(Math.abs(btcNetworkEur(10, 50_000) - 0.705) < 1e-9);
});
