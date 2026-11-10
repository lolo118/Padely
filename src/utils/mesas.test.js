// node --test src/utils/mesas.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cuentaOcupaMesa,
  esIdCuentaDeMesa,
  estadoMesa,
  mesaOcupadaPorOtra,
  minutosAbierta,
  nombresEnSerie,
  ocupacionDeMesas,
  ordenarMesas,
  resumenMesas,
  textoTiempo,
  validarMesa,
  zonasDe,
} from "./mesas.js";
import {
  calcularTotalesCuenta,
  cobroTodo,
  cuentaDeMesa,
  esCuentaDeMesa,
  lineasDeVentaParaTodo,
  lugarDeCuenta,
  nuevaLinea,
  saldosDeCuenta,
  textoTurno,
  tieneReserva,
} from "./cuentas.js";

const ts = (ms) => ({ toMillis: () => ms });

test("validarMesa: número solo → 'Mesa N', zona y capacidad opcionales, sin repetir nombre", () => {
  assert.deepEqual(validarMesa({ nombre: " 4 " }), { datos: { nombre: "Mesa 4", zona: null, capacidad: null }, errores: {} });
  assert.deepEqual(validarMesa({ nombre: "Barra  alta", zona: " Patio ", capacidad: "6" }).datos, { nombre: "Barra alta", zona: "Patio", capacidad: 6 });
  assert.ok(validarMesa({ nombre: "" }).errores.nombre);
  assert.ok(validarMesa({ nombre: "Mesa 1", capacidad: "0" }).errores.capacidad);
  assert.ok(validarMesa({ nombre: "Mesa 1", capacidad: "2.5" }).errores.capacidad);
  const otras = [{ id: "m1", nombre: "Mesa 1" }];
  assert.ok(validarMesa({ nombre: "mesa 1" }, { otras }).errores.nombre);
  assert.deepEqual(validarMesa({ nombre: "Mesa 1" }, { otras, exceptoId: "m1" }).errores, {});
});

test("nombresEnSerie saltea las que existen y tiene tope", () => {
  assert.deepEqual(nombresEnSerie(1, 4, { otras: [{ nombre: "Mesa 2" }] }), ["Mesa 1", "Mesa 3", "Mesa 4"]);
  assert.deepEqual(nombresEnSerie(5, 4), []);
  assert.deepEqual(nombresEnSerie(1, 100), []);
  assert.deepEqual(nombresEnSerie(1, 2, { prefijo: "Patio" }), ["Patio 1", "Patio 2"]);
});

test("ordenarMesas por orden y nombre natural; zonasDe sin vacíos", () => {
  const mesas = [{ id: "a", nombre: "Mesa 10" }, { id: "b", nombre: "Mesa 2" }, { id: "c", nombre: "Mesa 1", orden: 1, zona: "Patio" }, { id: "d", nombre: "Mesa 3", zona: "Salón" }];
  assert.deepEqual(ordenarMesas(mesas).map((m) => m.id), ["b", "d", "a", "c"]);
  assert.deepEqual(zonasDe(mesas), ["Patio", "Salón"]);
});

test("ocupación derivada de las cuentas abiertas (la más vieja primero)", () => {
  const cuentas = [
    { id: "x", estado: "abierta", mesaId: "m1", abiertaEn: ts(2000) },
    { id: "y", estado: "abierta", mesaId: "m1", abiertaEn: ts(1000) },
    { id: "z", estado: "abierta", mesaId: null },
    { id: "w", estado: "cerrada", mesaId: "m2" },
  ];
  const oc = ocupacionDeMesas(cuentas);
  assert.deepEqual(estadoMesa({ id: "m1" }, oc), { libre: false, cuenta: cuentas[1], otras: 1 });
  assert.deepEqual(estadoMesa({ id: "m2" }, oc), { libre: true, cuenta: null, otras: 0 });
  assert.deepEqual(resumenMesas([{ id: "m1" }, { id: "m2" }, { id: "m3", activa: false }], oc), { total: 2, libres: 1, ocupadas: 1 });
});

test("candado: una cuenta cerrada o de otra mesa no ocupa; la misma cuenta tampoco", () => {
  assert.equal(cuentaOcupaMesa({ estado: "abierta", mesaId: "m1" }, "m1"), true);
  assert.equal(mesaOcupadaPorOtra("m1", { id: "c1", estado: "cerrada", mesaId: "m1" }, "c2"), false);
  assert.equal(mesaOcupadaPorOtra("m1", { id: "c1", estado: "abierta", mesaId: "m2" }, "c2"), false);
  assert.equal(mesaOcupadaPorOtra("m1", { id: "c1", estado: "abierta", mesaId: "m1" }, "c1"), false);
  assert.equal(mesaOcupadaPorOtra("m1", { id: "c1", estado: "abierta", mesaId: "m1" }, "c2"), true);
  assert.equal(mesaOcupadaPorOtra("m1", null, "c2"), false);
});

test("tiempo abierta", () => {
  assert.equal(minutosAbierta({ abiertaEn: ts(0) }, 125 * 60000), 125);
  assert.equal(minutosAbierta({ abiertaEn: null }, 5), 0);
  assert.equal(textoTiempo(12), "12 min");
  assert.equal(textoTiempo(60), "1 h");
  assert.equal(textoTiempo(125), "2 h 05");
  assert.equal(esIdCuentaDeMesa("mesa_abc"), true);
  assert.equal(esIdCuentaDeMesa("r1"), false);
});

test("cuenta de mesa: sin reserva ni cancha; se cobra solo lo consumido", () => {
  const c = { id: "mesa_1", ...cuentaDeMesa({ id: "m4", nombre: "Mesa 4", zona: "Patio" }, { fecha: "2026-11-10", hora: "21:30" }) };
  assert.equal(esCuentaDeMesa(c), true);
  assert.equal(tieneReserva(c), false);
  assert.equal(c.reservaGrupoId, null);
  assert.equal(c.jugadorUid, null);
  assert.deepEqual(c.participantesUids, []);
  assert.equal(c.participantes[0].nombre, "Mesa 4");
  assert.equal(lugarDeCuenta(c), "Mesa 4 · Patio");
  assert.equal(textoTurno(c), "Mesa 4 · desde 21:30");
  assert.equal(textoTurno({ ...c, nombreJugador: "Gómez" }), "Mesa 4 · desde 21:30 · Gómez");
  const items = [nuevaLinea({ productoId: "p", nombre: "Pizza", precio: 9000, cantidad: 1 }), nuevaLinea({ productoId: "b", nombre: "Birra", precio: 3000, cantidad: 2 })];
  const conItems = { ...c, items };
  assert.deepEqual(calcularTotalesCuenta(conItems), { consumos: 15000, cancha: 0, seña: 0, total: 15000 });
  assert.equal(lineasDeVentaParaTodo(conItems).some((l) => l.tipoLinea !== "consumo"), false);
  const s = saldosDeCuenta(conItems);
  assert.equal(s.pendiente, 15000);
  assert.equal(s.reparto, null);
  assert.equal(cobroTodo(conItems).total, 15000);
});

test("cuenta del turno en una mesa: el texto suma la mesa; sigue teniendo reserva", () => {
  const t = { canchaNombre: "Cancha 1", horaInicio: "20:00", horaFin: "21:00", nombreJugador: "Gómez", mesaId: "m4", mesaNombre: "Mesa 4" };
  assert.equal(textoTurno(t), "Cancha 1 · 20:00–21:00 · Gómez · Mesa 4");
  assert.equal(tieneReserva(t), true);
  assert.equal(lugarDeCuenta(t), "Cancha 1 · 20:00–21:00");
});
