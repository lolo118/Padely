// node --test src/utils/permisosBarra.test.js
// La barra (rol "barra", permiso único "pedidos") acepta pedidos con cuentasService.aceptarPedido: una transacción que
// lee el pedido, lee (y crea o actualiza) la cuenta del turno y, si la cuenta no existe, lee la reserva. No hay
// emulador de reglas en el repo: acá se fija el preset del rol y se comprueba, sobre el texto de firestore.rules,
// que cada colección que toca esa transacción tiene la cláusula para 'pedidos' (B-P3-6-1).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ROLES, permisosDeRol, puedeCon } from "./staff.js";

const rules = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
const bloque = (nombre) => {
  const desde = rules.indexOf(`match /${nombre}/{`);
  assert.notEqual(desde, -1, `falta match /${nombre}`);
  const hasta = rules.indexOf("\n      match /", desde + 1);
  return rules.slice(desde, hasta === -1 ? undefined : hasta);
};
const clausula = (texto, allow) => {
  const m = texto.match(new RegExp(`allow ${allow}[^:]*: if ([\\s\\S]*?);`));
  assert.ok(m, `falta allow ${allow}`);
  return m[1];
};

test("el rol barra tiene exactamente el permiso pedidos", () => {
  assert.deepEqual(ROLES.barra.permisos, ["pedidos"]);
  assert.deepEqual(permisosDeRol("barra"), ["pedidos"]);
  assert.equal(ROLES.barra.descuentoMax, 0);
  assert.equal(puedeCon(permisosDeRol("barra"), "pedidos"), true);
  assert.equal(puedeCon(permisosDeRol("barra"), "vender"), false);
  assert.equal(puedeCon(permisosDeRol("barra"), "cobrarTurnos"), false);
  // El cajero también atiende pedidos (la pantalla Barra se la muestra a los dos)
  assert.equal(puedeCon(permisosDeRol("cajero"), "pedidos"), true);
});

test("las reglas dejan a 'pedidos' leer, crear y sumar consumos a la cuenta del turno", () => {
  const cuentas = bloque("cuentas");
  assert.match(clausula(cuentas, "read"), /esStaff\(clubId, 'pedidos'\)/, "aceptar un pedido lee la cuenta (tx.get) antes de crearla o actualizarla");
  assert.match(clausula(cuentas, "create"), /esStaff\(clubId, 'pedidos'\)/);
  const update = clausula(cuentas, "update");
  assert.match(update, /esStaff\(clubId, 'pedidos'\)\s*&&\s*changedOnly\(\['items', 'totales', 'division', 'participantes', 'participantesUids', 'actualizadoEn'\]\)/, "la barra solo suma consumos (y al autor de un pedido como participante)");
  assert.doesNotMatch(update, /esStaff\(clubId, 'pedidos'\)[^|]*'estado', 'cerradaPor'/, "la barra no cierra cuentas");
});

test("las reglas dejan a 'pedidos' leer y atender pedidos, y exigen creadoEn del servidor al crearlos", () => {
  const pedidos = bloque("pedidos");
  assert.match(clausula(pedidos, "read"), /esStaff\(clubId, 'pedidos'\)/);
  assert.match(clausula(pedidos, "update"), /esStaff\(clubId, 'pedidos'\)[\s\S]*'aceptado', 'rechazado'[\s\S]*'listo'[\s\S]*'entregado'/);
  const create = clausula(pedidos, "create");
  assert.match(create, /request\.resource\.data\.creadoEn == request\.time/, "M1: un pedido sin creadoEn no aparece en la Barra");
  assert.match(create, /request\.resource\.data\.actualizadoEn == request\.time/);
});

test("la reserva del turno se lee con cualquier sesión (la crea la cuenta cuando no existe)", () => {
  assert.match(clausula(bloque("reservas"), "read"), /signedIn\(\)/);
});
