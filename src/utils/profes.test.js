// node --test src/utils/profes.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alumnosUidsDe,
  canchaLibre,
  canchasLibresPara,
  comisionClasesPct,
  comisionDe,
  conflictoProfe,
  diaDeSemana,
  fechasSemanales,
  filtrarProfes,
  horaFinClase,
  horasDeClase,
  horasDisponiblesProfe,
  idClase,
  lugaresLibresClase,
  montoReserva,
  normalizarDisponibilidad,
  normalizarParticipantes,
  normalizarPerfil,
  normalizarVinculo,
  pagoOnlineDisponible,
  precioEnClub,
  puedeCancelarClase,
  puedeElogiar,
  resumenElogios,
  slotsDeClase,
  sumarElogio,
  topElogios,
  validarElogio,
  validarReservaClase,
} from "./profes.js";

const H = 3600000;
// 2026-11-16 es lunes
const LUNES = "2026-11-16";
const disp = { semanal: { 1: [{ desde: "09:00", hasta: "12:00" }, { desde: "18:00", hasta: "21:00" }] }, excepciones: [] };
const cancha = (id, horas = ["09:00", "10:00", "11:00", "18:00", "19:00", "20:00"]) => ({ id, nombre: id, horariosDisponibles: horas });
const antes = Date.UTC(2026, 10, 15, 12);

test("horas: duración en horas de cancha, fin de la clase, día de la semana", () => {
  assert.deepEqual(horasDeClase("18:00", 60), ["18:00"]);
  assert.deepEqual(horasDeClase("18:00", 90), ["18:00", "19:00"]);
  assert.deepEqual(horasDeClase("09:00", 120), ["09:00", "10:00"]);
  assert.equal(horaFinClase("18:00", 90), "19:30");
  assert.equal(horaFinClase("23:00", 60), "24:00");
  assert.equal(diaDeSemana(LUNES), 1);
  assert.equal(idClase("p1", LUNES, "18:00"), "p1_2026-11-16_1800");
});

test("perfil: valida precios, duración, capacidad y WhatsApp opcional", () => {
  const ok = normalizarPerfil({ nombre: "Caro", experienciaAnios: "5", clases: [{ tipo: "individual", activa: true, precio: "15000", duracion: 60 }, { tipo: "grupal", activa: true, precio: 6000, duracion: 90, capacidad: 6 }], niveles: ["6ta", "inventado"] });
  assert.equal(ok.error, undefined);
  assert.equal(ok.clases.length, 4);
  assert.equal(ok.clases.find((c) => c.tipo === "individual").capacidad, 1);
  assert.equal(ok.clases.find((c) => c.tipo === "grupal").capacidad, 6);
  assert.equal(ok.clases.find((c) => c.tipo === "pareja").activa, false);
  assert.deepEqual(ok.niveles, ["6ta"]);
  assert.equal(ok.whatsapp, "");
  assert.ok(normalizarPerfil({ nombre: "Caro", clases: [{ tipo: "individual", activa: true, precio: 0, duracion: 60 }] }).error);
  assert.ok(normalizarPerfil({ nombre: "Caro", clases: [{ tipo: "individual", activa: true, precio: 100, duracion: 45 }] }).error);
  assert.ok(normalizarPerfil({ nombre: "Caro", clases: [{ tipo: "grupal", activa: true, precio: 100, duracion: 60, capacidad: 20 }] }).error);
  assert.ok(normalizarPerfil({ nombre: "Caro", mostrarWhatsapp: true, whatsapp: "12" }).error);
  assert.equal(normalizarPerfil({ nombre: "Caro", mostrarWhatsapp: true, whatsapp: "+54 9 385 412-3456" }).whatsapp, "5493854123456");
  assert.ok(normalizarPerfil({ nombre: "" }).error);
});

test("vínculo: cobra, canchas del club, tarifas y pago online", () => {
  const v = normalizarVinculo({ cobra: "club", canchas: ["c1", "c9"], tarifas: { individual: "20000", raro: 5, pareja: 0 } }, ["c1", "c2"]);
  assert.deepEqual(v, { cobra: "club", bloqueaCancha: true, canchas: ["c1"], tarifas: { individual: 20000 } });
  assert.equal(normalizarVinculo({ cobra: "x", bloqueaCancha: false }).cobra, "profe");
  const perfil = { clases: [{ tipo: "individual", activa: true, precio: 15000 }, { tipo: "pareja", activa: true, precio: 9000 }] };
  assert.equal(precioEnClub(perfil, v, "individual"), 20000);
  assert.equal(precioEnClub(perfil, v, "pareja"), 9000);
  assert.equal(precioEnClub(perfil, v, "grupal"), 0);
  assert.equal(pagoOnlineDisponible({ cobra: "club" }, { mercadoPago: { conectado: true } }), true);
  assert.equal(pagoOnlineDisponible({ cobra: "profe" }, { mercadoPago: { conectado: true } }), false);
  assert.equal(pagoOnlineDisponible({ cobra: "club" }, {}), false);
});

test("disponibilidad: rangos en punto y excepciones (libre y extra)", () => {
  assert.ok(normalizarDisponibilidad({ semanal: { 1: [{ desde: "12:00", hasta: "10:00" }] } }).error);
  assert.ok(normalizarDisponibilidad({ semanal: { 1: [{ desde: "10:30", hasta: "12:00" }] } }).error);
  assert.ok(normalizarDisponibilidad({ excepciones: [{ fecha: "mañana", tipo: "libre" }] }).error);
  const n = normalizarDisponibilidad({ semanal: { 1: [{ desde: "18:00", hasta: "21:00" }, { desde: "09:00", hasta: "12:00" }] }, excepciones: [{ fecha: LUNES, tipo: "libre" }] });
  assert.equal(n.semanal[1][0].desde, "09:00");
  assert.equal(n.excepciones[0].desde, null);
  assert.deepEqual(horasDisponiblesProfe(disp, LUNES), ["09:00", "10:00", "11:00", "18:00", "19:00", "20:00"]);
  assert.deepEqual(horasDisponiblesProfe(disp, "2026-11-17"), []);
  assert.deepEqual(horasDisponiblesProfe({ ...disp, excepciones: [{ fecha: LUNES, tipo: "libre" }] }, LUNES), []);
  assert.deepEqual(horasDisponiblesProfe({ ...disp, excepciones: [{ fecha: LUNES, tipo: "libre", desde: "09:00", hasta: "11:00" }] }, LUNES), ["11:00", "18:00", "19:00", "20:00"]);
  assert.deepEqual(horasDisponiblesProfe({ ...disp, excepciones: [{ fecha: "2026-11-17", tipo: "extra", desde: "07:00", hasta: "09:00" }] }, "2026-11-17"), ["07:00", "08:00"]);
});

test("canchas: reservas vivas, turnos fijos y horario", () => {
  const c1 = cancha("c1");
  assert.equal(canchaLibre({ cancha: c1, fecha: LUNES, hora: "18:00" }), true);
  assert.equal(canchaLibre({ cancha: c1, fecha: LUNES, hora: "15:00" }), false);
  assert.equal(canchaLibre({ cancha: c1, fecha: LUNES, hora: "18:00", reservas: [{ canchaId: "c1", fecha: LUNES, hora: "18:00", status: "confirmada" }] }), false);
  assert.equal(canchaLibre({ cancha: c1, fecha: LUNES, hora: "18:00", reservas: [{ canchaId: "c1", fecha: LUNES, hora: "18:00", status: "cancelada" }] }), true);
  assert.equal(canchaLibre({ cancha: c1, fecha: LUNES, hora: "18:00", reservas: [{ canchaId: "c1", fecha: LUNES, hora: "18:00", status: "confirmada", tipo: "torneo" }] }), false);
  assert.equal(canchaLibre({ cancha: c1, fecha: LUNES, hora: "19:00", turnosFijos: [{ canchaId: "c1", dia: "Lunes", horas: ["19:00"], status: "activo" }] }), false);
  assert.equal(canchaLibre({ cancha: c1, fecha: LUNES, hora: "19:00", turnosFijos: [{ canchaId: "c1", dia: "Martes", horas: ["19:00"], status: "activo" }] }), true);
  const libres = canchasLibresPara({ canchas: [c1, cancha("c2")], permitidas: ["c2"], fecha: LUNES, horas: ["18:00", "19:00"] });
  assert.deepEqual(libres.map((c) => c.id), ["c2"]);
});

test("slots: disponibilidad del profe ∩ cancha libre, duración y pasado", () => {
  const base = { disponibilidad: disp, fecha: LUNES, tipo: "individual", duracion: 60, capacidad: 1, clubId: "club1", canchas: [cancha("c1")], ahoraMs: antes };
  assert.deepEqual(slotsDeClase(base).map((s) => s.hora), ["09:00", "10:00", "11:00", "18:00", "19:00", "20:00"]);
  // 90 minutos: hacen falta dos horas seguidas del profe y de la cancha
  assert.deepEqual(slotsDeClase({ ...base, duracion: 90 }).map((s) => s.hora), ["09:00", "10:00", "18:00", "19:00"]);
  // Cancha ocupada a las 19 → no hay clase a las 19 (ni de 90 min a las 18)
  const reservas = [{ canchaId: "c1", fecha: LUNES, hora: "19:00", status: "confirmada" }];
  assert.deepEqual(slotsDeClase({ ...base, reservas }).map((s) => s.hora), ["09:00", "10:00", "11:00", "18:00", "20:00"]);
  assert.deepEqual(slotsDeClase({ ...base, duracion: 120, reservas }).map((s) => s.hora), ["09:00", "10:00"]);
  // Sin bloquear cancha, la cancha no importa
  assert.equal(slotsDeClase({ ...base, reservas, bloqueaCancha: false, canchas: [] }).length, 6);
  // Ya empezó
  assert.equal(slotsDeClase({ ...base, ahoraMs: Date.UTC(2026, 10, 16, 21, 30) }).map((s) => s.hora)[0], "19:00");
  // La segunda cancha libre entra cuando la primera está ocupada
  const dos = slotsDeClase({ ...base, canchas: [cancha("c1"), cancha("c2")], reservas });
  assert.equal(dos.find((s) => s.hora === "19:00").canchaId, "c2");
});

test("slots: clase del profe en otro club bloquea; una grupal con lugar se ofrece para sumarse", () => {
  const base = { disponibilidad: disp, fecha: LUNES, tipo: "grupal", duracion: 60, capacidad: 4, clubId: "club1", bloqueaCancha: false, ahoraMs: antes };
  const ocupacion = [
    { fecha: LUNES, hora: "09:00", claseId: "x", horaInicio: "09:00", tipoClase: "individual", capacidad: 1, ocupados: 1, clubId: "club2" },
    { fecha: LUNES, hora: "18:00", claseId: "g", horaInicio: "18:00", tipoClase: "grupal", capacidad: 4, ocupados: 2, clubId: "club1", canchaId: "c1" },
  ];
  const slots = slotsDeClase({ ...base, ocupacion });
  assert.equal(slots.find((s) => s.hora === "09:00"), undefined);
  const g = slots.find((s) => s.hora === "18:00");
  assert.equal(g.unirse, true);
  assert.equal(g.lugares, 2);
  assert.equal(slotsDeClase({ ...base, ocupacion, lugares: 3 }).find((s) => s.hora === "18:00"), undefined);
  assert.ok(conflictoProfe(ocupacion, LUNES, ["09:00", "10:00"]));
  assert.equal(conflictoProfe(ocupacion, LUNES, ["10:00"]), null);
  assert.equal(conflictoProfe(ocupacion, LUNES, ["18:00"], "g"), null);
});

test("reserva: doble reserva, lugares, de a 2 y con uno mismo", () => {
  assert.equal(validarReservaClase({ tipo: "individual", capacidad: 1, lugares: 1, uid: "a", profeUid: "p" }).ok, true);
  assert.equal(validarReservaClase({ tipo: "individual", capacidad: 1, lugares: 1, uid: "p", profeUid: "p" }).ok, false);
  assert.equal(validarReservaClase({ tipo: "pareja", capacidad: 2, lugares: 1, uid: "a", profeUid: "p" }).ok, false);
  assert.equal(validarReservaClase({ tipo: "pareja", capacidad: 2, lugares: 2, uid: "a", profeUid: "p" }).ok, true);
  const clase = { estado: "confirmada", tipoClase: "grupal", capacidad: 4, inscriptos: { a: { uid: "a", lugares: 3 } } };
  assert.equal(lugaresLibresClase(clase), 1);
  assert.equal(validarReservaClase({ clase, tipo: "grupal", capacidad: 4, lugares: 1, uid: "b", profeUid: "p" }).unirse, true);
  assert.equal(validarReservaClase({ clase, tipo: "grupal", capacidad: 4, lugares: 2, uid: "b", profeUid: "p" }).ok, false);
  assert.equal(validarReservaClase({ clase, tipo: "grupal", capacidad: 4, lugares: 1, uid: "a", profeUid: "p" }).ok, false);
  assert.equal(validarReservaClase({ clase: { ...clase, tipoClase: "individual" }, tipo: "grupal", capacidad: 4, lugares: 1, uid: "b", profeUid: "p" }).ok, false);
  assert.equal(validarReservaClase({ clase: { ...clase, estado: "cancelada" }, tipo: "individual", capacidad: 1, lugares: 1, uid: "b", profeUid: "p" }).unirse, false);
});

test("participantes y alumnos: sin repetidos ni quien reserva", () => {
  const p = normalizarParticipantes([{ nombre: " Juan " }, { nombre: "Ana", uid: "u2" }, { nombre: "Ana bis", uid: "u2" }, { nombre: "Yo", uid: "u1" }, { nombre: "" }], { reservaUid: "u1" });
  assert.deepEqual(p, [{ nombre: "Juan", uid: null }, { nombre: "Ana", uid: "u2" }]);
  assert.deepEqual(alumnosUidsDe({ u1: { uid: "u1", participantes: p }, u3: { uid: "u3", participantes: [] } }).sort(), ["u1", "u2", "u3"]);
});

test("repetir semanal: N fechas cada 7 días, máximo 12", () => {
  assert.deepEqual(fechasSemanales("2026-12-21", 3), ["2026-12-28", "2027-01-04", "2027-01-11"]);
  assert.equal(fechasSemanales(LUNES, 50).length, 12);
  assert.deepEqual(fechasSemanales(LUNES, 0), []);
  assert.deepEqual(fechasSemanales("x", 2), []);
});

test("plata: monto por lugares y comisión de clases (5 % por defecto, 0 a 30)", () => {
  assert.equal(montoReserva(9000, 2), 18000);
  assert.equal(montoReserva(15000, 0), 15000);
  assert.equal(comisionClasesPct(undefined), 5);
  assert.equal(comisionClasesPct({}), 5);
  assert.equal(comisionClasesPct({ comisionClasesPct: 0 }), 0);
  assert.equal(comisionClasesPct({ comisionClasesPct: "7.5" }), 7.5);
  assert.equal(comisionClasesPct({ comisionClasesPct: 90 }), 30);
  assert.equal(comisionDe(15000, 5), 750);
  assert.equal(comisionDe(9999, 2.5), 249.98);
});

test("cancelar: antes de empezar; alumno su lugar, profe/club todo", () => {
  const clase = { estado: "confirmada", fecha: LUNES, horaInicio: "18:00", inscriptos: { a: { uid: "a" } } };
  const ahora = Date.UTC(2026, 10, 16, 20); // 17:00 en Argentina
  assert.deepEqual(puedeCancelarClase(clase, { uid: "a", ahoraMs: ahora }), { ok: true, todo: false });
  assert.equal(puedeCancelarClase(clase, { uid: "b", ahoraMs: ahora }).ok, false);
  assert.equal(puedeCancelarClase(clase, { esProfe: true, ahoraMs: ahora }).todo, true);
  assert.equal(puedeCancelarClase(clase, { uid: "a", ahoraMs: ahora + 2 * H }).ok, false);
  assert.equal(puedeCancelarClase({ ...clase, estado: "dada" }, { esClub: true, ahoraMs: ahora }).ok, false);
});

test("elogios: solo de la lista, 1 a 3, comentario corto, una vez por clase", () => {
  assert.deepEqual(validarElogio({ tags: ["divertido", "paciente", "divertido"], comentario: "  Genial   la clase " }), { tags: ["divertido", "paciente"], comentario: "Genial la clase" });
  assert.ok(validarElogio({ tags: [] }).error);
  assert.ok(validarElogio({ tags: ["malo"] }).error);
  assert.ok(validarElogio({ tags: ["divertido", "paciente", "puntual", "motivador"] }).error);
  assert.ok(validarElogio({ tags: ["divertido"], comentario: "x".repeat(201) }).error);
  const clase = { estado: "dada", alumnosUids: ["a", "b", "c"], inscriptos: { a: { uid: "a" }, c: { uid: "c", asistencia: "ausente" } }, elogiadoPor: ["b"] };
  assert.equal(puedeElogiar(clase, "a").ok, true);
  assert.equal(puedeElogiar(clase, "b").ok, false);
  assert.equal(puedeElogiar(clase, "c").ok, false);
  assert.equal(puedeElogiar(clase, "z").ok, false);
  assert.equal(puedeElogiar({ ...clase, estado: "confirmada" }, "a").ok, false);
});

test("elogios: resumen y ranking de tags", () => {
  let r = sumarElogio(undefined, ["divertido", "paciente"]);
  r = sumarElogio(r, ["paciente"]);
  assert.deepEqual(r, { total: 2, tags: { divertido: 1, paciente: 2 } });
  assert.deepEqual(resumenElogios([{ tags: ["divertido", "paciente"] }, { tags: ["paciente"] }]), r);
  assert.deepEqual(topElogios(r).map((e) => [e.id, e.n]), [["paciente", 2], ["divertido", 1]]);
  assert.deepEqual(topElogios({ tags: { exigente: 1, respetuoso: 1 } }).map((e) => e.id), ["respetuoso", "exigente"]);
  assert.deepEqual(topElogios(null), []);
});

test("directorio: activos con clases, por ciudad (propia o de sus clubes), club y texto", () => {
  const clases = [{ tipo: "individual", activa: true, precio: 1 }];
  const profes = [
    { uid: "1", nombre: "Ana", ciudad: "Santiago del Estero", clases, clubIds: ["c1"], elogios: { total: 1 } },
    { uid: "2", nombre: "Beto", ciudad: "La Banda", clases, clubIds: ["c2"], clubes: { c2: { estado: "activo", ciudad: "Santiago del Estero" } }, elogios: { total: 5 } },
    { uid: "3", nombre: "Caro", ciudad: "Tucumán", clases: [], clubIds: [] },
    { uid: "4", nombre: "Dani", ciudad: "Tucumán", clases, activo: false },
  ];
  assert.deepEqual(filtrarProfes(profes).map((p) => p.uid), ["2", "1"]);
  assert.deepEqual(filtrarProfes(profes, { ciudad: "santiago del estero" }).map((p) => p.uid), ["2", "1"]);
  assert.deepEqual(filtrarProfes(profes, { clubId: "c1" }).map((p) => p.uid), ["1"]);
  assert.deepEqual(filtrarProfes(profes, { texto: "banda" }).map((p) => p.uid), ["2"]);
});
