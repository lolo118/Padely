// node --test src/utils/caja.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { TOTALES_CERO, aplicarMovimiento, efectivoEsperado, montoConSigno, signoDe, tonoDiferencia } from "./caja.js";

test("signo por tipo", () => {
  assert.equal(signoDe("ingreso"), 1);
  assert.equal(signoDe("venta"), 1);
  assert.equal(signoDe("cobroCuenta"), 1);
  assert.equal(signoDe("seña"), 1);
  assert.equal(signoDe("retiro"), -1);
  assert.equal(signoDe("gasto"), -1);
  assert.equal(signoDe("anulacion"), -1);
  assert.equal(signoDe("otro"), 0);
  assert.equal(signoDe(undefined), 0);
});

test("aplicar movimientos acumula por medio y por tipo (misma aritmética que la Function)", () => {
  let t = aplicarMovimiento(TOTALES_CERO, { tipo: "ingreso", medio: "efectivo", monto: 5000 });
  assert.equal(t.efectivo, 5000);
  assert.equal(t.ingresos, 5000);
  assert.equal(t.movimientos, 1);

  t = aplicarMovimiento(t, { tipo: "retiro", medio: "efectivo", monto: 3000 });
  assert.equal(t.efectivo, 2000);
  assert.equal(t.retiros, 3000);

  t = aplicarMovimiento(t, { tipo: "gasto", medio: "transferencia", monto: 1200 });
  assert.equal(t.efectivo, 2000);
  assert.equal(t.transferencia, -1200);
  assert.equal(t.gastos, 1200);
  assert.equal(t.movimientos, 3);

  // Lo que escribirá P3-3: ventas suman, anulaciones restan, cobros de cuenta solo mueven el medio
  t = aplicarMovimiento(t, { tipo: "venta", medio: "tarjeta", monto: 8000 });
  t = aplicarMovimiento(t, { tipo: "anulacion", medio: "tarjeta", monto: 8000 });
  t = aplicarMovimiento(t, { tipo: "cobroCuenta", medio: "qr", monto: 2500 });
  assert.equal(t.tarjeta, 0);
  assert.equal(t.ventas, 8000);
  assert.equal(t.anulaciones, 8000);
  assert.equal(t.qr, 2500);
  assert.equal(t.movimientos, 6);
});

test("no muta los totales de entrada y tolera totales incompletos", () => {
  const base = { efectivo: 100 };
  const t = aplicarMovimiento(base, { tipo: "ingreso", medio: "efectivo", monto: 50 });
  assert.deepEqual(base, { efectivo: 100 });
  assert.equal(t.efectivo, 150);
  assert.equal(t.qr, 0);
  assert.equal(t.movimientos, 1);
});

test("movimientos inválidos solo cuentan", () => {
  const t1 = aplicarMovimiento(TOTALES_CERO, { tipo: "ingreso", medio: "efectivo", monto: 0 });
  assert.equal(t1.efectivo, 0);
  assert.equal(t1.movimientos, 1);
  const t2 = aplicarMovimiento(TOTALES_CERO, { tipo: "ingreso", medio: "cheque", monto: 100 });
  assert.equal(t2.efectivo, 0);
  assert.equal(t2.ingresos, 100);
  const t3 = aplicarMovimiento(TOTALES_CERO, { tipo: "desconocido", medio: "efectivo", monto: 100 });
  assert.equal(t3.efectivo, 0);
  assert.equal(t3.movimientos, 1);
});

test("efectivo esperado = fondo + efectivo neto", () => {
  assert.equal(efectivoEsperado({ fondoInicial: 10000, totales: { efectivo: 2000 } }), 12000);
  assert.equal(efectivoEsperado({ fondoInicial: 10000, totales: { efectivo: -3000 } }), 7000);
  assert.equal(efectivoEsperado({ fondoInicial: 500 }), 500);
  assert.equal(efectivoEsperado(null), 0);
});

test("tono de la diferencia", () => {
  assert.equal(tonoDiferencia(0), "success");
  assert.equal(tonoDiferencia(50), "warning");
  assert.equal(tonoDiferencia(100), "warning");
  assert.equal(tonoDiferencia(101), "danger");
  assert.equal(tonoDiferencia(-1), "danger");
  assert.equal(tonoDiferencia(-500), "danger");
  assert.equal(tonoDiferencia(null), "success");
});

test("monto con signo", () => {
  assert.equal(montoConSigno({ tipo: "retiro", monto: 500 }), -500);
  assert.equal(montoConSigno({ tipo: "ingreso", monto: 500 }), 500);
  assert.equal(montoConSigno({ tipo: "raro", monto: 500 }), 0);
});
