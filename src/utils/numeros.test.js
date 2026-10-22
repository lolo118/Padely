// node --test src/utils/numeros.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { parsearNumero } from "./numeros.js";

test("formato argentino con moneda y decimales", () => {
  assert.equal(parsearNumero("$ 1.234,56"), 1234.56);
  assert.equal(parsearNumero("$ 1.250,00"), 1250);
  assert.equal(parsearNumero("$1.250"), 1250);
});

test("un solo punto con tres dígitos es de miles", () => {
  assert.equal(parsearNumero("1.234"), 1234);
  assert.equal(parsearNumero("12.500"), 12500);
});

test("un solo punto con otra cantidad de dígitos es decimal", () => {
  assert.equal(parsearNumero("12.5"), 12.5);
  assert.equal(parsearNumero("12.50"), 12.5);
});

test("coma decimal", () => {
  assert.equal(parsearNumero("1234,5"), 1234.5);
  assert.equal(parsearNumero("0,75"), 0.75);
});

test("formato de EE. UU.", () => {
  assert.equal(parsearNumero("1,234.56"), 1234.56);
  assert.equal(parsearNumero("1,234,567"), 1234567);
});

test("varios puntos de miles", () => {
  assert.equal(parsearNumero("1.234.567"), 1234567);
  assert.equal(parsearNumero("1.234.567,89"), 1234567.89);
});

test("espacios y números", () => {
  assert.equal(parsearNumero(" 1500 "), 1500);
  assert.equal(parsearNumero(1500), 1500);
  assert.equal(parsearNumero(12.75), 12.75);
  assert.equal(parsearNumero("1 500"), 1500);
});

test("vacíos y guiones son null", () => {
  assert.equal(parsearNumero("-"), null);
  assert.equal(parsearNumero(""), null);
  assert.equal(parsearNumero("   "), null);
  assert.equal(parsearNumero(null), null);
  assert.equal(parsearNumero(undefined), null);
  assert.equal(parsearNumero("s/p"), null);
  assert.equal(parsearNumero("consultar"), null);
  assert.equal(parsearNumero(Number.NaN), null);
});

test("negativos", () => {
  assert.equal(parsearNumero("-12"), -12);
  assert.equal(parsearNumero("(1.500,00)"), -1500);
  assert.equal(parsearNumero("$ -250"), -250);
});
