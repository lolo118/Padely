// node --test src/utils/inicio.test.js — helpers del Inicio del jugador
import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularTotalesCuenta, cuentaDesdeReserva, nuevoParticipante, uidsDe } from "./cuentas.js";
import {
  clubesHabituales,
  diaRelativo,
  esJugadorNuevo,
  etiquetaInscripcion,
  horaMinutos,
  linkComoLlegar,
  mensajeTurno,
  pendientesDeInicio,
  progresoPase,
  reservasProximas,
  saludoPorHora,
  torneosParaInscribirse,
} from "./inicio.js";

const r = (clubId, fecha, horaInicio, extra = {}) => ({ id: `${clubId}-${fecha}-${horaInicio}`, grupoId: `${clubId}-${fecha}-${horaInicio}`, clubId, fecha, horaInicio, horaFin: extra.horaFin || horaInicio.replace(/^(\d\d)/, (h) => String(Number(h) + 1).padStart(2, "0")), status: "confirmada", ...extra });

test("saludo según la hora y hora local HH:MM", () => {
  assert.equal(saludoPorHora(8), "Buenos días");
  assert.equal(saludoPorHora(12), "Buenas tardes");
  assert.equal(saludoPorHora(19), "Buenas noches");
  assert.equal(horaMinutos(new Date(2026, 10, 11, 7, 5)), "07:05");
});

test("reservasProximas: hoy cuenta mientras no terminó; las cerradas no; en orden", () => {
  const grupos = [
    r("a", "2026-11-12", "20:00"),
    r("a", "2026-11-11", "18:00", { horaFin: "19:30" }),
    r("b", "2026-11-11", "21:00"),
    r("b", "2026-11-10", "21:00"),
    r("c", "2026-11-13", "10:00", { status: "cancelada" }),
    r("c", "2026-11-13", "11:00", { status: "rechazada" }),
    r("c", "2026-11-14", "11:00", { status: "pendiente" }),
  ];
  const lista = reservasProximas(grupos, { hoy: "2026-11-11", hora: "19:00" });
  assert.deepEqual(lista.map((x) => `${x.fecha} ${x.horaInicio}`), ["2026-11-11 18:00", "2026-11-11 21:00", "2026-11-12 20:00", "2026-11-14 11:00"]);
  // A las 19:30 la de 18:00–19:30 ya terminó
  assert.equal(reservasProximas(grupos, { hoy: "2026-11-11", hora: "19:30" })[0].horaInicio, "21:00");
  assert.deepEqual(reservasProximas(null, { hoy: "2026-11-11" }), []);
});

test("clubesHabituales: frecuencia, después recencia; canceladas fuera; favoritos completan", () => {
  const grupos = [
    r("a", "2026-10-01", "20:00"),
    r("b", "2026-10-02", "20:00"),
    r("b", "2026-10-05", "20:00"),
    r("c", "2026-11-01", "20:00"),
    r("d", "2026-11-02", "20:00", { status: "cancelada" }),
    r("d", "2026-11-03", "20:00", { status: "cancelada" }),
  ];
  assert.deepEqual(clubesHabituales(grupos).map((c) => c.clubId), ["b", "c", "a"]);
  assert.deepEqual(clubesHabituales(grupos, { max: 2 }).map((c) => c.clubId), ["b", "c"]);
  assert.equal(clubesHabituales(grupos)[0].veces, 2);
  assert.equal(clubesHabituales(grupos)[0].ultima, "2026-10-05");
  assert.deepEqual(clubesHabituales([], { favoritos: ["x", "y", "x"] }).map((c) => c.clubId), ["x", "y"]);
  assert.deepEqual(clubesHabituales([r("a", "2026-10-01", "20:00")], { favoritos: ["a", "z"], max: 3 }).map((c) => c.clubId), ["a", "z"]);
});

test("linkComoLlegar: coordenadas, dirección o nada", () => {
  assert.equal(linkComoLlegar({ lat: -27.78, lng: -64.26 }), "https://www.google.com/maps/search/?api=1&query=-27.78,-64.26");
  const link = linkComoLlegar({ nombre: "Club Norte", direccion: "Belgrano 123", ciudad: "Santiago del Estero", provincia: "Santiago del Estero" });
  assert.ok(link.startsWith("https://www.google.com/maps/search/?api=1&query="));
  assert.ok(decodeURIComponent(link).includes("Club Norte, Belgrano 123, Santiago del Estero"));
  assert.equal(linkComoLlegar({ nombre: "Sin dirección", ciudad: "La Banda" }), null);
  assert.equal(linkComoLlegar(null), null);
});

test("mensajeTurno arma el texto para WhatsApp", () => {
  assert.equal(mensajeTurno({ fechaTexto: "sáb 18 oct", rango: "20:00 – 21:30", clubNombre: "Club Norte", canchaNombre: "Cancha 2" }), "¡Tenemos cancha! sáb 18 oct, 20:00 – 21:30, en Club Norte (Cancha 2).");
  assert.ok(mensajeTurno({ fechaTexto: "hoy", clubNombre: "", mapa: "https://maps" }).endsWith("en el club. Cómo llegar: https://maps"));
});

test("etiquetaInscripcion", () => {
  assert.equal(etiquetaInscripcion("esperando_companero"), "Esperando a tu pareja");
  assert.equal(etiquetaInscripcion("pendiente_aprobacion"), "Esperando al organizador");
  assert.equal(etiquetaInscripcion("pendiente_pago"), "Pendiente");
  assert.equal(etiquetaInscripcion("lista_espera"), "Lista espera");
});

// Cuenta compartida: titular u-gomez + un jugador con uid u-yo
const ahora = new Date(2026, 10, 11, 20, 0);
const reservaCuenta = { id: "k1_2026-11-11_2000", grupoId: "k1_2026-11-11_2000", canchaId: "k1", canchaName: "Cancha 1", fecha: "2026-11-11", horaInicio: "20:00", horaFin: "21:00", turnos: 1, jugadorUid: "u-gomez", nombreJugador: "Gómez", precioTotal: 20000, seña: 0, señaPagada: false };
const cuentaCompartida = (clubId = "club1") => {
  const c = cuentaDesdeReserva(reservaCuenta, { agregadoPor: "staff", ahora });
  c.participantes.push(nuevoParticipante({ id: "p2", uid: "u-yo", nombre: "Yo", tipo: "jugador", origen: "link", ahora }));
  c.participantesUids = uidsDe(c.participantes);
  c.totales = calcularTotalesCuenta(c);
  return { ...c, id: reservaCuenta.grupoId, clubId, estado: "abierta" };
};

test("pendientesDeInicio: pagar mi parte primero, después seña, sumado e inscripción", () => {
  const debo = cuentaCompartida("club1");
  const sumadoSinDeuda = { ...cuentaCompartida("club2"), cancha: { cobrar: false, precioTotal: 0 }, items: [] };
  const proximas = [
    { ...r("club3", "2026-11-12", "20:00"), seña: 5000, señaPagada: false, clubNombre: "Club 3" },
    { ...r("club3", "2026-11-13", "20:00"), seña: 5000, señaPagada: true },
    { ...r("club4", "2026-11-14", "20:00"), seña: 3000, señaPagada: false },
  ];
  const inscripciones = [
    { id: "i1", torneoId: "t1", torneoNombre: "Apertura", status: "pendiente_aprobacion" },
    { id: "i2", torneoId: "t2", status: "confirmada" },
  ];
  const lista = pendientesDeInicio({ uid: "u-yo", proximas, cuentas: [debo, debo, sumadoSinDeuda], inscripciones, excluir: "club4/club4-2026-11-14-20:00" });
  assert.deepEqual(lista.map((x) => x.tipo), ["pagar", "seña", "sumado", "inscripcion"]);
  assert.ok(lista[0].monto > 0);
  assert.equal(lista[0].clubId, "club1");
  assert.equal(lista[1].monto, 5000);
  assert.equal(lista[3].torneoNombre, "Apertura");
});

test("pendientesDeInicio: la cuenta de la reserva de arriba no se repite; el titular sin deuda no es 'sumado'", () => {
  const c = { ...cuentaCompartida("club1"), cancha: { cobrar: false, precioTotal: 0 } };
  assert.deepEqual(pendientesDeInicio({ uid: "u-gomez", cuentas: [c] }), []);
  const conDeuda = cuentaCompartida("club1");
  assert.equal(pendientesDeInicio({ uid: "u-gomez", cuentas: [conDeuda] })[0].tipo, "pagar");
  assert.deepEqual(pendientesDeInicio({ uid: "u-gomez", cuentas: [conDeuda], excluir: `club1/${conDeuda.id}` }), []);
  assert.deepEqual(pendientesDeInicio({ uid: "u-yo", cuentas: [{ ...conDeuda, estado: "cerrada" }] }), []);
  assert.deepEqual(pendientesDeInicio(), []);
});

test("torneosParaInscribirse: sin los que ya está anotado ni los que empezaron", () => {
  const abiertos = [
    { id: "t1", fechaInicio: "2026-12-01" },
    { id: "t2", fechaInicio: "2026-11-20" },
    { id: "t3" },
    { id: "t4", fechaInicio: "2026-11-01" },
    { id: "t5", fechaInicio: "2026-11-25" },
  ];
  const insc = [{ torneoId: "t5", status: "confirmada" }, { torneoId: "t1", status: "rechazada" }];
  assert.deepEqual(torneosParaInscribirse(abiertos, insc, { hoy: "2026-11-11" }).map((t) => t.id), ["t2", "t1", "t3"]);
  assert.deepEqual(torneosParaInscribirse(abiertos, [], { hoy: "2026-11-11", max: 1 }).map((t) => t.id), ["t2"]);
});

test("progresoPase: porcentaje dentro del tramo; null en Oro", () => {
  assert.deepEqual(progresoPase(75), { siguiente: "plata", faltan: 75, pct: 50 });
  assert.deepEqual(progresoPase(275, { plata: 150, oro: 400 }), { siguiente: "oro", faltan: 125, pct: 50 });
  assert.equal(progresoPase(0).pct, 0);
  assert.equal(progresoPase(500), null);
  assert.equal(progresoPase(20, { plata: 40, oro: 80 }).faltan, 20);
});

test("esJugadorNuevo", () => {
  assert.equal(esJugadorNuevo({}), true);
  assert.equal(esJugadorNuevo({ reservas: 1 }), false);
  assert.equal(esJugadorNuevo({ pases: 1 }), false);
  assert.equal(esJugadorNuevo({ cuentas: 1 }), false);
});

test("diaRelativo: hoy, mañana o el día corto", () => {
  assert.equal(diaRelativo("2026-11-11", "2026-11-11"), "Hoy");
  assert.equal(diaRelativo("2026-11-12", "2026-11-11"), "Mañana");
  assert.equal(diaRelativo("2026-12-01", "2026-11-30"), "Mañana");
  assert.equal(diaRelativo("2026-11-14", "2026-11-11"), "sáb 14 nov");
  assert.equal(diaRelativo("", "2026-11-11"), "");
});
