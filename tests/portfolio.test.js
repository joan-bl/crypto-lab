import { test } from "node:test";
import assert from "node:assert/strict";
import { holdings, valuate, history, normalizeTx, toCSV, fromJSON } from "../src/lib/portfolio.js";
import { due, makeAlert } from "../src/lib/alerts.js";

const tx = (type, asset, qty, price, date, fee = 0) => normalizeTx({ type, asset, qty, price, fee, date });
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("precio medio y ganancia realizada", () => {
  const h = holdings([
    tx("buy", "BTC", 1, 10000, "2024-01-01", 10),
    tx("buy", "BTC", 1, 20000, "2024-02-01", 10),
    tx("sell", "BTC", 1, 30000, "2024-03-01", 20),
  ]).BTC;
  close(h.qty, 1);
  close(h.avg, 15010);              // (10010 + 20010) / 2
  close(h.cost, 15010);
  close(h.realized, 30000 - 20 - 15010);
  // FIFO: se vende la primera compra (10 010 €)
  close(h.realizedFifo, 30000 - 20 - 10010);
  close(h.invested, 30020);
});

test("vender más de lo que tienes avisa y no deja saldo negativo", () => {
  const h = holdings([tx("buy", "ETH", 1, 1000, "2024-01-01"), tx("sell", "ETH", 2, 1500, "2024-01-02")]).ETH;
  assert.equal(h.qty, 0);
  assert.equal(h.warnings.length, 1);
});

test("el orden de entrada no importa: se ordena por fecha", () => {
  const a = holdings([tx("sell", "BTC", 1, 3, "2024-03-01"), tx("buy", "BTC", 2, 1, "2024-01-01")]).BTC;
  close(a.qty, 1);
  close(a.realized, 2);
});

test("valoración con precios actuales", () => {
  const v = valuate(holdings([tx("buy", "BTC", 0.5, 40000, "2024-01-01"), tx("buy", "ETH", 2, 1000, "2024-01-01")]), { BTC: 60000, ETH: 1500 });
  close(v.total, 33000);
  close(v.cost, 22000);
  close(v.unrealized, 11000);
  close(v.pct, 50);
  assert.equal(v.rows[0].asset, "BTC");
  close(v.rows[0].share, 30000 / 33000);
});

test("evolución diaria", () => {
  const d = (s) => Date.parse(s + "T00:00:00Z");
  const closes = { BTC: [{ t: d("2024-01-01"), v: 100 }, { t: d("2024-01-02"), v: 110 }, { t: d("2024-01-03"), v: 90 }] };
  const h = history([tx("buy", "BTC", 2, 100, "2024-01-02"), tx("sell", "BTC", 1, 95, "2024-01-03")], closes);
  assert.deepEqual(h.map((p) => p.value), [220, 90]);
  assert.deepEqual(h.map((p) => p.invested), [200, 105]);
});

test("copia de seguridad", () => {
  const txs = [tx("buy", "BTC", 0.1, 50000.5, "2024-01-01")];
  const csv = toCSV(txs);
  assert.ok(csv.includes("2024-01-01;compra;BTC;0,1;50000,5;0;"));
  const back = fromJSON(JSON.stringify({ txs, watch: [] }));
  assert.equal(back.txs[0].qty, 0.1);
  assert.throws(() => fromJSON('{"hola":1}'), /copia/);
});

test("validaciones", () => {
  assert.throws(() => normalizeTx({ type: "buy", asset: "BTC", qty: 0, price: 1, date: "2024-01-01" }), /cantidad/);
  assert.throws(() => normalizeTx({ type: "buy", asset: "BTC", qty: 1, price: 1, date: "ayer" }), /Fecha/);
});

test("alertas", () => {
  const up = makeAlert("BTC", "above", 60000);
  const down = makeAlert("ETH", "below", 1500);
  assert.deepEqual(due([up, down], { BTC: 59000, ETH: 1600 }), []);
  assert.deepEqual(due([up, down], { BTC: 60000, ETH: 1400 }).map((a) => a.asset), ["BTC", "ETH"]);
  assert.deepEqual(due([{ ...up, triggeredAt: 1 }], { BTC: 70000 }), []);
  assert.throws(() => makeAlert("BTC", "above", 0), /precio/);
});
