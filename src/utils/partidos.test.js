// node --test src/utils/partidos.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { conJugador, indicePublico, inicioMs, lugaresLibres, normalizarPartido, partidoVigente, puedeSumarse, sinJugador } from "./partidos.js";

const H = 3600000;
const reserva = (extra = {}) => ({ status: "confirmada", jugadorUid: "titular", fecha: "2026-10-28", horaInicio: "21:00", horaFin: "22:00", canchaName: "Cancha 1", partidoAbierto: { faltan: 2, nivel: "6ta", nota: "Tranqui", jugadores: [] }, ...extra });
const antes = inicioMs("2026-10-28", "21:00") - 5 * H;

test("normalizar: faltan 1 a 3, nivel conocido, nota corta", () => {
  assert.deepEqual(normalizarPartido({ faltan: 2, nivel: "6ta", nota: " hola " }), { faltan: 2, nivel: "6ta", nota: "hola" });
  assert.ok(normalizarPartido({ faltan: 0 }).error);
  assert.ok(normalizarPartido({ faltan: 4 }).error);
  assert.equal(normalizarPartido({ faltan: 1, nivel: "inventado" }).nivel, null);
  assert.equal(normalizarPartido({ faltan: 1, nota: "x".repeat(300) }).nota.length, 120);
});

test("sumarse: lugares, repetidos, titular, turno empezado o completo", () => {
  const r = reserva();
  assert.deepEqual(puedeSumarse(r, "ana", antes), { ok: true, motivo: null });
  assert.equal(puedeSumarse(r, "titular", antes).ok, false);
  assert.equal(puedeSumarse(r, null, antes).ok, false);
  const conAna = { ...r, partidoAbierto: conJugador(r.partidoAbierto, { uid: "ana", nombre: "Ana" }) };
  assert.equal(lugaresLibres(conAna.partidoAbierto), 1);
  assert.match(puedeSumarse(conAna, "ana", antes).motivo, /Ya estás/);
  const lleno = { ...conAna, partidoAbierto: conJugador(conAna.partidoAbierto, { uid: "beto", nombre: "Beto" }) };
  assert.match(puedeSumarse(lleno, "carla", antes).motivo, /completo/);
  assert.match(puedeSumarse(r, "ana", inicioMs("2026-10-28", "21:00") + 1).motivo, /empezó/);
  assert.match(puedeSumarse({ ...r, status: "cancelada" }, "ana", antes).motivo, /confirmado/);
  assert.equal(lugaresLibres(sinJugador(lleno.partidoAbierto, "ana")), 1);
});

test("vigente: sale de la lista cuando se llena o empieza el turno", () => {
  const r = reserva();
  assert.equal(partidoVigente(r, antes), true);
  assert.equal(partidoVigente(r, inicioMs("2026-10-28", "21:00")), false);
  assert.equal(partidoVigente({ ...r, partidoAbierto: { faltan: 1, jugadores: [{ uid: "a" }] } }, antes), false);
  assert.equal(partidoVigente({ ...r, partidoAbierto: null }, antes), false);
});

test("índice público sin nombres", () => {
  const r = { ...reserva(), partidoAbierto: conJugador(reserva().partidoAbierto, { uid: "ana", nombre: "Ana López" }) };
  const i = indicePublico("r1", r, { nombre: "Club", ciudad: "Santiago" }, "c1");
  assert.equal(i.libres, 1);
  assert.equal(i.clubId, "c1");
  assert.equal(JSON.stringify(i).includes("Ana"), false);
  assert.equal(JSON.stringify(i).includes("titular"), false);
});
