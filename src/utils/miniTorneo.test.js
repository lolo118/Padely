// node --test src/utils/miniTorneo.test.js — mini torneo dentro de un turno
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aplicarResultado,
  armarMiniTorneo,
  armarParejas,
  elegirFormatoAuto,
  estimarMinutos,
  formatosPosibles,
  generarAmericano,
  hayNiveles,
  minutosDelTurno,
  minutosPorPartido,
  nombresCortos,
  partidosPorJugadorAmericano,
  partidosPorRonda,
  podio,
  prepararJugadores,
  progreso,
  rondasAmericanoCompleto,
  rondasDeLlave,
  resultadoDe,
  sugerirPartido,
  tablaAmericano,
  tablaParejas,
  tandas,
  terminado,
  validarJugadores,
  validarResultado,
} from "./miniTorneo.js";

const ids = (n) => Array.from({ length: n }, (_, i) => `j${i + 1}`);
const jugadores = (n, niveles = []) => prepararJugadores(Array.from({ length: n }, (_, i) => ({ nombre: `Jugador${i + 1} Apellido`, nivel: niveles[i] || null })));
const clave = (a, b) => [a, b].sort().join("|");

function analizar(rondas) {
  const companeros = {};
  const jugados = {};
  let seguidos = 0;
  let previo = new Set();
  rondas.forEach((r) => {
    const enRonda = r.partidos.flatMap((p) => [...p.equipo1, ...p.equipo2]);
    assert.equal(new Set(enRonda).size, enRonda.length, `ronda ${r.numero}: nadie juega dos partidos a la vez`);
    r.descansan.forEach((x) => assert.ok(!enRonda.includes(x), "quien descansa no juega"));
    r.partidos.forEach((p) => {
      [p.equipo1, p.equipo2].forEach((e) => {
        assert.equal(e.length, 2);
        companeros[clave(e[0], e[1])] = (companeros[clave(e[0], e[1])] || 0) + 1;
      });
      enRonda.forEach((x) => (jugados[x] = (jugados[x] || 0) + (p.equipo1.includes(x) || p.equipo2.includes(x) ? 1 : 0)));
    });
    r.descansan.forEach((x) => previo.has(x) && seguidos++);
    previo = new Set(r.descansan);
  });
  return { companeros, jugados, seguidos };
}

test("americano con 4: 3 rondas y cada uno juega una vez con cada otro", () => {
  const { rondas } = generarAmericano(ids(4), { seed: 3 });
  assert.equal(rondas.length, 3);
  const { companeros, jugados } = analizar(rondas);
  assert.equal(Object.keys(companeros).length, 6);
  Object.values(companeros).forEach((v) => assert.equal(v, 1));
  Object.values(jugados).forEach((v) => assert.equal(v, 3));
});

test("americano con 5 (una cancha) y con 8 (dos canchas): todos los compañeros exactamente una vez", () => {
  for (const [n, canchas] of [
    [5, 1],
    [8, 2],
    [8, 1],
    [9, 2],
  ]) {
    const { rondas } = generarAmericano(ids(n), { canchas, seed: 11 });
    const { companeros } = analizar(rondas);
    assert.equal(Object.keys(companeros).length, (n * (n - 1)) / 2, `n=${n}`);
    Object.values(companeros).forEach((v) => assert.equal(v, 1, `n=${n}`));
  }
});

test("americano 4 a 16 jugadores y 1 a 4 canchas: todos juegan, parejo, sin descansos seguidos evitables", () => {
  for (let n = 4; n <= 16; n++) {
    for (const canchas of [1, 2, 3, 4]) {
      const { rondas } = generarAmericano(ids(n), { canchas, seed: n * 10 + canchas });
      const m = partidosPorRonda(n, canchas);
      assert.equal(rondas.length, rondasAmericanoCompleto(n, canchas));
      rondas.forEach((r) => {
        assert.equal(r.partidos.length, m);
        assert.equal(r.descansan.length, n - 4 * m);
      });
      const { companeros, jugados, seguidos } = analizar(rondas);
      assert.equal(Object.keys(jugados).length, n, `n=${n} c=${canchas}: juegan todos`);
      const cant = Object.values(jugados);
      assert.ok(Math.max(...cant) - Math.min(...cant) <= 1, `n=${n} c=${canchas}: partidos parejos`);
      assert.ok(Math.max(...Object.values(companeros)) <= 2, `n=${n} c=${canchas}: nadie repite compañero más de una vez`);
      // Cubre (casi) todos los compañeros posibles
      assert.ok(Object.keys(companeros).length >= 0.85 * ((n * (n - 1)) / 2), `n=${n} c=${canchas}: variedad de compañeros`);
      if (2 * (n - 4 * m) < n) assert.equal(seguidos, 0, `n=${n} c=${canchas}: nadie descansa dos rondas seguidas`);
    }
  }
});

test("americano: misma semilla, mismo fixture; rondas pedidas", () => {
  assert.deepEqual(generarAmericano(ids(7), { seed: 5 }), generarAmericano(ids(7), { seed: 5 }));
  assert.equal(generarAmericano(ids(6), { rondas: 3 }).rondas.length, 3);
  assert.throws(() => generarAmericano(ids(3)));
  assert.throws(() => generarAmericano(ids(17)));
});

test("nombres: solo el de pila; con inicial si se repite", () => {
  assert.deepEqual(nombresCortos(["juan pérez", "Juan Gómez", "Ana", "ana", "Luz María López"]), ["Juan P.", "Juan G.", "Ana", "Ana 2", "Luz"]);
  const js = prepararJugadores([{ nombre: "Martín Díaz", uid: "u1", nivel: "6ta" }, { nombre: "  " }, { nombre: "Sofi" }]);
  assert.deepEqual(js.map((j) => [j.id, j.nombre, j.nivel, j.uid]), [
    ["j1", "Martín", "6ta", "u1"],
    ["j2", "Sofi", null, null],
  ]);
});

test("validarJugadores: 4 a 16 y sin repetidos", () => {
  assert.match(validarJugadores(jugadores(3)), /al menos 4/);
  assert.match(validarJugadores(jugadores(17)), /máximo 16/);
  assert.equal(validarJugadores(jugadores(4)), null);
  assert.match(validarJugadores([{ uid: "a" }, { uid: "a" }, {}, {}]), /repetido/);
});

test("parejas al azar: cada jugador en una sola pareja", () => {
  const js = jugadores(8);
  const parejas = armarParejas(js, { seed: 2 });
  assert.equal(parejas.length, 4);
  const usados = parejas.flatMap((p) => p.jugadores);
  assert.equal(new Set(usados).size, 8);
  assert.match(parejas[0].nombrePareja, / \/ /);
  assert.throws(() => armarParejas(jugadores(5)));
});

test("parejas por nivel: el mejor con el más flojo; sin nivel cuenta el promedio", () => {
  const js = jugadores(4, ["2da", "8va", "4ta", "6ta"]);
  assert.ok(hayNiveles(js));
  const parejas = armarParejas(js, { criterio: "nivel", seed: 1 });
  const juntos = parejas.map((p) => p.jugadores.slice().sort().join("+")).sort();
  // 2da (j1) con 8va (j2); 4ta (j3) con 6ta (j4)
  assert.deepEqual(juntos, ["j1+j2", "j3+j4"]);
  assert.ok(!hayNiveles(jugadores(4, ["6ta"])));
});

test("tiempo: minutos del turno (pasa la medianoche) y de cada partido", () => {
  assert.equal(minutosDelTurno("20:00", "22:00"), 120);
  assert.equal(minutosDelTurno("23:00", "01:00"), 120);
  assert.equal(minutosDelTurno("", "", 2), 120);
  assert.equal(minutosPorPartido({ tipo: "minutos", valor: 15 }), 17);
  assert.ok(minutosPorPartido({ tipo: "games", valor: 6 }) > minutosPorPartido({ tipo: "games", valor: 4 }));
});

test("tandas: round robin, eliminación con byes y grupos", () => {
  assert.equal(tandas("roundRobin", 8, 1), 6, "4 parejas: 6 partidos en una cancha");
  assert.equal(tandas("roundRobin", 8, 2), 3, "en dos canchas, 3 fechas");
  assert.equal(tandas("eliminacion", 12, 1), 5, "6 parejas: 2 de primera ronda (2 byes) + 2 semis + final");
  assert.equal(tandas("grupos", 10, 1), 3 + 1 + 1, "5 parejas: 3+1 partidos de grupo y la final");
  assert.equal(tandas("americano", 4, 1), 3);
});

test("sugerirPartido: entra en el turno, y si no, cronometrado o menos rondas", () => {
  const corto = sugerirPartido("americano", 4, 1, 120);
  assert.deepEqual(corto.partidoA, { tipo: "games", valor: 6 });
  assert.ok(corto.entra && corto.estimacionMin <= 120);
  assert.deepEqual(sugerirPartido("americano", 4, 1, 90).partidoA, { tipo: "games", valor: 4 }, "con menos tiempo, a menos games");
  const justo = sugerirPartido("americano", 8, 2, 90);
  assert.ok(justo.entra && justo.estimacionMin <= 90);
  // 16 jugadores en una cancha y 60 minutos: no entra la vuelta completa; menos rondas, todos juegan lo mismo
  const largo = sugerirPartido("americano", 16, 1, 60);
  assert.equal(largo.partidoA.tipo, "minutos");
  assert.ok(largo.rondas < rondasAmericanoCompleto(16, 1));
  const pj = partidosPorJugadorAmericano(16, 1, largo.rondas);
  assert.ok(pj.min >= 1);
  assert.equal(pj.min, pj.max, "misma cantidad de partidos para todos");
});

test("elegirFormatoAuto: americano con impares, pocos o canchas de sobra; grupos o eliminación con muchas parejas", () => {
  assert.equal(elegirFormatoAuto({ n: 4 }).formato, "americano");
  assert.equal(elegirFormatoAuto({ n: 7 }).formato, "americano");
  assert.equal(elegirFormatoAuto({ n: 12, canchas: 3, minutos: 120 }).formato, "americano");
  assert.equal(elegirFormatoAuto({ n: 12, canchas: 1, minutos: 240 }).formato, "grupos");
  assert.equal(elegirFormatoAuto({ n: 16, canchas: 1, minutos: 60 }).formato, "eliminacion");
  assert.ok(elegirFormatoAuto({ n: 6 }).motivo.length > 0);
});

test("formatosPosibles: parejas solo con número par", () => {
  assert.deepEqual(formatosPosibles(5), ["americano"]);
  assert.deepEqual(formatosPosibles(8), ["americano", "roundRobin", "eliminacion"]);
  assert.deepEqual(formatosPosibles(12), ["americano", "roundRobin", "grupos", "eliminacion"]);
  assert.deepEqual(formatosPosibles(16), ["americano", "grupos", "eliminacion"]);
});

test("validarResultado: a N games, cronometrado y empates", () => {
  const a6 = { tipo: "games", valor: 6 };
  assert.equal(validarResultado({ g1: 6, g2: 3 }, a6), null);
  assert.equal(validarResultado({ g1: 5, g2: 6 }, a6), null);
  assert.match(validarResultado({ g1: 5, g2: 3 }, a6), /llega a 6/);
  assert.match(validarResultado({ g1: 7, g2: 3 }, a6), /llega a 6/);
  assert.match(validarResultado({ g1: "", g2: 3 }, a6), /Cargá/);
  const t = { tipo: "minutos", valor: 15 };
  assert.equal(validarResultado({ g1: 4, g2: 3 }, t), null);
  assert.match(validarResultado({ g1: 3, g2: 3 }, t), /punto de oro/);
  assert.equal(validarResultado({ g1: 3, g2: 3 }, t, { permiteEmpate: true }), null);
});

test("americano completo: tabla individual por games y podio al terminar", () => {
  const js = jugadores(4);
  const plan = armarMiniTorneo({ jugadores: js, modo: "auto", horaInicio: "20:00", horaFin: "21:30", seed: 4 });
  assert.equal(plan.formato, "americano");
  assert.equal(plan.partidos.length, 3);
  assert.ok(plan.entra);
  let mini = { ...plan, jugadores: js };
  assert.equal(podio(mini), null);
  // j1 gana todos 6-2
  for (const p of plan.partidos) {
    const j1Arriba = p.equipo1.includes("j1");
    const r = aplicarResultado(mini, p.id, j1Arriba ? resultadoDe(6, 2) : resultadoDe(2, 6));
    mini = { ...mini, ...r };
  }
  assert.equal(mini.estado, "finalizado");
  const tabla = tablaAmericano(mini);
  assert.equal(tabla[0].id, "j1");
  assert.equal(tabla[0].pts, 18);
  assert.equal(tabla[0].pg, 3);
  assert.equal(podio(mini)[0].nombre, "Jugador1");
  assert.deepEqual(progreso(mini), { hechos: 3, total: 3 });
});

test("parejas todos contra todos (manual): fixture del motor y tabla con calcularTabla", () => {
  const js = jugadores(8);
  const plan = armarMiniTorneo({
    jugadores: js,
    modo: "manual",
    formato: "roundRobin",
    parejas: [
      ["j1", "j2"],
      ["j3", "j4"],
      ["j5", "j6"],
      ["j7", "j8"],
    ],
    canchas: 2,
    partidoA: { tipo: "games", valor: 4 },
    horaInicio: "18:00",
    horaFin: "20:00",
  });
  assert.equal(plan.partidos.length, 6);
  assert.deepEqual(plan.partidoA, { tipo: "games", valor: 4 });
  assert.deepEqual([...new Set(plan.partidos.map((p) => p.cancha))].sort(), [1, 2]);
  let mini = { ...plan, jugadores: js };
  // p1 gana todo; p2 le gana a p3 y p4; p3 a p4
  const rank = { p1: 4, p2: 3, p3: 2, p4: 1 };
  plan.partidos.forEach((p) => {
    const gana1 = rank[p.pareja1.id] > rank[p.pareja2.id];
    mini = { ...mini, ...aplicarResultado(mini, p.id, gana1 ? resultadoDe(4, 1) : resultadoDe(1, 4)) };
  });
  assert.ok(terminado(mini));
  assert.deepEqual(tablaParejas(mini).map((r) => r.id), ["p1", "p2", "p3", "p4"]);
  assert.equal(podio(mini)[0].nombre, "Jugador1 / Jugador2");
  assert.throws(() => armarMiniTorneo({ jugadores: js, modo: "manual", formato: "roundRobin", parejas: [["j1", "j1"]], horaInicio: "18:00", horaFin: "20:00" }));
});

test("grupos y final: 5 parejas, al completar los grupos se arma la final con los primeros", () => {
  const js = jugadores(10);
  const plan = armarMiniTorneo({ jugadores: js, modo: "manual", formato: "grupos", criterio: "azar", partidoA: { tipo: "games", valor: 4 }, horaInicio: "18:00", horaFin: "21:00", seed: 9 });
  assert.equal(plan.grupos.length, 2);
  assert.deepEqual(plan.grupos.map((g) => g.parejas.length), [3, 2]);
  assert.equal(plan.partidos.length, 1 + 3);
  assert.equal(plan.llave, null);
  let mini = { ...plan, jugadores: js };
  // gana siempre la pareja 1 del partido
  plan.partidos.forEach((p, i) => {
    mini = { ...mini, ...aplicarResultado(mini, p.id, resultadoDe(4, i)) };
  });
  assert.ok(mini.llave, "con los grupos completos aparece el cuadro");
  const final = rondasDeLlave(mini.llave).at(-1)[0];
  assert.ok(final.pareja1 && final.pareja2);
  assert.notEqual(final.pareja1.grupo, final.pareja2.grupo, "la final cruza los grupos");
  assert.equal(final.pareja1.id, tablaParejas(mini, final.pareja1.grupo)[0].id);
  // Con el cuadro empezado, los grupos quedan fijos
  mini = { ...mini, ...aplicarResultado(mini, final.id, resultadoDe(2, 4)) };
  assert.equal(mini.estado, "finalizado");
  assert.match(aplicarResultado(mini, plan.partidos[0].id, null).error, /quedan fijos/);
  assert.equal(podio(mini)[0].nombre, final.pareja2.nombrePareja);
});

test("eliminación directa: 6 parejas con byes; borrar una semi limpia la final; podio con 3° compartido", () => {
  const js = jugadores(12);
  const plan = armarMiniTorneo({ jugadores: js, modo: "manual", formato: "eliminacion", criterio: "azar", partidoA: { tipo: "games", valor: 4 }, horaInicio: "18:00", horaFin: "20:00", seed: 1 });
  let mini = { ...plan, jugadores: js };
  let rondas = rondasDeLlave(mini.llave);
  assert.equal(rondas.length, 3, "cuartos (con 2 byes), semis y final");
  // Los byes ya pasaron a semis
  assert.equal(rondas[1].flatMap((p) => [p.pareja1, p.pareja2]).filter(Boolean).length, 2);
  assert.ok(rondas[1].every((p) => !(p.pareja1 && p.pareja2)), "las dos mejores semillas no se cruzan en semis");
  const jugar = () => {
    for (let ri = 0; ri < 3; ri++) {
      rondasDeLlave(mini.llave)[ri].forEach((p) => {
        if (p.pareja1 && p.pareja2 && !p.resultado) mini = { ...mini, ...aplicarResultado(mini, p.id, resultadoDe(4, 2)) };
      });
    }
  };
  jugar();
  assert.equal(mini.estado, "finalizado");
  const lista = podio(mini);
  assert.deepEqual(lista.map((x) => x.puesto), [1, 2, 3, 3]);
  // Borrar una semi: la final pierde a esa pareja y su resultado
  const semi = rondasDeLlave(mini.llave)[1][0];
  mini = { ...mini, ...aplicarResultado(mini, semi.id, null) };
  rondas = rondasDeLlave(mini.llave);
  assert.equal(rondas[2][0].resultado, null);
  assert.equal(mini.estado, "en_curso");
  assert.match(aplicarResultado(mini, rondas[2][0].id, resultadoDe(4, 1)).error, /rivales/);
});

test("armarMiniTorneo automático con 12 jugadores y 2 horas: entra en el turno", () => {
  const plan = armarMiniTorneo({ jugadores: jugadores(12), modo: "auto", horaInicio: "20:00", horaFin: "22:00", canchas: 1, seed: 3 });
  assert.ok(["grupos", "eliminacion"].includes(plan.formato));
  assert.ok(plan.entra, `estimación ${plan.estimacionMin} en ${plan.minutosTurno}`);
  assert.equal(plan.estimacionMin, estimarMinutos(plan.formato, 12, 1, plan.partidoA));
  const conNivel = armarMiniTorneo({ jugadores: jugadores(4, ["2da", "8va", "4ta", "6ta"]), modo: "manual", formato: "roundRobin", horaInicio: "20:00", horaFin: "21:00" });
  assert.deepEqual(conNivel.parejas.map((p) => p.jugadores.slice().sort().join("+")).sort(), ["j1+j2", "j3+j4"], "con niveles, parejas balanceadas");
  assert.throws(() => armarMiniTorneo({ jugadores: jugadores(5), modo: "manual", formato: "roundRobin", horaInicio: "20:00", horaFin: "21:00" }), /no se puede/);
});
