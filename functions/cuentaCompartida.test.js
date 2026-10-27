// node --test functions/cuentaCompartida.test.js
const { test } = require("node:test");
const assert = require("node:assert/strict");
const cc = require("./cuentaCompartida");

test("nombre de búsqueda y token", () => {
  assert.equal(cc.nombreBusqueda("  María José  Pérez-Ñandú "), "maria jose perez nandu");
  assert.equal(cc.nombreBusqueda("ACOSTA"), "acosta");
  assert.equal(cc.nombreBusqueda(""), "");
  const t = cc.generarToken(16);
  assert.equal(t.length, 16);
  assert.match(t, /^[abcdefghjkmnpqrstuvwxyz23456789]+$/);
  assert.notEqual(cc.generarToken(16), t);
});

test("la cuenta nace de la reserva con el titular y los totales", () => {
  const ahora = new Date(2026, 9, 23, 19, 0);
  const c = cc.cuentaDesdeReserva("k1_2026-10-23_2000", { canchaId: "k1", canchaName: "Cancha 1", fecha: "2026-10-23", hora: "20:00", turnos: 2, precioTotal: 20000, seña: 4500, señaPagada: true, jugadorUid: "u1", nombreJugador: "Gómez", status: "confirmada" }, { agregadoPor: "fn", ahora });
  assert.equal(c.horaInicio, "20:00");
  assert.equal(c.horaFin, "22:00");
  assert.equal(c.participantes.length, 1);
  assert.equal(c.participantes[0].id, cc.ID_TITULAR);
  assert.equal(c.participantes[0].uid, "u1");
  assert.deepEqual(c.participantesUids, ["u1"]);
  assert.deepEqual(c.totales, { consumos: 0, cancha: 20000, seña: 4500, total: 15500 });
  // Reserva vieja: precio por turno y sin horaFin
  const v = cc.cuentaDesdeReserva("x", { fecha: "2026-10-23", hora: "09:00", precio: 8000 });
  assert.equal(v.cancha.precioTotal, 8000);
  assert.equal(v.horaFin, "10:00");
  assert.equal(v.participantes[0].uid, null);
  assert.deepEqual(v.participantesUids, []);
  assert.equal(cc.participantesActivos({ participantes: [{ id: "a", estado: "quitado" }, { id: "b", estado: "activo", uid: "u" }] }).length, 1);
  assert.deepEqual(cc.uidsDe([{ uid: "u", estado: "activo" }, { uid: "u", estado: "activo" }, { uid: "q", estado: "quitado" }]), ["u"]);
});

test("ventana del turno (UTC−3): 2 h antes y 2 h después", () => {
  const t = { fecha: "2026-10-23", horaInicio: "20:00", horaFin: "21:00" };
  const ms = (h, m = 0) => new Date(Date.UTC(2026, 9, 23, h + 3, m)).getTime();
  assert.equal(cc.ventanaUnirse(t, ms(17, 59)), false);
  assert.equal(cc.ventanaUnirse(t, ms(18, 0)), true);
  assert.equal(cc.ventanaUnirse(t, ms(22, 59)), true);
  assert.equal(cc.ventanaUnirse(t, ms(23, 1)), false);
  assert.equal(cc.terminoHace(t, ms(23, 1)), true);
  assert.equal(cc.terminoHace(t, ms(22, 30)), false);
  // Turno que termina a medianoche
  const m = { fecha: "2026-10-23", horaInicio: "23:00", horaFin: "00:00", turnos: 1 };
  assert.equal(cc.finDelTurno(m), ms(24, 0));
  assert.equal(cc.ventanaUnirse(m, ms(25, 30)), true);
});

test("pagado por participante: quién pagó y a quién le cubrieron", () => {
  const cuenta = {
    pagos: [
      { participanteIds: ["p2"], total: 6000, lineas: [{ participanteId: "p2", tipo: "consumo", monto: 1000, lineaId: "a" }, { participanteId: "p2", tipo: "cancha", monto: 5000 }] },
      { participanteIds: ["titular"], total: 9000, lineas: [{ participanteId: "titular", tipo: "cancha", monto: 5000 }, { participanteId: "p3", tipo: "cancha", monto: 4000 }] },
    ],
  };
  const { pagaron, cubierto } = cc.pagadoPorParticipante(cuenta);
  assert.equal(pagaron.get("p2"), 6000);
  assert.equal(pagaron.get("titular"), 9000);
  assert.equal(pagaron.get("p3"), undefined);
  assert.equal(cubierto.get("p3"), 4000);
  assert.equal(cc.lineaPagada(cuenta, "a"), true);
  assert.equal(cc.lineaPagada(cuenta, "b"), false);
  assert.equal(cc.algoPagadoDe(cuenta, "p3"), true);
  assert.equal(cc.algoPagadoDe(cuenta, "p9"), false);
});

test("M2 (P3-8b): huésped reclamable — mismo nombre, sin cuenta, sin pagos; nunca el titular ni quien ya pagó", () => {
  const { huespedReclamable } = require("./cuentaCompartida");
  const martin = { id: "p2", nombre: "Martín", tipo: "invitado", uid: null, anonimo: false, estado: "activo" };
  const anon = { id: "p3", nombre: "Lucia", tipo: "invitado", uid: "anon1", anonimo: true, estado: "activo" };
  const conCuenta = { id: "p4", nombre: "Pedro", tipo: "jugador", uid: "u9", anonimo: false, estado: "activo" };
  const titular = { id: "titular", nombre: "Gómez", tipo: "titular", uid: null, estado: "activo" };
  const sinPagos = { pagos: [] };
  assert.equal(huespedReclamable(martin, sinPagos, "martin"), true); // acentos y mayúsculas no importan
  assert.equal(huespedReclamable(martin, sinPagos, "MARTIN "), true);
  assert.equal(huespedReclamable(anon, sinPagos, "Lucía"), true);
  assert.equal(huespedReclamable(martin, sinPagos, "Martina"), false);
  assert.equal(huespedReclamable(conCuenta, sinPagos, "Pedro"), false);
  assert.equal(huespedReclamable(titular, sinPagos, "Gómez"), false);
  assert.equal(huespedReclamable({ ...martin, estado: "quitado" }, sinPagos, "Martín"), false);
  // Ya pagó algo (a su nombre o con su plata): no se reclama
  assert.equal(huespedReclamable(martin, { pagos: [{ participanteIds: ["titular"], lineas: [{ lineaId: "a", tipo: "consumo", monto: 100, participanteId: "p2" }] }] }, "Martín"), false);
  assert.equal(huespedReclamable(martin, { pagos: [{ participanteIds: ["p2"], lineas: [] }] }, "Martín"), false);
  assert.equal(huespedReclamable(martin, { pagos: [{ participanteIds: ["titular"], lineas: [{ lineaId: "a", tipo: "consumo", monto: 100, participanteId: "titular" }] }] }, "Martín"), true);
});

test("B-P3-8b-2: el barrido de las 04:00 nunca anula una cuenta con plata", () => {
  const d = cc.decisionCuentaVencida;
  // Sin consumos y sin plata → anular (el caso que tenía sentido)
  assert.equal(d({ items: [], pagos: [], ventas: [], cancha: { precioTotal: 20000, seña: 6000, señaPagada: false } }, { pendiente: 20000 }), "anular");
  assert.equal(d({}, { pendiente: 0 }), "anular");
  // Romero 25/10 (C-P3-8b): sin consumos, $ 10.000 pagados de $ 20.000 → queda abierta con aviso, no se anula
  const romero = { items: [], pagos: [{ ventaNumero: "D1-000018", total: 5000 }, { ventaNumero: "MP-000002", total: 5000 }], ventas: ["D1-000018", "MP-000002"], cancha: { precioTotal: 20000, seña: 6000, señaPagada: false } };
  assert.equal(d(romero, { pendiente: 10000 }), "avisar");
  // Torres 24/10: seña cobrada + un pago por MP, todavía se debe → avisar
  assert.equal(d({ items: [], pagos: [{ ventaNumero: "MP-000001", total: 3500 }], cancha: { señaPagada: true } }, { pendiente: 10500 }), "avisar");
  // Solo la seña pagada (sin pagos) cuenta como plata
  assert.equal(d({ items: [], pagos: [], cancha: { señaPagada: true, seña: 4500, precioTotal: 4500 } }, { pendiente: 0 }), "cerrar");
  // Con plata y nada pendiente → cerrar
  assert.equal(d({ items: [{ id: "a" }], pagos: [{ total: 15000 }] }, { pendiente: 0 }), "cerrar");
  // Consumos sin pagar → avisar (como antes)
  assert.equal(d({ items: [{ id: "a" }], pagos: [] }, { pendiente: 3000 }), "avisar");
});
