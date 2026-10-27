// node --test src/utils/fixture.test.js — motor de torneos (P3-11)
globalThis.process.env.TZ = "America/Argentina/Buenos_Aires";
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { calcularTabla, getGanador } from "./torneo.js";
import { avanzarGanadores, emparejarConByes, esBye, generarFixtureRoundRobin, generarPartidos, generarRondas, nuevoPartido, obtenerCampeonYSub, seedsDesdeGrupos, siguientePotenciaDe2, validarSets } from "./fixture.js";
import { getTodayLocal } from "./formatDate.js";

const P = (n) => ({ id: `P${n}`, jugador1: `A${n}`, jugador2: `B${n}` });
const res = (...sets) => ({ sets: sets.map(([g1, g2, tb1, tb2]) => (tb1 === undefined ? { g1, g2 } : { g1, g2, tb1, tb2 })) });

test("getGanador: sets, tiebreak y empate", () => {
  assert.equal(getGanador(null), null);
  assert.equal(getGanador(res([6, 3])), 1);
  assert.equal(getGanador(res([3, 6], [6, 4], [4, 6])), 2);
  assert.equal(getGanador(res([6, 6, 7, 5])), 1, "6-6 con tiebreak 7-5");
  assert.equal(getGanador(res([6, 6, 3, 7])), 2);
  assert.equal(getGanador(res([6, 4], [4, 6])), null, "1-1 sin tercer set: no hay ganador");
});

test("calcularTabla: puntos, diferencia de sets y games; un resultado sin ganador no cuenta", () => {
  const [a, b, c] = [P(1), P(2), P(3)];
  const grupo = {
    parejas: [a, b, c],
    partidos: [
      { pareja1: a, pareja2: b, resultado: res([6, 2], [6, 3]) },
      { pareja1: b, pareja2: c, resultado: res([6, 6, 7, 4], [6, 4]) },
      { pareja1: a, pareja2: c, resultado: res([6, 4], [4, 6]) }, // a medias: no cuenta
    ],
  };
  const t = calcularTabla(grupo);
  assert.deepEqual(t.map((f) => f.id), ["P1", "P2", "P3"]);
  const fila = Object.fromEntries(t.map((f) => [f.id, f]));
  assert.equal(fila.P1.pg, 1);
  assert.equal(fila.P1.pj, 1, "el partido a medias no suma partido jugado");
  assert.equal(fila.P3.pp, 1);
  assert.equal(fila.P3.pg, 0, "antes el partido sin ganador le daba la victoria a la pareja 2");
  assert.equal(fila.P2.gf, 7 + 6 + 2 + 3, "el set de tiebreak cuenta 7-6");
  assert.equal(t[0].id, "P1", "P1 y P2 con 1 victoria: desempata la diferencia de sets (2-0 vs 2-2)");
});

test("round robin: todos contra todos una vez, nadie contra sí mismo, sin repetir pareja en una fecha", () => {
  for (const n of [2, 3, 4, 5, 6, 7, 8, 9]) {
    const parejas = Array.from({ length: n }, (_, i) => P(i + 1));
    const fechas = generarFixtureRoundRobin(parejas);
    const todos = fechas.flat();
    assert.equal(todos.length, (n * (n - 1)) / 2, `${n} parejas`);
    assert.equal(fechas.length, n % 2 === 0 ? n - 1 : n);
    assert.ok(todos.every((m) => m.pareja1.id !== m.pareja2.id), `${n}: nadie juega contra sí mismo`);
    assert.equal(new Set(todos.map((m) => [m.pareja1.id, m.pareja2.id].sort().join("-"))).size, todos.length, `${n}: sin cruces repetidos`);
    for (const f of fechas) {
      const ids = f.flatMap((m) => [m.pareja1.id, m.pareja2.id]);
      assert.equal(new Set(ids).size, ids.length, `${n}: una pareja juega una vez por fecha`);
    }
    assert.ok(todos.every((m) => m.fecha >= 1 && m.fecha <= fechas.length));
  }
  assert.equal(generarPartidos([P(1), P(2), P(3), P(4)]).length, 6);
});

test("cuadro: potencia de 2, byes para las mejores semillas y rondas", () => {
  assert.equal(siguientePotenciaDe2(1), 1);
  assert.equal(siguientePotenciaDe2(5), 8);
  assert.equal(siguientePotenciaDe2(8), 8);
  const seeds = [1, 2, 3, 4, 5].map(P);
  const primera = emparejarConByes(seeds);
  assert.equal(primera.length, 4);
  assert.deepEqual(primera.map((m) => [m.pareja1?.id ?? null, m.pareja2?.id ?? null]), [["P1", null], ["P2", null], ["P3", null], ["P4", "P5"]]);
  const rondas = generarRondas(primera);
  assert.deepEqual(rondas.map((r) => r.length), [4, 2, 1]);
  assert.equal(esBye(rondas, 0, 0), true);
  assert.equal(esBye(rondas, 0, 3), false);
  const avanzadas = avanzarGanadores(rondas);
  assert.equal(avanzadas[1][0].pareja1.id, "P1", "el bye pasa solo");
  assert.equal(avanzadas[1][0].pareja2.id, "P2");
  assert.equal(avanzadas[1][1].pareja1.id, "P3");
  assert.equal(avanzadas[1][1].pareja2, null, "P4-P5 todavía no se jugó");
});

test("cuadro: semillas de grupos evitan cruces del mismo grupo en primera ronda", () => {
  const g = (nombre, ps) => ({ nombre, parejas: ps, partidos: [{ pareja1: ps[0], pareja2: ps[1], resultado: res([6, 1], [6, 1]) }] });
  const grupos = [g("A", [P(1), P(2)]), g("B", [P(3), P(4)])];
  const seeds = seedsDesdeGrupos(grupos, 2);
  assert.deepEqual(seeds.map((s) => `${s.grupo}${s.posGrupo}`), ["A1", "B1", "A2", "B2"]);
  const cruces = emparejarConByes(seeds);
  assert.ok(cruces.every((m) => m.pareja1.grupo !== m.pareja2.grupo), "A1-B2 y B1-A2");
});

test("avance y campeón: un resultado sin ganador no hace avanzar a nadie", () => {
  const final = [[{ ...nuevoPartido(P(1), P(2)), resultado: res([6, 4], [4, 6]) }]];
  const semis = [{ ...nuevoPartido(P(1), P(4)), resultado: res([6, 4], [4, 6]) }, { ...nuevoPartido(P(2), P(3)), resultado: res([6, 0]) }];
  const r = avanzarGanadores([semis, [nuevoPartido(null, null)]]);
  assert.equal(r[1][0].pareja1, null, "1-1 no define a nadie (antes pasaba la pareja 2)");
  assert.equal(r[1][0].pareja2.id, "P2");
  assert.equal(obtenerCampeonYSub(final), null);
  const definida = [[{ ...nuevoPartido(P(1), P(2)), resultado: res([6, 4], [3, 6], [7, 5]) }]];
  assert.deepEqual(Object.fromEntries(Object.entries(obtenerCampeonYSub(definida)).map(([k, v]) => [k, v.id])), { campeon: "P1", subcampeon: "P2" });
});

test("validarSets: reglas de cada set y que alguien gane", () => {
  const v = (sets, tbs = [], cantSets = 3) => validarSets(sets.map(([g1, g2]) => ({ g1, g2 })), tbs, { gamesPorSet: 6, cantSets });
  assert.equal(v([[6, 3], [6, 4]]), null);
  assert.equal(v([[6, 3]], [], 1), null);
  assert.match(v([[5, 3]]), /al menos un equipo debe alcanzar 6/);
  assert.match(v([[6, 5]]), /no puede terminar 6-5/);
  assert.match(v([[7, 6]]), /activar el tiebreak/);
  assert.equal(v([[6, 6], [6, 2]], [{ activo: true, tb1: 7, tb2: 4 }]), null);
  assert.match(v([[6, 6]], [{ activo: true, tb1: 5, tb2: 5 }], 1), /tiebreak no puede terminar empatado/);
  assert.match(v([[8, 6]]), /no es válido/);
  assert.equal(v([[7, 5], [6, 0]]), null);
  assert.match(v([[6, 4], [4, 6]]), /Falta definir el partido/, "1-1 sin tercer set ya no se guarda sin ganador");
  assert.equal(v([[6, 4], [4, 6], [6, 1]]), null);
  assert.equal(v([[6, 4], [6, 1], [0, 0]]), null, "el tercer set vacío se ignora si ya hay ganador");
  assert.equal(v([]), "Cargá al menos un set");
});

test("getTodayLocal: la fecha argentina aunque en UTC ya sea mañana", () => {
  mock.timers.enable({ apis: ["Date"], now: Date.UTC(2026, 9, 27, 2, 30) }); // 26/10 23:30 en Argentina
  try {
    assert.equal(getTodayLocal(), "2026-10-26");
  } finally {
    mock.timers.reset();
  }
});
