// node --test src/utils/disponibilidad.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { diaDeSemana, diasReservables, esTurnoFijo, estadoDeCelda, horasSeguidasLibres, slotsDeReserva, sumarDias, turnosLibres } from "./disponibilidad.js";

const c1 = { id: "c1", nombre: "Cancha 1", horariosDisponibles: ["18:00", "19:00", "20:00", "21:00"] };
const c2 = { id: "c2", nombre: "Cancha 2", horariosDisponibles: ["19:00", "20:00"] };
const FECHA = "2026-11-12"; // jueves

test("fechas: día de la semana y suma de días", () => {
  assert.equal(diaDeSemana(FECHA), 4);
  assert.equal(diaDeSemana("x"), null);
  assert.equal(sumarDias("2026-12-31", 1), "2027-01-01");
  assert.equal(diasReservables({}, "2026-11-11").length, 8);
  assert.deepEqual(diasReservables({ diasAnticipacion: 2 }, "2026-11-11"), ["2026-11-11", "2026-11-12", "2026-11-13"]);
  assert.deepEqual(diasReservables({ diasAnticipacion: 0 }, "2026-11-11"), ["2026-11-11"]);
});

test("estado de una celda: reservada, pendiente, fijo, bloqueada, libre", () => {
  const reservas = [
    { canchaId: "c1", hora: "18:00", status: "confirmada" },
    { canchaId: "c1", hora: "19:00", status: "pendiente" },
    { canchaId: "c1", hora: "20:00", status: "cancelada" },
    { canchaId: "c2", hora: "20:00", status: "confirmada", tipo: "clase" },
  ];
  const fijos = [{ canchaId: "c1", dia: "Jueves", horas: ["21:00"], status: "activo" }];
  const e = (cancha, hora) => estadoDeCelda({ cancha, hora, fecha: FECHA, reservas, turnosFijos: fijos });
  assert.equal(e(c1, "18:00"), "reservada");
  assert.equal(e(c1, "19:00"), "pendiente");
  assert.equal(e(c1, "20:00"), "libre");
  assert.equal(e(c1, "21:00"), "fijo");
  assert.equal(e(c1, "22:00"), "bloqueada");
  assert.equal(e(c2, "20:00"), "reservada");
  assert.equal(esTurnoFijo(fijos, "c1", "2026-11-13", "21:00"), false);
});

test("turnos libres por hora, sin las horas que ya empezaron", () => {
  const reservas = [{ canchaId: "c2", hora: "19:00", status: "confirmada" }];
  const libres = turnosLibres({ canchas: [c2, c1], reservas, turnosFijos: [], fecha: FECHA });
  assert.deepEqual(libres.map((l) => [l.hora, l.canchas.map((c) => c.id)]), [["18:00", ["c1"]], ["19:00", ["c1"]], ["20:00", ["c1", "c2"]], ["21:00", ["c1"]]]);
  const hoy = turnosLibres({ canchas: [c1, c2], reservas, turnosFijos: [], fecha: FECHA, horaAhora: "19:00" });
  assert.deepEqual(hoy.map((l) => l.hora), ["20:00", "21:00"]);
});

test("slots de una reserva: ids, horas y precios como canchaService", () => {
  const r = slotsDeReserva({ canchaId: "c1", fecha: FECHA, hora: "20:00", turnos: 2, precios: [30000, 35000] });
  assert.equal(r.grupoId, "c1_2026-11-12_2000");
  assert.deepEqual(r.slots.map((s) => [s.id, s.hora, s.precio]), [["c1_2026-11-12_2000", "20:00", 30000], ["c1_2026-11-12_2100", "21:00", 35000]]);
  assert.equal(r.horaFin, "22:00");
  assert.equal(r.precioTotal, 65000);
  assert.equal(slotsDeReserva({ canchaId: "c", fecha: FECHA, hora: "09:00", turnos: 9 }).turnos, 3);
});

test("horas seguidas libres", () => {
  const reservas = [{ canchaId: "c1", hora: "20:00", status: "confirmada" }];
  assert.equal(horasSeguidasLibres({ cancha: c1, hora: "18:00", fecha: FECHA, reservas, turnosFijos: [], max: 3 }), 2);
  assert.equal(horasSeguidasLibres({ cancha: c1, hora: "21:00", fecha: FECHA, reservas, turnosFijos: [], max: 3 }), 1);
  assert.equal(horasSeguidasLibres({ cancha: { id: "x", horariosDisponibles: ["23:00"] }, hora: "23:00", fecha: FECHA, reservas: [], turnosFijos: [], max: 3 }), 1);
});
