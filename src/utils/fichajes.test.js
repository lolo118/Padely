// node --test src/utils/fichajes.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INTENTOS_MAX,
  INTENTOS_VENTANA_MS,
  REPETIDO_SEG,
  TURNO_MAX_HORAS,
  agruparHoras,
  decidirFichaje,
  diaArgentina,
  esOlvidado,
  evaluarIntentos,
  filasCsvFichajes,
  formatMinutos,
  horaArgentina,
  horasDecimales,
  lunesDe,
  minutosDeTurno,
  moverPeriodo,
  msDeDiaHora,
  nombreArchivoFichajes,
  pinValido,
  rangoPeriodo,
  totalesPorEmpleado,
  validarTurnoManual,
} from "./fichajes.js";

const H = 3600 * 1000;
// martes 10/11/2026 14:02 en Argentina = 17:02 UTC
const T = Date.UTC(2026, 10, 10, 17, 2);

test("fechas en hora argentina (UTC−3), sin depender del huso de la máquina", () => {
  assert.equal(diaArgentina(T), "2026-11-10");
  assert.equal(horaArgentina(T), "14:02");
  // 01:30 UTC del 11 = 22:30 del 10 en Argentina
  assert.equal(diaArgentina(Date.UTC(2026, 10, 11, 1, 30)), "2026-11-10");
  assert.equal(horaArgentina(Date.UTC(2026, 10, 11, 1, 30)), "22:30");
  assert.equal(msDeDiaHora("2026-11-10", "14:02"), T);
  assert.equal(msDeDiaHora("2026-11-10", "x"), null);
});

test("PIN: exactamente 4 dígitos", () => {
  assert.ok(pinValido("0042"));
  assert.ok(!pinValido("123"));
  assert.ok(!pinValido("12345"));
  assert.ok(!pinValido("12a4"));
  assert.ok(!pinValido(1234));
});

test("decidirFichaje: sin turno abierto entra, con turno abierto sale", () => {
  assert.deepEqual(decidirFichaje({ ahora: T }), { tipo: "entrada", cerrarOlvidado: false });
  assert.deepEqual(decidirFichaje({ abiertoEntradaMs: T - 8 * H, ultimoMs: T - 8 * H, ahora: T }), { tipo: "salida", cerrarOlvidado: false });
});

test("decidirFichaje: un turno abierto de más de TURNO_MAX_HORAS es un olvido → entrada nueva", () => {
  const r = decidirFichaje({ abiertoEntradaMs: T - (TURNO_MAX_HORAS + 1) * H, ahora: T });
  assert.deepEqual(r, { tipo: "entrada", cerrarOlvidado: true });
  assert.ok(esOlvidado(T - TURNO_MAX_HORAS * H, T));
  assert.ok(!esOlvidado(T - TURNO_MAX_HORAS * H + 60000, T));
});

test("decidirFichaje: doble toque en menos de REPETIDO_SEG se rechaza", () => {
  assert.deepEqual(decidirFichaje({ abiertoEntradaMs: T - 10000, ultimoMs: T - 10000, ahora: T }), { error: "repetido" });
  assert.equal(decidirFichaje({ abiertoEntradaMs: T - REPETIDO_SEG * 1000, ultimoMs: T - REPETIDO_SEG * 1000, ahora: T }).tipo, "salida");
});

test("intentos: 5 PINs mal en 5 minutos bloquean; los viejos se olvidan", () => {
  const cuatro = [T - 4000, T - 3000, T - 2000, T - 1000];
  assert.deepEqual(evaluarIntentos(cuatro, T), { fallos: cuatro, bloqueado: false, esperaMin: 0, restantes: 1 });
  const cinco = [T - 4 * 60000, ...cuatro];
  const r = evaluarIntentos(cinco, T);
  assert.equal(r.bloqueado, true);
  assert.equal(r.esperaMin, 1); // el más viejo de los 5 sale de la ventana en 1 minuto
  assert.equal(evaluarIntentos([T - INTENTOS_VENTANA_MS - 1, ...cuatro], T).bloqueado, false);
  assert.equal(evaluarIntentos(null, T).restantes, INTENTOS_MAX);
});

test("validarTurnoManual: nota obligatoria, salida después de la entrada, nada en el futuro", () => {
  const ok = { entradaMs: T - 8 * H, salidaMs: T - H, nota: "Se olvidó de fichar", ahora: T };
  assert.equal(validarTurnoManual(ok), null);
  assert.match(validarTurnoManual({ ...ok, nota: " " }), /nota/);
  assert.match(validarTurnoManual({ ...ok, salidaMs: ok.entradaMs }), /después/);
  assert.match(validarTurnoManual({ ...ok, salidaMs: T + H }), /futuro/);
  assert.match(validarTurnoManual({ ...ok, entradaMs: T - 30 * H }), /24 horas/);
  assert.match(validarTurnoManual({ ...ok, salidaMs: null }), /salida/);
  assert.equal(validarTurnoManual({ ...ok, salidaMs: null, salidaOpcional: true }), null);
  assert.match(validarTurnoManual({ ...ok, entradaMs: NaN }), /entrada/);
});

test("minutosDeTurno: cerrado, abierto (en curso) y olvidado", () => {
  assert.equal(minutosDeTurno({ entrada: T - 2 * H, salida: T, minutos: 120 }, T), 120);
  assert.equal(minutosDeTurno({ entrada: T - 90 * 60000, salida: null }, T), 90);
  assert.equal(minutosDeTurno({ entrada: T - 20 * H, salida: T, minutos: 0, sinSalida: true }, T), 0);
  // Timestamps de Firestore (toMillis)
  assert.equal(minutosDeTurno({ entrada: { toMillis: () => T - H }, salida: { toMillis: () => T } }, T), 60);
});

const turnos = [
  { empleadoId: "a", nombre: "Juan", entrada: msDeDiaHora("2026-11-09", "18:00"), salida: msDeDiaHora("2026-11-10", "02:00"), minutos: 480 },
  { empleadoId: "a", nombre: "Juan", entrada: msDeDiaHora("2026-11-10", "18:00"), salida: msDeDiaHora("2026-11-10", "22:30"), minutos: 270 },
  { empleadoId: "b", nombre: "Ana", entrada: msDeDiaHora("2026-11-10", "10:00"), salida: null },
  { empleadoId: "b", nombre: "Ana", entrada: msDeDiaHora("2026-11-02", "10:00"), salida: msDeDiaHora("2026-11-03", "04:00"), minutos: 0, sinSalida: true },
];

test("agruparHoras por día: el turno que pasa la medianoche cuenta en el día de entrada", () => {
  const ahora = msDeDiaHora("2026-11-10", "14:02");
  const filas = agruparHoras(turnos, { por: "dia", ahora });
  const juan9 = filas.find((f) => f.empleadoId === "a" && f.clave === "2026-11-09");
  assert.equal(juan9.minutos, 480);
  const ana10 = filas.find((f) => f.empleadoId === "b" && f.clave === "2026-11-10");
  assert.equal(ana10.minutos, 242); // en curso desde las 10:00
  assert.equal(ana10.abiertos, 1);
  assert.equal(filas[0].clave, "2026-11-02");
});

test("agruparHoras por semana (lunes) y por mes", () => {
  const ahora = msDeDiaHora("2026-11-10", "14:02");
  const semanas = agruparHoras(turnos, { por: "semana", ahora });
  assert.deepEqual(
    semanas.map((f) => [f.nombre, f.clave, f.minutos, f.sinSalida]),
    [
      ["Ana", "2026-11-02", 0, 1],
      ["Ana", "2026-11-09", 242, 0],
      ["Juan", "2026-11-09", 750, 0],
    ],
  );
  const meses = agruparHoras(turnos, { por: "mes", ahora });
  assert.deepEqual(meses.map((f) => [f.nombre, f.clave, f.turnos]), [["Ana", "2026-11", 2], ["Juan", "2026-11", 2]]);
  const tot = totalesPorEmpleado(turnos, ahora);
  assert.deepEqual(tot.map((t) => [t.nombre, t.minutos, t.sinSalida, t.abiertos]), [["Juan", 750, 0, 0], ["Ana", 242, 1, 1]]);
});

test("períodos: semana de lunes a domingo, mes completo, mover", () => {
  assert.equal(lunesDe("2026-11-10"), "2026-11-09");
  assert.equal(lunesDe("2026-11-15"), "2026-11-09"); // domingo
  assert.equal(lunesDe("2026-11-09"), "2026-11-09");
  const s = rangoPeriodo("semana", "2026-11-10");
  assert.deepEqual([s.desde, s.hasta], ["2026-11-09", "2026-11-15"]);
  assert.equal(s.hastaMs - s.desdeMs, 7 * 24 * H);
  const m = rangoPeriodo("mes", "2026-02-10");
  assert.deepEqual([m.desde, m.hasta], ["2026-02-01", "2026-02-28"]);
  const d = rangoPeriodo("dia", "2026-11-10");
  assert.equal(d.desdeMs, Date.parse("2026-11-10T03:00:00Z"));
  assert.equal(moverPeriodo("mes", "2026-12-31", 1), "2027-01-01");
  assert.equal(moverPeriodo("semana", "2026-11-10", -1), "2026-11-03");
  assert.equal(moverPeriodo("dia", "2026-11-30", 1), "2026-12-01");
});

test("formatos de horas", () => {
  assert.equal(formatMinutos(425), "7 h 05 min");
  assert.equal(formatMinutos(45), "45 min");
  assert.equal(formatMinutos(-3), "0 min");
  assert.equal(horasDecimales(425), 7.08);
});

test("CSV: una fila por turno, salida de otro día con fecha, olvidos y en curso marcados", () => {
  const ahora = msDeDiaHora("2026-11-10", "14:02");
  const filas = filasCsvFichajes(turnos, ahora);
  assert.deepEqual(filas[0], ["Empleado", "Fecha", "Entrada", "Salida", "Minutos", "Horas", "Origen", "Sin salida", "Nota"]);
  assert.equal(filas.length, 5);
  assert.deepEqual(filas[1].slice(0, 8), ["Ana", "2026-11-02", "10:00", "2026-11-03 04:00", 0, 0, "", "Sí"]);
  assert.deepEqual(filas[2].slice(0, 6), ["Juan", "2026-11-09", "18:00", "2026-11-10 02:00", 480, 8]);
  assert.equal(filas[3][7], "En curso");
  assert.equal(nombreArchivoFichajes("Club Pádel Central", "2026-11-01", "2026-11-30"), "padely-fichajes-club-padel-central-2026-11-01-2026-11-30.csv");
});
