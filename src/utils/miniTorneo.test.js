// node --test src/utils/miniTorneo.test.js — mini torneo dentro de un turno (parejas fijas)
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MIN_JUGADORES,
  MIN_PAREJAS,
  admiteTercerPuesto,
  aplicarResultado,
  armarMiniTorneo,
  armarParejas,
  cantidadDeGrupos,
  conocidosDelTurno,
  elegirFormatoAuto,
  estimarMinutos,
  evaluarFormato,
  formatosPosibles,
  hayNiveles,
  minimoEliminacion,
  minimoGrupos,
  minimoParejas,
  minimoTodosContraTodos,
  minutosDelTurno,
  minutosPorPartido,
  nombreDelCreador,
  nombresCortos,
  opcionesDeFormato,
  permiteEmpate,
  podio,
  prepararJugadores,
  progreso,
  repartirEnGrupos,
  rondasDeLlave,
  resultadoDe,
  siguientePartidoRey,
  sugerirPartido,
  tablaAmericano,
  tablaParejas,
  tamañosDeGrupos,
  tandas,
  tercerPuestoDe,
  terminado,
  textoContador,
  validarJugadores,
  validarResultado,
} from "./miniTorneo.js";

const jugadores = (n, niveles = []) => prepararJugadores(Array.from({ length: n }, (_, i) => ({ nombre: `Jugador${i + 1} Apellido`, nivel: niveles[i] || null })));
const turno = { horaInicio: "18:00", horaFin: "20:00" };
// Parejas en orden: j1+j2 = p1, j3+j4 = p2...
const enOrden = (n) => Array.from({ length: n / 2 }, (_, i) => [`j${2 * i + 1}`, `j${2 * i + 2}`]);

test("mínimos derivados de cada formato: 3 parejas en general, 6 para el torneo con grupos", () => {
  assert.equal(minimoTodosContraTodos(), 3, "con 2 parejas, todos contra todos es un solo partido");
  assert.equal(minimoEliminacion(), 3, "con 2 parejas, el cuadro es solo la final; con 3, una pasa con bye");
  assert.equal(minimoGrupos(), 6, "dos grupos de 3");
  assert.equal(minimoParejas("americanoParejas"), 3);
  assert.equal(minimoParejas("roundRobin"), 3);
  assert.equal(minimoParejas("eliminacion"), 3);
  assert.equal(minimoParejas("rey"), 3);
  assert.equal(minimoParejas("grupos"), 6);
  assert.equal(MIN_PAREJAS, 3);
  assert.equal(MIN_JUGADORES, 6);
});

test("formatosPosibles: solo parejas fijas, número par, mínimos por formato; el americano rotativo ya no se ofrece", () => {
  assert.deepEqual(formatosPosibles(4), []);
  assert.deepEqual(formatosPosibles(5), []);
  assert.deepEqual(formatosPosibles(6), ["americanoParejas", "roundRobin", "eliminacion", "rey"]);
  assert.deepEqual(formatosPosibles(7), []);
  assert.deepEqual(formatosPosibles(10), ["americanoParejas", "roundRobin", "eliminacion", "rey"]);
  assert.deepEqual(formatosPosibles(12), ["americanoParejas", "roundRobin", "grupos", "eliminacion", "rey"]);
  assert.deepEqual(formatosPosibles(12, 2), ["americanoParejas", "roundRobin", "grupos", "eliminacion"], "rey: una sola cancha");
  assert.deepEqual(formatosPosibles(16), ["americanoParejas", "roundRobin", "grupos", "eliminacion", "rey"]);
  assert.deepEqual(formatosPosibles(18), []);
  assert.equal(evaluarFormato("americano", 8).valido, false);
});

test("evaluarFormato: motivos cortos y explicaciones claras; opciones con estimación contra el turno", () => {
  assert.equal(evaluarFormato("grupos", 10).motivo, "desde 6 parejas: dos grupos de 3");
  assert.match(evaluarFormato("grupos", 10).explicacion, /Con 5 parejas/);
  assert.equal(evaluarFormato("roundRobin", 4).motivo, "desde 3 parejas: con 2 parejas es un solo partido");
  assert.equal(evaluarFormato("eliminacion", 4).motivo, "desde 3 parejas: con 2 parejas es solo la final");
  assert.match(evaluarFormato("roundRobin", 4).explicacion, /Faltan 2 jugadores para 3 parejas/);
  assert.equal(evaluarFormato("eliminacion", 7).motivo, "con número par");
  assert.equal(evaluarFormato("eliminacion", 7).explicacion, "Con 7 jugadores no se arman parejas: sumá uno o sacá uno.");
  assert.equal(evaluarFormato("rey", 8, 2).motivo, "con una sola cancha");
  const ops = opcionesDeFormato({ n: 8, canchas: 1, minutos: 90 });
  assert.deepEqual(ops.map((o) => o.formato), ["americanoParejas", "roundRobin", "grupos", "eliminacion", "rey"]);
  assert.equal(ops.find((o) => o.formato === "grupos").valido, false);
  ops.filter((o) => o.valido).forEach((o) => assert.ok(o.estimacionMin > 0 && typeof o.entra === "boolean" && o.ayuda, o.formato));
  const manual = opcionesDeFormato({ n: 8, canchas: 1, minutos: 90, partidoA: { tipo: "games", valor: 6 } });
  assert.equal(manual.find((o) => o.formato === "roundRobin").estimacionMin, estimarMinutos("roundRobin", 8, 1, { tipo: "games", valor: 6 }));
  assert.equal(admiteTercerPuesto("eliminacion", 6), false, "con 3 parejas una semi es bye");
  assert.equal(admiteTercerPuesto("eliminacion", 8), true);
  assert.equal(admiteTercerPuesto("roundRobin", 8), false);
});

test("textoContador: habla en parejas", () => {
  assert.equal(textoContador(1), "1 jugador · faltan 5 para 3 parejas");
  assert.equal(textoContador(4), "4 jugadores · 2 de 3 parejas mínimo");
  assert.equal(textoContador(5), "5 jugadores · falta 1 para 3 parejas");
  assert.equal(textoContador(6), "6 jugadores · 3 parejas");
  assert.equal(textoContador(7), "7 jugadores · sumá o sacá uno para armar parejas");
});

test("conocidosDelTurno: nunca 'Titular' como nombre, sin repetir al creador", () => {
  // La cuenta vieja sin nombre arma un titular "Titular" sin uid: si reservó el creador, es el creador
  assert.deepEqual(conocidosDelTurno({ participantes: [{ id: "titular", uid: null, nombre: "Titular", tipo: "titular" }], reserva: { jugadorUid: "yo" }, creadorUid: "yo", creadorNombre: "Jugador Test" }), []);
  const lista = conocidosDelTurno({
    participantes: [
      { id: "titular", uid: "yo", nombre: "Jugador Test", tipo: "titular" },
      { id: "a", uid: "u2", nombre: "Ana López", tipo: "jugador" },
      { id: "b", uid: null, nombre: "Beto", tipo: "invitado" },
      { id: "c", uid: null, nombre: "beto", tipo: "invitado" },
      { id: "d", uid: null, nombre: "Invitado", tipo: "invitado" },
      { id: "e", uid: "u3", nombre: "Caro", tipo: "jugador", estado: "quitado" },
      { id: "f", uid: null, nombre: "Jugador Test", tipo: "invitado" },
    ],
    reserva: { jugadorUid: "yo", nombreJugador: "Jugador Test" },
    creadorUid: "yo",
    creadorNombre: "Jugador Test",
  });
  assert.deepEqual(lista.map((x) => x.nombre), ["Ana López", "Beto"]);
  // Reservó otro: aparece como sugerencia con su nombre (y no "Titular")
  const otro = conocidosDelTurno({ participantes: [], reserva: { jugadorUid: "u9", nombreJugador: "Fede Ruiz" }, creadorUid: "yo" });
  assert.deepEqual(otro, [{ clave: "r:u9", nombre: "Fede Ruiz", uid: "u9" }]);
  assert.deepEqual(conocidosDelTurno({ participantes: [], reserva: { jugadorUid: "u9", nombreJugador: "Titular" }, creadorUid: "yo" }), []);
  assert.equal(nombreDelCreador({ perfilNombre: "", displayName: "Titular", reserva: { jugadorUid: "yo", nombreJugador: "Juan" }, uid: "yo" }), "Juan");
});

test("nombres: solo el de pila; con inicial si se repite", () => {
  assert.deepEqual(nombresCortos(["juan pérez", "Juan Gómez", "Ana", "ana", "Luz María López"]), ["Juan P.", "Juan G.", "Ana", "Ana 2", "Luz"]);
  const js = prepararJugadores([{ nombre: "Martín Díaz", uid: "u1", nivel: "6ta" }, { nombre: "  " }, { nombre: "Sofi" }]);
  assert.deepEqual(js.map((j) => [j.id, j.nombre, j.nivel, j.uid]), [
    ["j1", "Martín", "6ta", "u1"],
    ["j2", "Sofi", null, null],
  ]);
});

test("validarJugadores: 6 a 16, par y sin repetidos", () => {
  assert.match(validarJugadores(jugadores(4)), /Faltan 2 jugadores para 3 parejas/);
  assert.match(validarJugadores(jugadores(7)), /sumá uno o sacá uno/);
  assert.match(validarJugadores(jugadores(18)), /máximo 16/);
  assert.equal(validarJugadores(jugadores(6)), null);
  assert.match(validarJugadores([{ uid: "a" }, { uid: "a" }, {}, {}, {}, {}]), /repetido/);
});

test("parejas al azar y por nivel", () => {
  const parejas = armarParejas(jugadores(8), { seed: 2 });
  assert.equal(parejas.length, 4);
  assert.equal(new Set(parejas.flatMap((p) => p.jugadores)).size, 8);
  assert.match(parejas[0].nombrePareja, / \/ /);
  assert.throws(() => armarParejas(jugadores(5)));
  const js = jugadores(4, ["2da", "8va", "4ta", "6ta"]);
  assert.ok(hayNiveles(js));
  const juntos = armarParejas(js, { criterio: "nivel", seed: 1 }).map((p) => p.jugadores.slice().sort().join("+")).sort();
  assert.deepEqual(juntos, ["j1+j2", "j3+j4"], "el mejor con el más flojo");
  assert.ok(!hayNiveles(jugadores(4, ["6ta"])));
});

test("grupos de 3 o 4 parejas, al menos 2", () => {
  assert.deepEqual(tamañosDeGrupos(6), [3, 3]);
  assert.deepEqual(tamañosDeGrupos(7).slice().sort(), [3, 4]);
  assert.deepEqual(tamañosDeGrupos(8), [4, 4]);
  assert.equal(cantidadDeGrupos(9), 3);
  assert.equal(cantidadDeGrupos(12), 3);
  const g = repartirEnGrupos(Array.from({ length: 6 }, (_, i) => ({ id: `p${i + 1}` })));
  assert.deepEqual(g.map((x) => x.parejas.map((p) => p.id)), [["p1", "p4", "p5"], ["p2", "p3", "p6"]], "zigzag por semilla");
});

test("tiempo: minutos del turno, de cada partido y tandas por formato", () => {
  assert.equal(minutosDelTurno("20:00", "22:00"), 120);
  assert.equal(minutosDelTurno("23:00", "01:00"), 120);
  assert.equal(minutosDelTurno("", "", 2), 120);
  assert.equal(minutosPorPartido({ tipo: "minutos", valor: 15 }), 17);
  assert.equal(tandas("roundRobin", 8, 1), 6, "4 parejas: 6 partidos en una cancha");
  assert.equal(tandas("americanoParejas", 8, 2), 3, "en dos canchas, 3 fechas");
  assert.equal(tandas("eliminacion", 12, 1), 5, "6 parejas: 2 de primera ronda (2 byes) + 2 semis + final");
  assert.equal(tandas("eliminacion", 12, 1, { tercerPuesto: true }), 6);
  assert.equal(tandas("eliminacion", 12, 2, { tercerPuesto: true }), 3, "en dos canchas, el 3° va con la final");
  assert.equal(tandas("eliminacion", 6, 1, { tercerPuesto: true }), 2, "con 3 parejas no hay 3° puesto");
  assert.equal(tandas("grupos", 12, 1), 3 + 3 + 2 + 1, "2 grupos de 3 (3 partidos cada uno), 2 semis y la final");
  assert.equal(tandas("grupos", 12, 2, { tercerPuesto: true }), 3 + 1 + 1);
  assert.equal(tandas("rey", 6, 1, { rondas: 9 }), 9);
});

test("sugerirPartido: el americano va a 6 games o por tiempo; los demás bajan de games antes de cronometrar", () => {
  const am = sugerirPartido("americanoParejas", 6, 1, 120);
  assert.ok(am.entra);
  assert.ok((am.partidoA.tipo === "games" && am.partidoA.valor === 6) || am.partidoA.tipo === "minutos");
  const amCorto = sugerirPartido("americanoParejas", 8, 1, 90);
  assert.equal(amCorto.partidoA.tipo, "minutos", "6 partidos a 6 games no entran en 90: por tiempo");
  assert.ok(amCorto.entra);
  const rr = sugerirPartido("roundRobin", 6, 1, 90);
  assert.equal(rr.partidoA.tipo, "games");
  assert.ok(rr.partidoA.valor < 6 && rr.entra);
  const rey = sugerirPartido("rey", 6, 1, 120);
  assert.ok(rey.rondas >= 6 && rey.entra, "al menos 2 partidos por pareja");
});

test("elegirFormatoAuto: siempre un formato de parejas válido para jugadores y canchas", () => {
  for (let n = 6; n <= 16; n += 2) {
    for (const canchas of [1, 2, 3, 4]) {
      for (const minutos of [60, 90, 120, 180]) {
        const { formato, motivo } = elegirFormatoAuto({ n, canchas, minutos });
        assert.ok(evaluarFormato(formato, n, canchas).valido, `${formato} con ${n} jugadores y ${canchas} canchas`);
        assert.ok(motivo);
      }
    }
  }
  assert.equal(elegirFormatoAuto({ n: 6, canchas: 1, minutos: 120 }).formato, "roundRobin");
  assert.equal(elegirFormatoAuto({ n: 12, canchas: 2, minutos: 120 }).formato, "grupos");
  assert.equal(elegirFormatoAuto({ n: 16, canchas: 1, minutos: 60 }).formato, "eliminacion");
  assert.equal(elegirFormatoAuto({ n: 7 }).formato, null);
});

test("validarResultado y empates: solo el americano (cuenta games) acepta empate por tiempo", () => {
  const a6 = { tipo: "games", valor: 6 };
  assert.equal(validarResultado({ g1: 6, g2: 3 }, a6), null);
  assert.match(validarResultado({ g1: 5, g2: 3 }, a6), /llega a 6/);
  assert.match(validarResultado({ g1: "", g2: 3 }, a6), /Cargá/);
  const t = { tipo: "minutos", valor: 15 };
  assert.match(validarResultado({ g1: 3, g2: 3 }, t), /punto de oro/);
  assert.equal(validarResultado({ g1: 3, g2: 3 }, t, { permiteEmpate: true }), null);
  assert.equal(permiteEmpate({ formato: "americanoParejas" }, { fase: "rr" }), true);
  assert.equal(permiteEmpate({ formato: "roundRobin" }, { fase: "rr" }), false);
  assert.equal(permiteEmpate({ formato: "americano" }, { fase: "americano" }), true);
});

test("americano de parejas fijas: todos contra todos, tabla por games (no por partidos ganados)", () => {
  const js = jugadores(6);
  const plan = armarMiniTorneo({ jugadores: js, modo: "manual", formato: "americanoParejas", parejas: enOrden(6), partidoA: { tipo: "minutos", valor: 15 }, ...turno });
  assert.equal(plan.partidos.length, 3);
  let mini = { ...plan, jugadores: js };
  // p1 gana dos partidos por poco (4-3); p2 pierde con p1 pero le gana 8-0 a p3 → p2 suma más games
  const res = { "p1|p2": [4, 3], "p1|p3": [4, 3], "p2|p3": [8, 0] };
  plan.partidos.forEach((p) => {
    const k = [p.pareja1.id, p.pareja2.id].sort().join("|");
    const [a, b] = res[k];
    const ordenado = p.pareja1.id < p.pareja2.id;
    mini = { ...mini, ...aplicarResultado(mini, p.id, ordenado ? resultadoDe(a, b) : resultadoDe(b, a)) };
  });
  assert.equal(mini.estado, "finalizado");
  const tabla = tablaParejas(mini);
  assert.equal(tabla[0].id, "p2", "gana la que suma más games");
  assert.equal(tabla[0].pts, 11);
  assert.equal(podio(mini)[0].detalle, "11 games");
});

test("liguilla: fixture del motor, canchas y tabla por partidos ganados", () => {
  const js = jugadores(8);
  const plan = armarMiniTorneo({ jugadores: js, modo: "manual", formato: "roundRobin", parejas: enOrden(8), canchas: 2, partidoA: { tipo: "games", valor: 4 }, ...turno });
  assert.equal(plan.partidos.length, 6);
  assert.deepEqual([...new Set(plan.partidos.map((p) => p.cancha))].sort(), [1, 2]);
  let mini = { ...plan, jugadores: js };
  const rank = { p1: 4, p2: 3, p3: 2, p4: 1 };
  plan.partidos.forEach((p) => {
    const gana1 = rank[p.pareja1.id] > rank[p.pareja2.id];
    mini = { ...mini, ...aplicarResultado(mini, p.id, gana1 ? resultadoDe(4, 1) : resultadoDe(1, 4)) };
  });
  assert.ok(terminado(mini));
  assert.deepEqual(tablaParejas(mini).map((r) => r.id), ["p1", "p2", "p3", "p4"]);
  assert.equal(podio(mini)[0].nombre, "Jugador1 / Jugador2");
  assert.throws(() => armarMiniTorneo({ jugadores: js, modo: "manual", formato: "roundRobin", parejas: [["j1", "j1"]], ...turno }));
  const conNivel = armarMiniTorneo({ jugadores: jugadores(6, ["2da", "8va", "3era", "7ma", "4ta", "6ta"]), modo: "manual", formato: "roundRobin", ...turno });
  assert.deepEqual(conNivel.parejas.map((p) => p.jugadores.slice().sort().join("+")).sort(), ["j1+j2", "j3+j4", "j5+j6"], "con niveles, parejas equilibradas");
});

test("armarMiniTorneo: mínimos y número par con mensajes claros; en automático se puede cambiar el formato", () => {
  assert.throws(() => armarMiniTorneo({ jugadores: jugadores(4), modo: "auto", ...turno }), /Faltan 2 jugadores/);
  assert.throws(() => armarMiniTorneo({ jugadores: jugadores(7), modo: "auto", ...turno }), /Con 7 jugadores no se arman parejas/);
  assert.throws(() => armarMiniTorneo({ jugadores: jugadores(8), modo: "manual", formato: "grupos", ...turno }), /desde 6 parejas/);
  assert.throws(() => armarMiniTorneo({ jugadores: jugadores(8), modo: "manual", formato: "americano", ...turno }), /formato válido/);
  const auto = armarMiniTorneo({ jugadores: jugadores(12), modo: "auto", canchas: 1, horaInicio: "20:00", horaFin: "22:00", seed: 3 });
  assert.ok(auto.entra, `estimación ${auto.estimacionMin} en ${auto.minutosTurno}`);
  assert.ok(auto.motivo);
  assert.equal(auto.estimacionMin, estimarMinutos(auto.formato, 12, 1, auto.partidoA));
  const elegido = armarMiniTorneo({ jugadores: jugadores(6), modo: "auto", formato: "eliminacion", horaInicio: "20:00", horaFin: "21:30" });
  assert.equal(elegido.formato, "eliminacion");
  assert.equal(elegido.motivo, "");
  assert.ok(elegido.entra);
});

test("torneo común: 6 parejas en dos grupos de 3; semis cruzadas con los dos primeros; 3° puesto opcional", () => {
  const js = jugadores(12);
  const plan = armarMiniTorneo({ jugadores: js, modo: "manual", formato: "grupos", criterio: "azar", tercerPuesto: true, partidoA: { tipo: "games", valor: 4 }, horaInicio: "18:00", horaFin: "21:00", seed: 9 });
  assert.deepEqual(plan.grupos.map((g) => g.parejas.length), [3, 3]);
  assert.equal(plan.partidos.length, 6);
  assert.equal(plan.llave, null);
  assert.equal(plan.tercerPuesto, true);
  assert.equal(plan.totalPartidos, 6 + 3 + 1);
  let mini = { ...plan, jugadores: js };
  plan.partidos.forEach((p, i) => (mini = { ...mini, ...aplicarResultado(mini, p.id, resultadoDe(4, i % 4)) }));
  assert.ok(mini.llave, "con los grupos completos aparece el cuadro");
  const semis = rondasDeLlave(mini.llave)[0];
  assert.equal(semis.length, 2);
  semis.forEach((s) => {
    assert.notEqual(s.pareja1.grupo, s.pareja2.grupo, "1° de un grupo contra 2° del otro");
    assert.equal(s.pareja1.id, tablaParejas(mini, s.pareja1.grupo)[0].id);
    assert.equal(s.pareja2.id, tablaParejas(mini, s.pareja2.grupo)[1].id);
  });
  assert.match(aplicarResultado(mini, "k3p", resultadoDe(4, 1)).error, /rivales/, "el 3° espera las semis");
  semis.forEach((s) => (mini = { ...mini, ...aplicarResultado(mini, s.id, resultadoDe(4, 3)) }));
  const tercero = tercerPuestoDe(mini);
  assert.deepEqual([tercero.pareja1.id, tercero.pareja2.id], [semis[0].pareja2.id, semis[1].pareja2.id]);
  const final = rondasDeLlave(mini.llave).at(-1)[0];
  mini = { ...mini, ...aplicarResultado(mini, final.id, resultadoDe(2, 4)) };
  assert.equal(mini.estado, "en_curso", "falta el 3° puesto");
  mini = { ...mini, ...aplicarResultado(mini, "k3p", resultadoDe(1, 4)) };
  assert.equal(mini.estado, "finalizado");
  assert.deepEqual(podio(mini).map((x) => [x.puesto, x.nombre]), [
    [1, final.pareja2.nombrePareja],
    [2, final.pareja1.nombrePareja],
    [3, tercero.pareja2.nombrePareja],
  ]);
  assert.deepEqual(progreso(mini), { hechos: 10, total: 10 });
  assert.match(aplicarResultado(mini, plan.partidos[0].id, null).error, /quedan fijos/);
  // Cambiar una semi limpia la final y el 3° puesto
  mini = { ...mini, ...aplicarResultado(mini, semis[0].id, resultadoDe(3, 4)) };
  assert.equal(rondasDeLlave(mini.llave).at(-1)[0].resultado, null);
  assert.equal(tercerPuestoDe(mini).resultado, null);
});

test("eliminación directa: 3 parejas con bye; 6 con byes; borrar una semi limpia la final; 3° compartido sin partido", () => {
  const tres = armarMiniTorneo({ jugadores: jugadores(6), modo: "manual", formato: "eliminacion", parejas: enOrden(6), tercerPuesto: true, partidoA: { tipo: "games", valor: 4 }, ...turno });
  const r3 = rondasDeLlave(tres.llave);
  assert.equal(r3.length, 2, "semi y final");
  assert.equal(r3[1][0].pareja1.id, "p1", "la mejor semilla pasa con bye a la final");
  assert.equal(tres.tercerPuesto, false, "con 3 parejas no hay 3° puesto");
  assert.equal(tres.totalPartidos, 2);

  const js = jugadores(12);
  const plan = armarMiniTorneo({ jugadores: js, modo: "manual", formato: "eliminacion", criterio: "azar", partidoA: { tipo: "games", valor: 4 }, ...turno, seed: 1 });
  let mini = { ...plan, jugadores: js };
  let rondas = rondasDeLlave(mini.llave);
  assert.equal(rondas.length, 3, "cuartos (con 2 byes), semis y final");
  assert.equal(rondas[1].flatMap((p) => [p.pareja1, p.pareja2]).filter(Boolean).length, 2);
  for (let ri = 0; ri < 3; ri++) {
    rondasDeLlave(mini.llave)[ri].forEach((p) => {
      if (p.pareja1 && p.pareja2 && !p.resultado) mini = { ...mini, ...aplicarResultado(mini, p.id, resultadoDe(4, 2)) };
    });
  }
  assert.equal(mini.estado, "finalizado");
  assert.deepEqual(podio(mini).map((x) => x.puesto), [1, 2, 3, 3]);
  assert.deepEqual(progreso(mini), { hechos: 5, total: 5 });
  const semi = rondasDeLlave(mini.llave)[1][0];
  mini = { ...mini, ...aplicarResultado(mini, semi.id, null) };
  rondas = rondasDeLlave(mini.llave);
  assert.equal(rondas[2][0].resultado, null);
  assert.equal(mini.estado, "en_curso");
  assert.match(aplicarResultado(mini, rondas[2][0].id, resultadoDe(4, 1)).error, /rivales/);
});

test("rey de la cancha: la que gana se queda, la que pierde vuelve a la fila; tabla por partidos ganados", () => {
  const js = jugadores(6);
  const plan = armarMiniTorneo({ jugadores: js, modo: "manual", formato: "rey", parejas: enOrden(6), partidoA: { tipo: "games", valor: 3 }, rondas: 5, ...turno });
  assert.equal(plan.canchas, 1);
  assert.equal(plan.rondas, 5);
  assert.equal(plan.partidos.length, 1);
  assert.deepEqual([plan.partidos[0].pareja1.id, plan.partidos[0].pareja2.id], ["p1", "p2"]);
  let mini = { ...plan, jugadores: js };
  const jugar = (g1, g2) => {
    const ult = mini.partidos.at(-1);
    mini = { ...mini, ...aplicarResultado(mini, ult.id, resultadoDe(g1, g2)) };
  };
  jugar(3, 1); // p1 le gana a p2 → p1 vs p3, fila [p2]
  assert.deepEqual([mini.partidos[1].pareja1.id, mini.partidos[1].pareja2.id], ["p1", "p3"]);
  jugar(0, 3); // p3 le gana a p1 → p3 vs p2, fila [p1]
  assert.deepEqual([mini.partidos[2].pareja1.id, mini.partidos[2].pareja2.id], ["p3", "p2"]);
  assert.match(aplicarResultado(mini, mini.partidos[0].id, resultadoDe(1, 3)).error, /queda fijo/);
  jugar(3, 2); // p3 vs p1
  assert.deepEqual([mini.partidos[3].pareja1.id, mini.partidos[3].pareja2.id], ["p3", "p1"]);
  // Corregir el último jugado borra el siguiente (sin resultado) y lo vuelve a armar
  mini = { ...mini, ...aplicarResultado(mini, mini.partidos[2].id, resultadoDe(2, 3)) }; // ahora gana p2 → p2 vs p1
  assert.equal(mini.partidos.length, 4);
  assert.deepEqual([mini.partidos[3].pareja1.id, mini.partidos[3].pareja2.id], ["p2", "p1"]);
  assert.match(aplicarResultado(mini, mini.partidos[3].id, resultadoDe(2, 2)).error, /empatado/);
  jugar(3, 0);
  jugar(3, 1);
  assert.equal(mini.partidos.length, 5, "no se arman más partidos que los pedidos");
  assert.equal(mini.estado, "finalizado");
  assert.equal(tablaParejas(mini)[0].id, "p2");
  assert.equal(podio(mini)[0].nombre, "Jugador3 / Jugador4");
  assert.deepEqual(progreso(mini), { hechos: 5, total: 5 });
  assert.equal(siguientePartidoRey(plan.parejas, [{ ronda: 1, pareja1: { id: "p1" }, pareja2: { id: "p2" }, resultado: null }]), null);
});

test("americano viejo (compañeros rotativos): se sigue viendo y cargando", () => {
  const viejo = {
    formato: "americano",
    partidoA: { tipo: "games", valor: 4 },
    jugadores: ["A", "B", "C", "D"].map((n, i) => ({ id: `j${i + 1}`, nombre: n })),
    partidos: [
      { id: "a1-1", fase: "americano", ronda: 1, cancha: 1, equipo1: ["j1", "j2"], equipo2: ["j3", "j4"], resultado: null },
      { id: "a2-1", fase: "americano", ronda: 2, cancha: 1, equipo1: ["j1", "j3"], equipo2: ["j2", "j4"], resultado: null },
    ],
    descansos: [],
    llave: null,
  };
  let mini = { ...viejo, ...aplicarResultado(viejo, "a1-1", resultadoDe(4, 1)) };
  mini = { ...mini, ...aplicarResultado(mini, "a2-1", resultadoDe(4, 2)) };
  assert.equal(mini.estado, "finalizado");
  assert.equal(tablaAmericano(mini)[0].id, "j1");
  assert.equal(podio(mini)[0].nombre, "A");
  assert.deepEqual(progreso(mini), { hechos: 2, total: 2 });
});
