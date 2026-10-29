// functions/index.js — Cloud Functions de Padely.
// Base de datos Firestore en nam5 (multi-región US) → funciones en us-central1.
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, FieldPath, Timestamp } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { setGlobalOptions } = require("firebase-functions/v2");
const logger = require("firebase-functions/logger");

initializeApp();
setGlobalOptions({ region: "us-central1", maxInstances: 10 });

const REGION = "us-central1";
const db = getFirestore();

// ============================================================================
// PUNTOS Y RANKING — se otorgan una sola vez por partido/bonus usando marcadores en
// tournaments/{tid}/puntosOtorgados/{markerId}. Editar un resultado nunca vuelve a otorgar.
// Un torneo tiene un cuadro por categoría (ver cuadrosDeTorneo en ./puntos): cada cuadro tiene sus grupos
// (groups con campo `cuadro`) y su bracket (tournaments/{tid}/cuadros/{cid}.bracketJson).
// Marcadores:
//   g_{gid}_{i}                      partido i del grupo gid (tipo "partido")
//   b_{cid}_{ri}_{pi}                partido pi de la ronda ri del bracket del cuadro cid (tipo "partido")
//   b_{cid}_final_campeon / _sub      bonus de la final del cuadro cid (tipo "campeon" / "subcampeon")
//   liga_{cid}_campeon / _sub         bonus de la liga del cuadro cid al finalizar (tipo "campeon" / "subcampeon")
//   fin_{uid}                        torneosJugados contado: al finalizar, o antes con el primer bonus del uid
//                                    (tipo "torneoJugado"); un jugador en dos cuadros cuenta un solo torneo
// ============================================================================
const { onDocumentWritten, onDocumentUpdated, onDocumentDeleted, onDocumentCreated } = require("firebase-functions/v2/firestore");
const puntos = require("./puntos");
const cc = require("./cuentaCompartida");

const userRef = (uid) => db.collection("users").doc(uid);
const markersCol = (tid) => db.collection("tournaments").doc(tid).collection("puntosOtorgados");
const markerRef = (tid, markerId) => markersCol(tid).doc(markerId);
const nuevaNotificacionRef = (uid) => userRef(uid).collection("notifications").doc();

// Uids vinculados a una pareja (jugador1Uid / jugador2Uid), sin vacíos
function uidsDePareja(pareja) {
  if (!pareja) return [];
  return [pareja.jugador1Uid, pareja.jugador2Uid].filter((u) => typeof u === "string" && u);
}

// Otorga los puntos de un partido a los cuatro jugadores vinculados, una sola vez (marcador markerId).
// Devuelve true si otorgó en esta llamada, false si el marcador ya existía o el partido no es puntuable.
async function otorgarPartido(tid, markerId, partido, torneo) {
  const p1 = partido && partido.pareja1;
  const p2 = partido && partido.pareja2;
  if (!p1 || !p2 || !partido.resultado) return false;

  const { setsP1, setsP2 } = puntos.contarSets(partido.resultado);
  // P3-11: sin ganador (sets empatados, carga a medias) no se puntúa todavía (antes ganaba la pareja 2)
  if (setsP1 === setsP2) return false;
  const ganoP1 = setsP1 > setsP2;
  const fallback = puntos.categoriaFallbackDeTorneo(torneo);

  const jugadores = [];
  const vistos = new Set();
  const agregar = (pareja, gano, setsGanados) => {
    const categoria = puntos.nivelDeCategoria(pareja.categoria) || fallback;
    for (const uid of uidsDePareja(pareja)) {
      if (vistos.has(uid)) continue;
      vistos.add(uid);
      jugadores.push({ uid, gano, setsGanados, categoria });
    }
  };
  agregar(p1, ganoP1, setsP1);
  agregar(p2, !ganoP1, setsP2);

  const marker = markerRef(tid, markerId);
  return db.runTransaction(async (tx) => {
    const markerSnap = await tx.get(marker);
    if (markerSnap.exists) return false;

    const snaps = jugadores.length ? await tx.getAll(...jugadores.map((j) => userRef(j.uid))) : [];
    const detalle = {};
    snaps.forEach((snap, i) => {
      if (!snap.exists) return;
      const j = jugadores[i];
      const data = snap.data();
      const multiplicador = puntos.getMultiplicadorCategoria(data.nivel || "8va", j.categoria || "8va");
      const pts = puntos.puntosDePartido(j.setsGanados, j.gano, multiplicador);
      tx.update(snap.ref, {
        puntos: (data.puntos || 0) + pts,
        partidosGanados: (data.partidosGanados || 0) + (j.gano ? 1 : 0),
        partidosPerdidos: (data.partidosPerdidos || 0) + (j.gano ? 0 : 1),
        partidosJugados: (data.partidosJugados || 0) + 1,
      });
      detalle[j.uid] = pts;
    });
    tx.set(marker, { tipo: "partido", creadoEn: FieldValue.serverTimestamp(), detalle });
    return true;
  });
}

// Otorga bonus de campeón/subcampeón (una sola vez por marcador), suma torneosJugados (salvo que
// el uid ya haya sido contado por el marcador fin_{uid}; si no, lo escribe), torneosGanados y torneosGanadosEnCategoria
// a los campeones, y evalúa el ascenso de cada jugador premiado dentro de la misma transacción.
// premios: [{ markerId, tipo, pareja, posicion }]. Devuelve los markerIds creados en esta llamada.
async function otorgarBonus(tid, premios, torneo) {
  const validos = premios.filter((p) => p && p.pareja);
  if (!validos.length) return [];
  const fallback = puntos.categoriaFallbackDeTorneo(torneo);

  return db.runTransaction(async (tx) => {
    const markerSnaps = await tx.getAll(...validos.map((p) => markerRef(tid, p.markerId)));
    const pendientes = validos.filter((_, i) => !markerSnaps[i].exists);
    if (!pendientes.length) return [];

    const jugadores = [];
    const vistos = new Set();
    pendientes.forEach((premio) => {
      const categoria = puntos.nivelDeCategoria(premio.pareja.categoria) || fallback;
      for (const uid of uidsDePareja(premio.pareja)) {
        if (vistos.has(uid)) continue;
        vistos.add(uid);
        jugadores.push({ uid, posicion: premio.posicion, categoria, markerId: premio.markerId });
      }
    });

    const userSnaps = jugadores.length ? await tx.getAll(...jugadores.map((j) => userRef(j.uid))) : [];
    const finSnaps = jugadores.length
      ? await tx.getAll(...jugadores.map((j) => markerRef(tid, `fin_${j.uid}`)))
      : [];

    const ahoraIso = new Date().toISOString();
    const detalles = {};
    pendientes.forEach((p) => (detalles[p.markerId] = {}));

    userSnaps.forEach((snap, i) => {
      if (!snap.exists) return;
      const j = jugadores[i];
      const data = snap.data();
      const multiplicador = puntos.getMultiplicadorCategoria(data.nivel || "8va", j.categoria || "8va");
      const bonus = puntos.bonusDeTorneo(j.posicion, multiplicador);
      const esCampeon = j.posicion === 1;
      const yaContado = finSnaps[i].exists;
      const nuevo = {
        puntos: (data.puntos || 0) + bonus,
        torneosJugados: (data.torneosJugados || 0) + (yaContado ? 0 : 1),
        torneosGanados: (data.torneosGanados || 0) + (esCampeon ? 1 : 0),
        torneosGanadosEnCategoria: (data.torneosGanadosEnCategoria || 0) + (esCampeon ? 1 : 0),
      };
      const updates = { ...nuevo };
      const ascenso = puntos.evaluarAscenso({ ...data, ...nuevo }, ahoraIso);
      if (ascenso) {
        Object.assign(updates, ascenso.updates);
        tx.set(nuevaNotificacionRef(j.uid), {
          ...ascenso.notificacion,
          createdAt: FieldValue.serverTimestamp(),
        });
        logger.info(`Jugador ${j.uid} ascendió de ${ascenso.de} a ${ascenso.a} por vía ${ascenso.via}`, { tid });
      }
      tx.update(snap.ref, updates);
      if (!yaContado) {
        // Este bonus es el que cuenta el torneo jugado: el marcador evita que otro cuadro lo sume de nuevo
        tx.set(markerRef(tid, `fin_${j.uid}`), {
          tipo: "torneoJugado",
          creadoEn: FieldValue.serverTimestamp(),
          detalle: { [j.uid]: 0 },
        });
      }
      detalles[j.markerId][j.uid] = bonus;
    });

    pendientes.forEach((p) => {
      tx.set(markerRef(tid, p.markerId), {
        tipo: p.tipo,
        creadoEn: FieldValue.serverTimestamp(),
        detalle: detalles[p.markerId],
      });
    });
    return pendientes.map((p) => p.markerId);
  });
}

// Final del bracket del cuadro cid: campeón = ganador, subcampeón = perdedor
// (markers b_{cid}_final_campeon / b_{cid}_final_sub)
async function otorgarFinal(tid, cid, partido, torneo) {
  const p1 = partido && partido.pareja1;
  const p2 = partido && partido.pareja2;
  if (!p1 || !p2 || !partido.resultado) return [];
  const { setsP1, setsP2 } = puntos.contarSets(partido.resultado);
  if (setsP1 === setsP2) return []; // P3-11: final sin ganador todavía → sin campeón
  const ganoP1 = setsP1 > setsP2;
  return otorgarBonus(
    tid,
    [
      { markerId: `b_${cid}_final_campeon`, tipo: "campeon", pareja: ganoP1 ? p1 : p2, posicion: 1 },
      { markerId: `b_${cid}_final_sub`, tipo: "subcampeon", pareja: ganoP1 ? p2 : p1, posicion: 2 },
    ],
    torneo,
  );
}

// Torneo finalizado: torneosJugados += 1 para cada jugador vinculado a una pareja (marker fin_{uid}),
// salvo los uids ya contados por un bonus de campeón/subcampeón de cualquier cuadro (marcadores con
// tipo "campeon" / "subcampeon"). Transacciones de hasta 100 uids.
async function contarTorneoJugado(tid, uids) {
  const unicos = [...new Set(uids)];
  let contados = 0;
  for (let i = 0; i < unicos.length; i += 100) {
    const grupo = unicos.slice(i, i + 100);
    contados += await db.runTransaction(async (tx) => {
      const finSnaps = await tx.getAll(...grupo.map((uid) => markerRef(tid, `fin_${uid}`)));
      const pendientes = grupo.filter((_, k) => !finSnaps[k].exists);
      if (!pendientes.length) return 0;
      const bonusSnap = await tx.get(markersCol(tid).where("tipo", "in", ["campeon", "subcampeon"]));
      const yaContados = new Set();
      bonusSnap.docs.forEach((s) => {
        Object.keys((s.data() && s.data().detalle) || {}).forEach((u) => yaContados.add(u));
      });
      const userSnaps = await tx.getAll(...pendientes.map((uid) => userRef(uid)));
      let n = 0;
      userSnaps.forEach((snap, k) => {
        const uid = pendientes[k];
        if (!snap.exists || yaContados.has(uid)) return;
        tx.update(snap.ref, { torneosJugados: (snap.data().torneosJugados || 0) + 1 });
        tx.set(markerRef(tid, `fin_${uid}`), {
          tipo: "torneoJugado",
          creadoEn: FieldValue.serverTimestamp(),
          detalle: { [uid]: 0 },
        });
        n++;
      });
      return n;
    });
  }
  return contados;
}

function parseBracket(bracketJson) {
  try {
    const data = JSON.parse(bracketJson);
    return data && Array.isArray(data.rondas) ? data.rondas : null;
  } catch (err) {
    logger.error("bracketJson inválido", err);
    return null;
  }
}

// Trigger A: resultados de la fase de grupos / liga (tournaments/{tid}/groups/{gid}.partidos[i].resultado)
// y, en toda escritura (también al borrar el grupo), la sincronización de los turnos bloqueados en el club sede.
exports.onGroupWritten = onDocumentWritten("tournaments/{tid}/groups/{gid}", async (event) => {
  const { tid, gid } = event.params;
  try {
    await puntosDeGrupo(event, tid, gid);
  } catch (err) {
    logger.error(`Error otorgando puntos del grupo ${gid}`, err);
  }
  await sincronizarBloqueosTorneo(tid);
});

async function puntosDeGrupo(event, tid, gid) {
  const after = event.data && event.data.after;
  if (!after || !after.exists) return;
  const grupo = after.data() || {};
  const partidos = Array.isArray(grupo.partidos) ? grupo.partidos : [];
  const conResultado = partidos
    .map((partido, i) => ({ partido, i }))
    .filter(({ partido }) => partido && partido.resultado && partido.pareja1 && partido.pareja2);
  if (!conResultado.length) return;

  const torneoSnap = await db.collection("tournaments").doc(tid).get();
  const torneo = torneoSnap.exists ? torneoSnap.data() : {};
  for (const { partido, i } of conResultado) {
    const otorgado = await otorgarPartido(tid, `g_${gid}_${i}`, partido, torneo);
    if (otorgado) logger.info(`Puntos otorgados: grupo ${gid} partido ${i}`, { tid });
  }
}

// Trigger C: resultados del bracket de un cuadro (tournaments/{tid}/cuadros/{cid}.bracketJson).
// Cada partido con resultado se puntúa una sola vez (marker b_{cid}_{ri}_{pi}); la final del cuadro
// (última ronda, partido 0) otorga además el bonus de campeón/subcampeón de ese cuadro.
exports.onCuadroWritten = onDocumentWritten("tournaments/{tid}/cuadros/{cid}", async (event) => {
  const { tid, cid } = event.params;
  try {
    await puntosDeCuadro(event, tid, cid);
  } catch (err) {
    logger.error(`Error otorgando puntos del cuadro ${cid}`, err);
  }
  await sincronizarBloqueosTorneo(tid);
});

async function puntosDeCuadro(event, tid, cid) {
  const after = event.data && event.data.after;
  if (!after || !after.exists) return;
  const cuadro = after.data() || {};
  if (!cuadro.bracketJson) return;
  const rondas = parseBracket(cuadro.bracketJson);
  if (!rondas) return;

  const torneoSnap = await db.collection("tournaments").doc(tid).get();
  const torneo = torneoSnap.exists ? torneoSnap.data() : {};
  for (let ri = 0; ri < rondas.length; ri++) {
    const ronda = Array.isArray(rondas[ri]) ? rondas[ri] : [];
    for (let pi = 0; pi < ronda.length; pi++) {
      const partido = ronda[pi];
      if (!partido || !partido.resultado || !partido.pareja1 || !partido.pareja2) continue;
      const otorgado = await otorgarPartido(tid, `b_${cid}_${ri}_${pi}`, partido, torneo);
      if (otorgado) logger.info(`Puntos otorgados: cuadro ${cid} ronda ${ri} partido ${pi}`, { tid });
      const esFinal = ri === rondas.length - 1 && pi === 0;
      if (esFinal) {
        const creados = await otorgarFinal(tid, cid, partido, torneo);
        if (creados.length) logger.info(`Bonus de final otorgado en ${cid} (${creados.join(", ")})`, { tid });
      }
    }
  }
}

// Trigger B: cierre del torneo (status → finalizado)
exports.onTournamentUpdated = onDocumentUpdated("tournaments/{tid}", async (event) => {
  if (!event.data) return;
  const after = event.data.after.data();
  if (!after) return;
  const { tid } = event.params;
  const before = event.data.before.data() || {};

  // Sede: el club (vínculo o su estado), las canchas, el estado del torneo o sus fechas cambiaron → los turnos
  // bloqueados en el club se recalculan (también cuando el club recién acepta). Si cambió de club, se limpian
  // los bloqueos que quedaron en el anterior.
  const clubAntes = before.club && before.club.id ? before.club.id : null;
  const clubDespues = after.club && after.club.id ? after.club.id : null;
  const cambioSede =
    JSON.stringify(before.club || null) !== JSON.stringify(after.club || null) ||
    JSON.stringify(before.canchas || []) !== JSON.stringify(after.canchas || []) ||
    before.status !== after.status ||
    before.fechaInicio !== after.fechaInicio ||
    before.fechaFin !== after.fechaFin;
  if (cambioSede) {
    try {
      await sincronizarBloqueosTorneo(tid, clubAntes && clubAntes !== clubDespues ? clubAntes : null);
    } catch (err) {
      logger.error("Error sincronizando los turnos del torneo", err);
    }
  }

  // B2: torneo finalizado. Se evalúa en cada escritura mientras el torneo esté finalizado (no solo en la
  // transición): los marcadores garantizan una sola vez, y así una invocación perdida se recupera sola.
  if (after.status === "finalizado") {
    // Liga: bonus de campeón y subcampeón por cuadro, según la tabla del único grupo "Liga" de cada uno
    if (after.formato === "liga") {
      if (after.puntosFinalesOtorgados) {
        logger.info("Liga con puntos finales ya otorgados por el cliente, se omite el bonus", { tid });
      } else {
        const gruposSnap = await db.collection("tournaments").doc(tid).collection("groups").get();
        const grupos = gruposSnap.docs.map((d) => d.data());
        for (const cuadro of puntos.cuadrosDeTorneo(after)) {
          const delCuadro = grupos.filter((g) => puntos.cuadroDeGrupo(g, after) === cuadro.id);
          const grupoLiga = delCuadro.find((g) => g.nombre === "Liga") || delCuadro[0] || null;
          if (!grupoLiga) continue;
          const tabla = puntos.calcularTabla(grupoLiga);
          const creados = await otorgarBonus(
            tid,
            [
              { markerId: `liga_${cuadro.id}_campeon`, tipo: "campeon", pareja: tabla[0] || null, posicion: 1 },
              { markerId: `liga_${cuadro.id}_sub`, tipo: "subcampeon", pareja: tabla[1] || null, posicion: 2 },
            ],
            after,
          );
          if (creados.length) logger.info(`Bonus de liga otorgado en ${cuadro.id} (${creados.join(", ")})`, { tid });
        }
      }
    }

    // Todos los jugadores vinculados: torneosJugados += 1 (una sola vez)
    const pairsSnap = await db.collection("tournaments").doc(tid).collection("pairs").get();
    const uids = pairsSnap.docs.flatMap((d) => uidsDePareja(d.data()));
    if (uids.length) {
      const contados = await contarTorneoJugado(tid, uids);
      logger.info(`Torneo finalizado: torneosJugados sumado a ${contados} jugadores`, { tid });
    }
  }
});

// ============================================================================
// SEDE — los partidos programados de un torneo bloquean los turnos de su club
// clubs/{c}/reservas/{slotId} con tipo "torneo": los escribe solo esta función (las reglas no dejan al
// cliente crearlos, editarlos ni borrarlos). Deseado = cada partido con dia + hora + canchaId de un torneo con
// club aceptado y no finalizado/cancelado. Idempotente: se puede correr en cualquier escritura.
// ============================================================================
const slotIdDe = (canchaId, fecha, hora) => `${canchaId}_${fecha}_${String(hora).replace(":", "")}`;
const ES_DIA = /^\d{4}-\d{2}-\d{2}$/;
const ES_HORA = /^\d{2}:\d{2}$/;

function nombreDePareja(p) {
  if (!p) return "Por definir";
  return p.nombrePareja || [p.jugador1, p.jugador2].filter(Boolean).join(" / ") || "Por definir";
}

// Comparaciones estables (Firestore no garantiza el orden de las claves de un mapa)
const CAMPOS_PARTIDO = ["cuadroId", "grupoId", "ronda", "indice", "pareja1", "pareja2"];
const mismoPartido = (a, b) => CAMPOS_PARTIDO.every((k) => (a && a[k] !== undefined ? a[k] : null) === (b && b[k] !== undefined ? b[k] : null));
const firmaConflictos = (lista) =>
  (Array.isArray(lista) ? lista : [])
    .map((c) => `${c.dia}_${c.hora}_${c.canchaId}_${c.motivo}`)
    .sort()
    .join(";");

// Partidos programados de todos los grupos y de los brackets de todos los cuadros → { slotId: deseado }.
// Si dos partidos caen en el mismo turno, queda el primero y el segundo se anota como conflicto "duplicado".
function recolectarPartidos(torneo, gruposDocs, cuadrosDocs) {
  const deseados = new Map();
  const conflictos = [];
  const canchas = Array.isArray(torneo.canchas) ? torneo.canchas : [];
  const nombreCancha = (partido) =>
    partido.cancha || (canchas.find((c) => c && c.id === partido.canchaId) || {}).nombre || String(partido.canchaId);

  const considerar = (partido, meta) => {
    if (!partido || !partido.canchaId || !ES_DIA.test(partido.dia || "") || !ES_HORA.test(partido.hora || "")) return;
    // Solo las canchas del torneo (ids reales del club): un partido programado antes de vincular el club, o de otro
    // club, no puede bloquear un turno acá
    if (!canchas.some((c) => c && c.id === partido.canchaId)) return;
    const id = slotIdDe(partido.canchaId, partido.dia, partido.hora);
    const canchaNombre = nombreCancha(partido);
    if (deseados.has(id)) {
      conflictos.push({ dia: partido.dia, hora: partido.hora, canchaId: partido.canchaId, canchaNombre, motivo: "duplicado" });
      return;
    }
    deseados.set(id, {
      canchaId: partido.canchaId,
      canchaNombre,
      fecha: partido.dia,
      hora: partido.hora,
      partido: {
        cuadroId: meta.cuadroId,
        grupoId: meta.grupoId,
        ronda: meta.ronda,
        indice: meta.indice,
        pareja1: nombreDePareja(partido.pareja1),
        pareja2: nombreDePareja(partido.pareja2),
      },
    });
  };

  gruposDocs.forEach((g) => {
    const grupo = g.data() || {};
    const cuadroId = puntos.cuadroDeGrupo(grupo, torneo);
    (Array.isArray(grupo.partidos) ? grupo.partidos : []).forEach((partido, i) =>
      considerar(partido, { cuadroId, grupoId: g.id, ronda: null, indice: i }),
    );
  });
  cuadrosDocs.forEach((c) => {
    const data = c.data() || {};
    const rondas = data.bracketJson ? parseBracket(data.bracketJson) : null;
    if (!rondas) return;
    rondas.forEach((ronda, ri) => {
      (Array.isArray(ronda) ? ronda : []).forEach((partido, pi) =>
        considerar(partido, { cuadroId: c.id, grupoId: null, ronda: ri, indice: pi }),
      );
    });
  });
  return { deseados, conflictos };
}

async function sincronizarBloqueosTorneo(tid, clubIdAnterior = null) {
  const torneoRef = db.collection("tournaments").doc(tid);
  const torneoSnap = await torneoRef.get();
  if (!torneoSnap.exists) return;
  const torneo = torneoSnap.data() || {};
  const club = torneo.club && torneo.club.id ? torneo.club : null;
  const clubId = club ? club.id : null;
  const activo = !!clubId && club.estado === "aceptado" && !["finalizado", "cancelado"].includes(torneo.status);

  let deseados = new Map();
  let conflictos = [];
  if (activo) {
    const [gruposSnap, cuadrosSnap] = await Promise.all([
      torneoRef.collection("groups").get(),
      torneoRef.collection("cuadros").get(),
    ]);
    ({ deseados, conflictos } = recolectarPartidos(torneo, gruposSnap.docs, cuadrosSnap.docs));
  }

  const clubs = [...new Set([clubId, clubIdAnterior].filter(Boolean))];
  let creados = 0;
  let borrados = 0;
  let actualizados = 0;
  for (const cid of clubs) {
    const reservasCol = db.collection("clubs").doc(cid).collection("reservas");
    const propios = cid === clubId && activo ? deseados : new Map();
    const existentesSnap = await reservasCol.where("tipo", "==", "torneo").where("torneoId", "==", tid).get();
    const existentes = new Map(existentesSnap.docs.map((d) => [d.id, d]));
    const ops = [];

    existentes.forEach((d, id) => {
      if (!propios.has(id)) {
        ops.push((b) => b.delete(d.ref));
        borrados++;
      }
    });

    const nuevos = [...propios.entries()].filter(([id]) => !existentes.has(id));
    const ocupantes = nuevos.length ? await db.getAll(...nuevos.map(([id]) => reservasCol.doc(id))) : [];
    const nombreJugador = `Torneo · ${torneo.nombre || ""}`.trim();

    propios.forEach((deseado, id) => {
      const ex = existentes.get(id);
      if (ex) {
        const data = ex.data() || {};
        const cambio =
          !mismoPartido(data.partido, deseado.partido) ||
          data.torneoNombre !== (torneo.nombre || "") ||
          data.canchaName !== deseado.canchaNombre;
        if (cambio) {
          ops.push((b) =>
            b.update(ex.ref, {
              partido: deseado.partido,
              torneoNombre: torneo.nombre || "",
              nombreJugador,
              canchaName: deseado.canchaNombre,
            }),
          );
          actualizados++;
        }
      }
    });

    const aCrear = [];
    nuevos.forEach(([id, deseado], k) => {
      const ocupante = ocupantes[k];
      const data = ocupante && ocupante.exists ? ocupante.data() || {} : null;
      if (data && data.status !== "cancelada") {
        // Turno con una reserva real (o de otro torneo): no se pisa, se avisa
        conflictos.push({
          dia: deseado.fecha,
          hora: deseado.hora,
          canchaId: deseado.canchaId,
          canchaNombre: deseado.canchaNombre,
          motivo: data.tipo === "torneo" ? "torneo" : "reservado",
        });
        return;
      }
      aCrear.push([id, deseado]);
    });

    await escribirEnLotes(ops);

    // Altas de a una, en transacción: si alguien reservó el turno entre la lectura y la escritura, no se pisa.
    // Una reserva cancelada en el turno se reemplaza y se borra su contacto (como hace crearReserva en el cliente).
    for (const [id, deseado] of aCrear) {
      const ref = reservasCol.doc(id);
      const contactoRef = db.collection("clubs").doc(cid).collection("contactosReservas").doc(id);
      const resultado = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const data = snap.exists ? snap.data() || {} : null;
        if (data && data.status !== "cancelada") {
          if (data.tipo === "torneo" && data.torneoId === tid) return "ya";
          return data.tipo === "torneo" ? "torneo" : "reservado";
        }
        if (snap.exists) tx.delete(contactoRef);
        tx.set(ref, {
          canchaId: deseado.canchaId,
          canchaName: deseado.canchaNombre,
          fecha: deseado.fecha,
          hora: deseado.hora,
          status: "confirmada",
          tipo: "torneo",
          torneoId: tid,
          torneoNombre: torneo.nombre || "",
          nombreJugador,
          partido: deseado.partido,
          jugadorUid: null,
          createdAt: FieldValue.serverTimestamp(),
        });
        return "creado";
      });
      if (resultado === "creado") creados++;
      else if (resultado !== "ya") {
        conflictos.push({
          dia: deseado.fecha,
          hora: deseado.hora,
          canchaId: deseado.canchaId,
          canchaNombre: deseado.canchaNombre,
          motivo: resultado,
        });
      }
    }
  }

  // Conflictos en el torneo (siempre un array; solo se escribe si cambió, para no disparar el trigger de nuevo)
  conflictos.sort((a, b) => `${a.dia}${a.hora}${a.canchaId}`.localeCompare(`${b.dia}${b.hora}${b.canchaId}`));
  const anteriores = Array.isArray(torneo.conflictos) ? torneo.conflictos : [];
  if (firmaConflictos(anteriores) !== firmaConflictos(conflictos)) {
    await torneoRef.update({ conflictos });
    const clave = (c) => `${c.dia}_${c.hora}_${c.canchaId}`;
    const vistos = new Set(anteriores.map(clave));
    const nuevosConflictos = conflictos.filter((c) => !vistos.has(clave(c)));
    if (nuevosConflictos.length && torneo.organizerId) {
      const n = conflictos.length;
      await nuevaNotificacionRef(torneo.organizerId).set({
        tipo: "conflicto_turno",
        titulo: n === 1 ? "Un turno ya reservado" : `${n} turnos ya reservados`,
        mensaje:
          `En "${torneo.nombre || "tu torneo"}" hay ${n === 1 ? "un partido programado" : `${n} partidos programados`} ` +
          "en turnos que el club ya tenía reservados. Cambiá el horario o pedile al club que libere el turno.",
        link: `/t/${tid}`,
        leida: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  }
  logger.info(
    `sincronizarBloqueosTorneo ${tid}: ${activo ? deseados.size : 0} deseados, ${creados} creados, ` +
      `${actualizados} actualizados, ${borrados} borrados, ${conflictos.length} conflictos`,
  );
}

// Torneo borrado: sus bloqueos se van del club (sincronizarBloqueosTorneo ya no puede leer el torneo)
exports.onTournamentDeleted = onDocumentDeleted("tournaments/{tid}", async (event) => {
  const before = event.data ? event.data.data() : null;
  const clubId = before && before.club && before.club.id ? before.club.id : null;
  if (!clubId) return;
  const { tid } = event.params;
  const snap = await db
    .collection("clubs")
    .doc(clubId)
    .collection("reservas")
    .where("tipo", "==", "torneo")
    .where("torneoId", "==", tid)
    .get();
  await escribirEnLotes(snap.docs.map((d) => (b) => b.delete(d.ref)));
  logger.info(`onTournamentDeleted ${tid}: ${snap.size} bloqueos borrados en ${clubId}`);
});

// ============================================================================
// EQUIPO DEL CLUB — invitación a staff: si el email ya tiene cuenta en Padely, le llega una notificación
// con el link para aceptar (clubs/{c}/invitaciones/{id}). Sin cuenta no pasa nada: el link se comparte a mano.
// ============================================================================
const ROL_STAFF_LABEL = { encargado: "encargado", cajero: "cajero", barra: "barra" };

exports.onInvitacionStaffCreated = onDocumentCreated("clubs/{clubId}/invitaciones/{invId}", async (event) => {
  try {
    const inv = event.data ? event.data.data() : null;
    const { clubId, invId } = event.params;
    const email = inv && typeof inv.email === "string" ? inv.email.trim().toLowerCase() : "";
    if (!email || inv.estado !== "pendiente") return;
    let usuario;
    try {
      usuario = await getAuth().getUserByEmail(email);
    } catch (err) {
      if (err && err.code === "auth/user-not-found") {
        logger.info(`onInvitacionStaffCreated ${invId}: ${email} no tiene cuenta todavía`);
        return;
      }
      throw err;
    }
    const clubSnap = await db.collection("clubs").doc(clubId).get();
    const clubNombre = (clubSnap.exists && clubSnap.data().nombre) || "Un club";
    const rol = ROL_STAFF_LABEL[inv.rol] || String(inv.rol || "staff");
    await nuevaNotificacionRef(usuario.uid).set({
      tipo: "invitacion_staff",
      titulo: "Te invitaron a un club",
      mensaje: `${clubNombre} te invitó como ${rol} de su equipo.`,
      link: `/equipo/invitacion/${clubId}/${invId}`,
      leida: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    logger.info(`onInvitacionStaffCreated ${invId}: notificado ${usuario.uid}`);
  } catch (err) {
    logger.error("onInvitacionStaffCreated", err);
  }
});

// ============================================================================
// BAR — stock de productos: cada movimiento (clubs/{c}/movimientosStock) suma su cantidad al stock del producto
// una sola vez (marca aplicado en la misma transacción). Los productos sin control de stock solo marcan el
// movimiento. El stock puede quedar negativo (ventas sin conexión, más adelante): nunca se bloquea.
// ============================================================================
exports.onMovimientoStockCreated = onDocumentCreated("clubs/{clubId}/movimientosStock/{movId}", async (event) => {
  const { clubId, movId } = event.params;
  const movRef = db.collection("clubs").doc(clubId).collection("movimientosStock").doc(movId);
  try {
    const resultado = await db.runTransaction(async (tx) => {
      const movSnap = await tx.get(movRef);
      if (!movSnap.exists) return "sin movimiento";
      const mov = movSnap.data() || {};
      if (mov.aplicado === true) return "ya aplicado";
      const cantidad = Number(mov.cantidad);
      const prodRef = mov.productoId
        ? db.collection("clubs").doc(clubId).collection("productos").doc(String(mov.productoId))
        : null;
      const prodSnap = prodRef ? await tx.get(prodRef) : null;
      if (!prodSnap || !prodSnap.exists) {
        tx.update(movRef, { aplicado: true, error: "producto inexistente", aplicadoEn: FieldValue.serverTimestamp() });
        return "producto inexistente";
      }
      if (prodSnap.data().controlaStock !== false && Number.isFinite(cantidad) && cantidad !== 0) {
        tx.update(prodRef, { stock: FieldValue.increment(cantidad), actualizadoEn: FieldValue.serverTimestamp() });
      }
      tx.update(movRef, { aplicado: true, aplicadoEn: FieldValue.serverTimestamp() });
      return "aplicado";
    });
    logger.info(`onMovimientoStockCreated ${clubId}/${movId}: ${resultado}`);
  } catch (err) {
    logger.error(`onMovimientoStockCreated ${clubId}/${movId}`, err);
  }
});

// ============================================================================
// MANTENIMIENTO — reservas pendientes vencidas y limpieza de cuentas eliminadas
// ============================================================================
const { onSchedule } = require("firebase-functions/v2/scheduler");
const functionsV1 = require("firebase-functions/v1");

const EXPIRA_PENDIENTE_HORAS = 2; // más adelante configurable por club
const ZONA_HORARIA = "America/Argentina/Buenos_Aires";
const BATCH_MAX = 400;
const CONCURRENCIA_EXPIRACION = 20;

// "YYYY-MM-DD" de hoy en Argentina (misma convención que getTodayLocal() en el cliente)
function fechaLocalArgentina(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_HORARIA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

// Aplica operaciones (batch) => void en lotes de hasta BATCH_MAX escrituras, en orden
async function escribirEnLotes(ops) {
  for (let i = 0; i < ops.length; i += BATCH_MAX) {
    const batch = db.batch();
    ops.slice(i, i + BATCH_MAX).forEach((op) => op(batch));
    await batch.commit();
  }
}

// Cada 15 minutos: las reservas pendientes de aprobación con más de EXPIRA_PENDIENTE_HORAS
// pasan a cancelada (motivo "expirada") y se avisa al jugador y al club.
exports.expirarReservasPendientes = onSchedule(
  { schedule: "every 15 minutes", timeZone: ZONA_HORARIA },
  async () => {
    const limite = Timestamp.fromMillis(Date.now() - EXPIRA_PENDIENTE_HORAS * 60 * 60 * 1000);
    const snap = await db
      .collectionGroup("reservas")
      .where("status", "==", "pendiente")
      .where("createdAt", "<=", limite)
      .get();
    if (snap.empty) {
      logger.info("expirarReservasPendientes: sin reservas vencidas");
      return;
    }

    const clubs = new Map();
    const cargarClub = (clubRef) => {
      if (!clubs.has(clubRef.id)) {
        clubs.set(clubRef.id, clubRef.get().then((s) => (s.exists ? s.data() : {})));
      }
      return clubs.get(clubRef.id);
    };

    // Una transacción por reserva: si el club la confirmó (o el jugador la canceló) entre la consulta
    // y la escritura, no se pisa. Se procesan de a CONCURRENCIA_EXPIRACION en paralelo.
    let vencidas = 0;
    for (let i = 0; i < snap.docs.length; i += CONCURRENCIA_EXPIRACION) {
      const resultados = await Promise.all(
        snap.docs.slice(i, i + CONCURRENCIA_EXPIRACION).map(async (doc) => {
          try {
            const clubRef = doc.ref.parent.parent;
            if (!clubRef) return false;
            const club = await cargarClub(clubRef);
            return await db.runTransaction(async (tx) => {
              const fresh = await tx.get(doc.ref);
              if (!fresh.exists) return false;
              const reserva = fresh.data();
              if (reserva.status !== "pendiente" || reserva.tipo === "torneo") return false;
              const clubNombre = club.nombre || "el club";
              const cancha = reserva.canchaName || reserva.canchaId || "cancha";
              const fecha = reserva.fecha || "";
              const hora = reserva.hora || "";
              tx.update(doc.ref, { status: "cancelada", motivo: "expirada" });
              if (reserva.jugadorUid) {
                tx.set(nuevaNotificacionRef(reserva.jugadorUid), {
                  tipo: "reserva_expirada",
                  titulo: "Tu reserva venció",
                  mensaje: `Tu reserva en ${clubNombre} (${cancha}, ${fecha} ${hora}) venció sin respuesta del club y fue cancelada.`,
                  link: "/mis-reservas",
                  icono: "⏰",
                  leida: false,
                  createdAt: FieldValue.serverTimestamp(),
                });
              }
              if (club.ownerUid) {
                tx.set(nuevaNotificacionRef(club.ownerUid), {
                  tipo: "reserva_expirada_club",
                  titulo: "Reserva vencida sin respuesta",
                  mensaje: `La reserva de ${reserva.nombreJugador || "un jugador"} (${cancha}, ${fecha} ${hora}) venció sin confirmar y fue cancelada.`,
                  link: "/admin/canchas",
                  icono: "⏰",
                  leida: false,
                  createdAt: FieldValue.serverTimestamp(),
                });
              }
              return true;
            });
          } catch (err) {
            logger.error(`No se pudo vencer la reserva ${doc.ref.path}`, err);
            return false;
          }
        }),
      );
      vencidas += resultados.filter(Boolean).length;
    }
    logger.info(`expirarReservasPendientes: ${vencidas} de ${snap.size} reservas vencidas`);
  },
);

// Cuenta eliminada en Auth (v1): borra users/{uid} con sus subcolecciones, desvincula al jugador
// de las parejas de torneos, cancela sus reservas futuras y borra su contacto de los clubes
// (clubs/{clubId}/contactosReservas, que solo lee el club).
exports.onUserDeleted = functionsV1
  .region(REGION)
  .auth.user()
  .onDelete(async (user) => {
    const uid = user.uid;
    await db.recursiveDelete(userRef(uid));

    const ops = [];
    // Una sola actualización por pareja aunque el uid esté en los dos lugares
    const parejas = new Map();
    for (const campo of ["jugador1Uid", "jugador2Uid"]) {
      const snap = await db.collectionGroup("pairs").where(campo, "==", uid).get();
      snap.docs.forEach((d) => {
        const entry = parejas.get(d.ref.path) || { ref: d.ref, campos: {} };
        entry.campos[campo] = null;
        parejas.set(d.ref.path, entry);
      });
    }
    parejas.forEach(({ ref, campos }) => ops.push((b) => b.update(ref, campos)));

    const hoy = fechaLocalArgentina();
    const reservasSnap = await db
      .collectionGroup("reservas")
      .where("jugadorUid", "==", uid)
      .where("fecha", ">=", hoy)
      .get();
    let reservas = 0;
    reservasSnap.docs.forEach((d) => {
      if (d.data().status === "cancelada" || d.data().tipo === "torneo") return;
      ops.push((b) => b.update(d.ref, { status: "cancelada", motivo: "cuenta eliminada" }));
      reservas++;
    });

    const contactosSnap = await db.collectionGroup("contactosReservas").where("jugadorUid", "==", uid).get();
    contactosSnap.docs.forEach((d) => ops.push((b) => b.delete(d.ref)));

    // Su lugar en el equipo de cada club (clubs/{c}/staff/{uid})
    const staffSnap = await db.collectionGroup("staff").where("uid", "==", uid).get();
    staffSnap.docs.forEach((d) => ops.push((b) => b.delete(d.ref)));
    // Su perfil público (proyección de users para buscar jugadores)
    ops.push((b) => b.delete(db.collection("perfilesPublicos").doc(uid)));

    await escribirEnLotes(ops);
    logger.info(
      `onUserDeleted ${uid}: ${parejas.size} parejas desvinculadas, ${reservas} reservas canceladas, ` +
        `${contactosSnap.size} contactos de reservas borrados, ${staffSnap.size} documentos de staff borrados`,
    );
  });

// ============================================================================
// BAR — CAJA: la caja es un registro. Cada movimiento (clubs/{c}/movimientosCaja) se suma a `cajas.totales` una
// sola vez (marca aplicado en la misma transacción). La aritmética es LA MISMA que src/utils/caja.js
// (aplicarMovimiento): el medio recibe el monto con el signo del tipo, el tipo acumula el monto en positivo.
// P3-3 reutiliza esta función para "venta"/"anulacion" (ya contemplados acá): solo cambia quién crea el movimiento.
// ============================================================================
const SIGNO_MOVIMIENTO_CAJA = { ingreso: 1, venta: 1, cobroCuenta: 1, "seña": 1, retiro: -1, gasto: -1, anulacion: -1 };
const CLAVE_TOTAL_CAJA = { retiro: "retiros", ingreso: "ingresos", gasto: "gastos", venta: "ventas", anulacion: "anulaciones" };
const MEDIOS_CAJA = ["efectivo", "transferencia", "tarjeta", "qr"];

exports.onMovimientoCajaCreated = onDocumentCreated("clubs/{clubId}/movimientosCaja/{movId}", async (event) => {
  const { clubId, movId } = event.params;
  const clubRef = db.collection("clubs").doc(clubId);
  const movRef = clubRef.collection("movimientosCaja").doc(movId);
  try {
    const resultado = await db.runTransaction(async (tx) => {
      const movSnap = await tx.get(movRef);
      if (!movSnap.exists) return "sin movimiento";
      const mov = movSnap.data() || {};
      if (mov.aplicado === true) return "ya aplicado";
      const cajaRef = mov.cajaId ? clubRef.collection("cajas").doc(String(mov.cajaId)) : null;
      const cajaSnap = cajaRef ? await tx.get(cajaRef) : null;
      if (!cajaSnap || !cajaSnap.exists || cajaSnap.data().estado !== "abierta") {
        tx.update(movRef, { aplicado: true, error: "caja inexistente o cerrada", aplicadoEn: FieldValue.serverTimestamp() });
        return "caja inexistente o cerrada";
      }
      const monto = Number(mov.monto);
      const signo = SIGNO_MOVIMIENTO_CAJA[mov.tipo] || 0;
      const cambios = { "totales.movimientos": FieldValue.increment(1), actualizadoEn: FieldValue.serverTimestamp() };
      if (signo !== 0 && Number.isFinite(monto) && monto > 0) {
        if (MEDIOS_CAJA.includes(mov.medio)) cambios[`totales.${mov.medio}`] = FieldValue.increment(signo * monto);
        const clave = CLAVE_TOTAL_CAJA[mov.tipo];
        if (clave) cambios[`totales.${clave}`] = FieldValue.increment(monto);
      }
      tx.update(cajaRef, cambios);
      tx.update(movRef, { aplicado: true, aplicadoEn: FieldValue.serverTimestamp() });
      return "aplicado";
    });
    logger.info(`onMovimientoCajaCreated ${clubId}/${movId}: ${resultado}`);
  } catch (err) {
    logger.error(`onMovimientoCajaCreated ${clubId}/${movId}`, err);
  }
});

// Todos los días a las 9: una caja que sigue abierta desde hace más de 20 h le avisa al dueño del club (una vez).
const RECORDATORIO_CAJA_HORAS = 20;

// "2026-10-22" → "jue 22 oct" (como formatDiaCorto en el cliente)
const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function fechaCortaArgentina(fechaStr) {
  const [y, m, d] = String(fechaStr || "").split("-").map(Number);
  if (!y || !m || !d) return String(fechaStr || "");
  const date = new Date(y, m - 1, d);
  return `${DIAS_CORTOS[date.getDay()]} ${d} ${MESES_CORTOS[m - 1]}`;
}

function fechaHoraArgentina(ts) {
  const date = ts && typeof ts.toDate === "function" ? ts.toDate() : ts instanceof Date ? ts : null;
  if (!date) return "";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: ZONA_HORARIA,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

exports.cajasAbiertasRecordatorio = onSchedule({ schedule: "every day 09:00", timeZone: ZONA_HORARIA }, async () => {
  const limite = Timestamp.fromMillis(Date.now() - RECORDATORIO_CAJA_HORAS * 60 * 60 * 1000);
  const snap = await db.collectionGroup("cajas").where("estado", "==", "abierta").where("abiertaEn", "<=", limite).get();
  const pendientes = snap.docs.filter((d) => d.data().recordatorioEnviado !== true);
  if (!pendientes.length) {
    logger.info(`cajasAbiertasRecordatorio: sin cajas abiertas viejas (${snap.size} abiertas ya avisadas)`);
    return;
  }
  let enviados = 0;
  for (const cajaDoc of pendientes) {
    try {
      const clubRef = cajaDoc.ref.parent.parent;
      if (!clubRef) continue;
      const clubSnap = await clubRef.get();
      const ownerUid = clubSnap.exists ? clubSnap.data().ownerUid : null;
      await db.runTransaction(async (tx) => {
        const fresh = await tx.get(cajaDoc.ref);
        if (!fresh.exists) return;
        const caja = fresh.data();
        if (caja.estado !== "abierta" || caja.recordatorioEnviado === true) return;
        if (ownerUid) {
          tx.set(nuevaNotificacionRef(ownerUid), {
            tipo: "caja_abierta",
            titulo: "Caja abierta desde ayer",
            mensaje: `La caja de ${caja.dispositivo || "un dispositivo"} sigue abierta desde ${fechaHoraArgentina(caja.abiertaEn)}. Cerrala desde Bar → Caja.`,
            link: "/admin/bar/caja",
            icono: "⚠️",
            leida: false,
            createdAt: FieldValue.serverTimestamp(),
          });
        }
        tx.update(cajaDoc.ref, { recordatorioEnviado: true });
        enviados += 1;
      });
    } catch (err) {
      logger.error(`cajasAbiertasRecordatorio: no se pudo avisar por ${cajaDoc.ref.path}`, err);
    }
  }
  logger.info(`cajasAbiertasRecordatorio: ${enviados} avisos de ${pendientes.length} cajas`);
});

// ============================================================================
// BAR — VENTAS: una venta (clubs/{c}/ventas/{numero}) baja el stock y entra a la caja a través de movimientos
// "venta" (y los repone con "anulacion" al anularse). Los movimientos llevan ids deterministas
// ({numero}_venta_{i} / {numero}_anul_{i}) y se crean en la misma transacción que marca la venta como aplicada:
// un reintento nunca duplica nada. Los aplican onMovimientoStockCreated y onMovimientoCajaCreated. El vuelto no
// es un movimiento: el pago en efectivo ya viene neto (monto = entregado − vuelto).
// Una venta hecha sin internet llega tarde: si para entonces la caja está cerrada, onMovimientoCajaCreated marca
// el movimiento con error "caja inexistente o cerrada" y los totales de esa caja no cambian (queda en el log).
// ============================================================================
const refsDeVenta = (clubId, numero) => {
  const clubRef = db.collection("clubs").doc(clubId);
  return {
    venta: clubRef.collection("ventas").doc(numero),
    stock: (sufijo) => clubRef.collection("movimientosStock").doc(`${numero}_${sufijo}`),
    caja: (sufijo) => clubRef.collection("movimientosCaja").doc(`${numero}_${sufijo}`),
  };
};

// Escribe los movimientos de una venta (signo +1 = venta, −1 = anulación) salvo los que ya existan
async function escribirMovimientosDeVenta(tx, clubId, numero, venta, { etiqueta, signo }) {
  const refs = refsDeVenta(clubId, numero);
  const items = Array.isArray(venta.items) ? venta.items : [];
  const pagos = Array.isArray(venta.pagos) ? venta.pagos : [];
  const tipo = signo > 0 ? "venta" : "anulacion";
  const pendientes = [];
  items.forEach((it, i) => {
    const cantidad = Number(it && it.cantidad);
    if (!it || it.controlaStock === false || !it.productoId || !Number.isFinite(cantidad) || cantidad <= 0) return;
    pendientes.push({
      ref: refs.stock(`${etiqueta}_${i}`),
      data: {
        productoId: String(it.productoId),
        tipo,
        cantidad: -signo * cantidad,
        costoUnitario: null,
        proveedorId: null,
        ventaId: numero,
        nota: numero,
        creadoPor: venta.creadoPor || null,
        creadoEn: FieldValue.serverTimestamp(),
        aplicado: false,
      },
    });
  });
  pagos.forEach((p, j) => {
    const monto = Number(p && p.monto);
    if (!p || !MEDIOS_CAJA.includes(p.medio) || !Number.isFinite(monto) || monto <= 0) return;
    pendientes.push({
      ref: refs.caja(`${etiqueta}_${j}`),
      data: {
        cajaId: venta.cajaId || null,
        tipo,
        medio: p.medio,
        monto,
        ref: { ventaId: numero },
        nota: numero,
        creadoPor: venta.creadoPor || null,
        creadoPorNombre: venta.creadoPorNombre || null,
        creadoEn: FieldValue.serverTimestamp(),
        aplicado: false,
      },
    });
  });
  if (!pendientes.length) return 0;
  const existentes = await tx.getAll(...pendientes.map((p) => p.ref));
  let escritos = 0;
  pendientes.forEach((p, k) => {
    if (existentes[k].exists) return;
    tx.set(p.ref, p.data);
    escritos += 1;
  });
  return escritos;
}

exports.onVentaCreated = onDocumentCreated("clubs/{clubId}/ventas/{numero}", async (event) => {
  const { clubId, numero } = event.params;
  const refs = refsDeVenta(clubId, numero);
  try {
    const resultado = await db.runTransaction(async (tx) => {
      const snap = await tx.get(refs.venta);
      if (!snap.exists) return "sin venta";
      const venta = snap.data() || {};
      if (venta.aplicado === true) return "ya aplicada";
      // Lecturas del reporte y del ticket público ANTES de cualquier escritura de la transacción
      const clubRef = db.collection("clubs").doc(clubId);
      const [clubSnap, categorias, cuentaSnap] = await Promise.all([
        tx.get(clubRef),
        categoriasDeVenta(clubRef, venta, tx),
        venta.cuentaId ? tx.get(clubRef.collection("cuentas").doc(String(venta.cuentaId))) : Promise.resolve(null),
      ]);
      const n = await escribirMovimientosDeVenta(tx, clubId, numero, venta, { etiqueta: "venta", signo: 1 });
      const cuenta = cuentaSnap && cuentaSnap.exists ? cuentaSnap.data() : null;
      sumarAlReporte(tx, clubRef, fechaDe(venta.creadoEn), aporteDeVenta(venta, { categorias, cuenta, signo: 1 }));
      // P3-14: el ticket público va con el id aleatorio de la venta (publicId); las ventas viejas, con el número
      tx.set(clubRef.collection("ticketsPublicos").doc(idTicketPublicoDe(venta, numero)), ticketPublicoDe(venta, clubSnap.exists ? clubSnap.data() : {}, clubId, numero));
      tx.update(refs.venta, { aplicado: true, aplicadoEn: FieldValue.serverTimestamp(), rollupAplicado: true });
      return `aplicada (${n} movimientos)`;
    });
    logger.info(`onVentaCreated ${clubId}/${numero}: ${resultado}`);
  } catch (err) {
    logger.error(`onVentaCreated ${clubId}/${numero}`, err);
  }
});

exports.onVentaUpdated = onDocumentUpdated("clubs/{clubId}/ventas/{numero}", async (event) => {
  const { clubId, numero } = event.params;
  const antes = event.data && event.data.before ? event.data.before.data() : null;
  const despues = event.data && event.data.after ? event.data.after.data() : null;
  if (!antes || !despues || antes.estado === "anulada" || despues.estado !== "anulada") return;
  const refs = refsDeVenta(clubId, numero);
  try {
    const resultado = await db.runTransaction(async (tx) => {
      const snap = await tx.get(refs.venta);
      if (!snap.exists) return "sin venta";
      const venta = snap.data() || {};
      if (venta.estado !== "anulada") return "no anulada";
      if (venta.anulacionAplicada === true) return "anulación ya aplicada";
      const clubRef = db.collection("clubs").doc(clubId);
      const [categorias, cuentaSnap] = await Promise.all([
        categoriasDeVenta(clubRef, venta, tx),
        venta.cuentaId ? tx.get(clubRef.collection("cuentas").doc(String(venta.cuentaId))) : Promise.resolve(null),
      ]);
      const n = await escribirMovimientosDeVenta(tx, clubId, numero, venta, { etiqueta: "anul", signo: -1 });
      // El reporte resta la venta (solo si la había sumado: las anteriores a P3-6 se recalculan con recalcularReporte)
      if (venta.rollupAplicado === true) {
        const cuenta = cuentaSnap && cuentaSnap.exists ? cuentaSnap.data() : null;
        sumarAlReporte(tx, clubRef, fechaDe(venta.creadoEn), aporteDeVenta(venta, { categorias, cuenta, signo: -1 }));
      }
      tx.set(clubRef.collection("ticketsPublicos").doc(idTicketPublicoDe(venta, numero)), { estado: "anulada", anulacion: { motivo: (venta.anulacion && venta.anulacion.motivo) || null }, actualizadoEn: FieldValue.serverTimestamp() }, { merge: true });
      tx.update(refs.venta, { anulacionAplicada: true, anulacionAplicadaEn: FieldValue.serverTimestamp(), rollupAnulacionAplicado: venta.rollupAplicado === true });
      return `anulación aplicada (${n} movimientos)`;
    });
    logger.info(`onVentaUpdated ${clubId}/${numero}: ${resultado}`);
    // P3-8: una venta de cuenta anulada devuelve la deuda a la cuenta; una venta de Mercado Pago se devuelve.
    // Las online anuladas con mpAnularVenta (B-P3-8-1) ya hicieron ese camino en la callable: acá no se repite.
    if (resultado.startsWith("anulación aplicada") && !(despues.anulacion && despues.anulacion.origen === "mpAnularVenta")) await revertirVentaDeCuenta(clubId, numero, despues);
  } catch (err) {
    logger.error(`onVentaUpdated ${clubId}/${numero}`, err);
  }
});

// ============================================================================
// BAR — CUENTA DEL TURNO: hasta que se cierra, una cuenta (clubs/{c}/cuentas/{grupoId}) no mueve nada. Al pasar a
// "cerrada" esta Function hace, UNA sola vez (marca cuentaAplicada en la misma transacción):
//   1. los movimientos de stock de sus consumos (ids cuenta_{id}_{lineaId}, tipo "venta") — las ventas que cerraron
//      la cuenta llevan todas sus líneas con controlaStock false, así onVentaCreated no las mueve: no hay doble baja;
//   2. en los turnos de la reserva (reservas where grupoId == id): cuentaCerrada, cuentaTotal, cuentaCerradaEn y
//      señaPagada: true cuando la seña se cobró en la cuenta (cancha.cobrar y la seña estaba pendiente);
// y avisa al jugador que reservó. Al pasar a "anulada" solo avisa (nada se movió).
// La caja NO se toca acá: la mueven las ventas (sus pagos) vía onVentaCreated → onMovimientoCajaCreated.
// ============================================================================
// B-P3-7b-1 (respaldo del cliente): cuando cambia la seña de una reserva (marcada cobrada, monto, pago online), la
// cuenta ABIERTA del turno se entera: copia seña/señaPagada si nadie pagó cancha todavía; si no, alerta. Idempotente.
exports.onReservaUpdated = onDocumentUpdated("clubs/{clubId}/reservas/{reservaId}", async (event) => {
  const { clubId, reservaId } = event.params;
  const antes = event.data && event.data.before ? event.data.before.data() : null;
  const despues = event.data && event.data.after ? event.data.after.data() : null;
  if (!antes || !despues) return;
  // P3-9: la prueba de 30 días empieza con la primera reserva confirmada del club
  if (despues.status === "confirmada" && antes.status !== "confirmada") await iniciarPruebaDelClub(clubId, despues);
  // P3-14 B: la seña pagada de una reserva cancelada se devuelve, queda como crédito o queda para el club
  if (despues.status === "cancelada" && antes.status !== "cancelada" && (despues.grupoId || reservaId) === reservaId) await procesarSeñaCancelada(clubId, reservaId, despues);
  // P3-15: el índice público de partidos abiertos sigue al partido y al estado de la reserva
  if ((antes.partidoAbierto || despues.partidoAbierto) && (JSON.stringify(antes.partidoAbierto || null) !== JSON.stringify(despues.partidoAbierto || null) || antes.status !== despues.status)) {
    await sincronizarIndicePartido(clubId, reservaId, despues).catch((err) => logger.error(`partido abierto ${clubId}/${reservaId}`, err));
  }
  if (!!antes.señaPagada === !!despues.señaPagada && Number(antes.seña || 0) === Number(despues.seña || 0)) return;
  const grupoId = despues.grupoId || reservaId;
  if (grupoId !== reservaId) return; // solo la cabeza del grupo (los demás slots repiten los mismos campos)
  const cuentaRef = db.collection("clubs").doc(clubId).collection("cuentas").doc(grupoId);
  try {
    const resultado = await db.runTransaction(async (tx) => {
      const snap = await tx.get(cuentaRef);
      if (!snap.exists) return "sin cuenta";
      const cuenta = snap.data();
      const { cambios, alerta } = cc.sincronizarSeña(cuenta, despues);
      if (cambios) {
        tx.update(cuentaRef, { ...cambios, actualizadoEn: FieldValue.serverTimestamp() });
        return "copiada";
      }
      if (alerta && !(cuenta.alertas || []).includes(alerta)) {
        tx.update(cuentaRef, { alertas: FieldValue.arrayUnion(alerta), actualizadoEn: FieldValue.serverTimestamp() });
        return "alerta";
      }
      return "sin cambios";
    });
    logger.info(`onReservaUpdated ${clubId}/${reservaId}: seña → cuenta ${resultado}`);
  } catch (err) {
    logger.error(`onReservaUpdated ${clubId}/${reservaId}`, err);
  }
});

// El link de invitación de una cuenta deja de servir cuando la cuenta se anula (al cerrar, dentro de la transacción)
async function desactivarInvitacion(clubRef, cuentaRef, cuenta) {
  const inv = cuenta && cuenta.invitacion;
  if (!inv || !inv.token || inv.activa === false) return;
  try {
    const batch = db.batch();
    batch.update(clubRef.collection("invitacionesTurno").doc(String(inv.token)), { activa: false, cerradaEn: FieldValue.serverTimestamp() });
    batch.update(cuentaRef, { "invitacion.activa": false });
    await batch.commit();
  } catch (err) {
    logger.error(`desactivarInvitacion ${cuentaRef.path}`, err);
  }
}

exports.onCuentaUpdated = onDocumentUpdated("clubs/{clubId}/cuentas/{cuentaId}", async (event) => {
  const { clubId, cuentaId } = event.params;
  const antes = event.data && event.data.before ? event.data.before.data() : null;
  const despues = event.data && event.data.after ? event.data.after.data() : null;
  if (!antes || !despues || antes.estado !== "abierta" || despues.estado === "abierta") return;
  const clubRef = db.collection("clubs").doc(clubId);
  const cuentaRef = clubRef.collection("cuentas").doc(cuentaId);
  const textoTurno = `${despues.canchaNombre || "Cancha"} ${fechaCortaArgentina(despues.fecha)} ${despues.horaInicio || ""}${despues.horaFin ? `–${despues.horaFin}` : ""}`.trim();
  const total = Number(despues.totales && despues.totales.total) || 0;
  // Pedidos que quedaron en curso: con la cuenta cerrada o anulada ya no se pueden servir ni cobrar
  try {
    const n = await cancelarPedidosDeCuenta(clubRef, cuentaId, despues.estado === "anulada" ? "La cuenta fue anulada" : "La cuenta se cerró");
    if (n) logger.info(`onCuentaUpdated ${clubId}/${cuentaId}: ${n} pedidos cancelados`);
  } catch (err) {
    logger.error(`onCuentaUpdated ${clubId}/${cuentaId}: no se pudieron cancelar los pedidos`, err);
  }

  if (despues.estado === "anulada") {
    await desactivarInvitacion(clubRef, cuentaRef, despues);
    if (despues.jugadorUid && despues.cierreAutomatico !== true) {
      try {
        await nuevaNotificacionRef(despues.jugadorUid).set({
          tipo: "cuenta_anulada",
          titulo: "Cuenta del turno anulada",
          mensaje: `La cuenta de ${textoTurno} fue anulada por el club.`,
          link: "/mis-reservas",
          icono: "🧾",
          leida: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      } catch (err) {
        logger.error(`onCuentaUpdated ${clubId}/${cuentaId}: no se pudo avisar la anulación`, err);
      }
    }
    logger.info(`onCuentaUpdated ${clubId}/${cuentaId}: anulada`);
    return;
  }

  if (despues.estado !== "cerrada") return;
  try {
    const resultado = await db.runTransaction(async (tx) => {
      const snap = await tx.get(cuentaRef);
      if (!snap.exists) return "sin cuenta";
      const cuenta = snap.data() || {};
      if (cuenta.cuentaAplicada === true) return "ya aplicada";
      const ventaId = Array.isArray(cuenta.ventas) && cuenta.ventas.length ? String(cuenta.ventas[0]) : null;

      // 1. Stock de los consumos (una vez por línea; ids deterministas)
      const items = Array.isArray(cuenta.items) ? cuenta.items : [];
      const pendientes = [];
      items.forEach((it, i) => {
        const cantidad = Number(it && it.cantidad);
        if (!it || it.controlaStock === false || !it.productoId || !Number.isFinite(cantidad) || cantidad <= 0) return;
        pendientes.push({
          ref: clubRef.collection("movimientosStock").doc(`cuenta_${cuentaId}_${it.lineaId || i}`),
          data: {
            productoId: String(it.productoId),
            tipo: "venta",
            cantidad: -cantidad,
            costoUnitario: null,
            proveedorId: null,
            ventaId,
            cuentaId,
            nota: `Cuenta ${textoTurno}`,
            creadoPor: cuenta.cerradaPor || null,
            creadoEn: FieldValue.serverTimestamp(),
            aplicado: false,
          },
        });
      });
      // 2. Los turnos de la reserva (y los perfiles de los participantes registrados, para "Jugaste con…")
      const reservasSnap = await tx.get(clubRef.collection("reservas").where("grupoId", "==", cuentaId));
      const existentes = pendientes.length ? await tx.getAll(...pendientes.map((p) => p.ref)) : [];
      const registrados = cc.participantesActivos(cuenta).filter((p) => p.uid && p.anonimo !== true);
      const perfiles = registrados.length > 1 ? await tx.getAll(...registrados.map((p) => db.collection("perfilesPublicos").doc(p.uid))) : [];
      const fotoDe = new Map(perfiles.map((snap) => [snap.id, snap.exists ? snap.data().foto || null : null]));
      let escritos = 0;
      pendientes.forEach((p, k) => {
        if (existentes[k].exists) return;
        tx.set(p.ref, p.data);
        escritos += 1;
      });
      const cancha = cuenta.cancha || {};
      const señaCobradaAca = cancha.cobrar !== false && cancha.señaPagada !== true && Number(cancha.seña) > 0;
      const cambiosReserva = { cuentaCerrada: true, cuentaTotal: Number(cuenta.totales && cuenta.totales.total) || 0, cuentaCerradaEn: FieldValue.serverTimestamp() };
      if (señaCobradaAca) cambiosReserva.señaPagada = true;
      reservasSnap.docs.forEach((d) => tx.update(d.ref, cambiosReserva));
      if (cuenta.canchaId) {
        const k = limpiarClave(cuenta.canchaId);
        tx.set(
          clubRef.collection("reportesDiarios").doc(fechaDe(cuenta.cerradaEn)),
          { fecha: fechaDe(cuenta.cerradaEn), porCancha: { [k]: { nombre: cuenta.canchaNombre || null, cuentas: FieldValue.increment(1) } }, actualizadoEn: FieldValue.serverTimestamp() },
          { merge: true },
        );
      }
      // 3. "Jugaste con…": cada par de participantes registrados, en los dos sentidos (una vez por cuenta)
      let pares = 0;
      if (cuenta.companerosAplicado !== true && registrados.length > 1) {
        for (const a of registrados) {
          for (const b of registrados) {
            if (a.uid === b.uid) continue;
            tx.set(userRef(a.uid).collection("companeros").doc(b.uid), { uid: b.uid, nombre: b.nombre || "", foto: fotoDe.get(b.uid) || null, veces: FieldValue.increment(1), ultimaVez: FieldValue.serverTimestamp(), ultimoClubId: clubId }, { merge: true });
            pares += 1;
          }
        }
      }
      // 4. El link de invitación muere con la cuenta
      const cambiosCuenta = { cuentaAplicada: true, cuentaAplicadaEn: FieldValue.serverTimestamp(), companerosAplicado: true };
      if (cuenta.invitacion && cuenta.invitacion.token && cuenta.invitacion.activa !== false) {
        tx.update(clubRef.collection("invitacionesTurno").doc(String(cuenta.invitacion.token)), { activa: false, cerradaEn: FieldValue.serverTimestamp() });
        cambiosCuenta["invitacion.activa"] = false;
      }
      tx.update(cuentaRef, cambiosCuenta);
      return `cerrada: ${escritos} movimientos de stock, ${reservasSnap.size} turnos${señaCobradaAca ? ", seña cobrada" : ""}${pares ? `, ${pares} compañeros` : ""}`;
    });
    logger.info(`onCuentaUpdated ${clubId}/${cuentaId}: ${resultado}`);
    if (resultado === "ya aplicada" || resultado === "sin cuenta") return;
    // Avisos: con varios participantes, a cada registrado que pagó ("pagaste $ X"); si no, al titular como siempre
    const activos = cc.participantesActivos(despues);
    if (activos.length > 1) {
      const { pagaron } = cc.pagadoPorParticipante(despues);
      const batch = db.batch();
      let avisos = 0;
      for (const p of activos) {
        if (!p.uid || p.anonimo === true) continue;
        const pago = pagaron.get(p.id) || 0;
        if (pago <= 0) continue;
        batch.set(nuevaNotificacionRef(p.uid), {
          tipo: "cuenta_cerrada",
          titulo: "Cuenta del turno cerrada",
          mensaje: `${textoTurno} · pagaste $ ${Math.round(pago).toLocaleString("es-AR")} de $ ${Math.round(total).toLocaleString("es-AR")}`,
          link: `/mi-cuenta/${clubId}/${cuentaId}`,
          icono: "🧾",
          leida: false,
          createdAt: FieldValue.serverTimestamp(),
        });
        avisos += 1;
      }
      if (avisos) await batch.commit();
    } else if (despues.jugadorUid) {
      await nuevaNotificacionRef(despues.jugadorUid).set({
        tipo: "cuenta_cerrada",
        titulo: "Cuenta del turno cerrada",
        mensaje: `${textoTurno} · total $ ${Math.round(total).toLocaleString("es-AR")}`,
        link: "/mis-reservas",
        icono: "🧾",
        leida: false,
        createdAt: FieldValue.serverTimestamp(),
      });
    }
  } catch (err) {
    logger.error(`onCuentaUpdated ${clubId}/${cuentaId}`, err);
  }
});

// Todos los días a las 4: las cuentas abiertas de días anteriores. Sin consumos → se anulan solas ("sin consumos,
// vencida"); con consumos → se avisa al dueño del club una vez (avisoVencidaEnviado) y la cuenta queda abierta
// para que la cierre alguien (cobrándola o anulándola).
exports.cerrarCuentasVencidas = onSchedule({ schedule: "every day 04:00", timeZone: ZONA_HORARIA }, async () => {
  const hoy = fechaLocalArgentina();
  // Pedidos colgados: en curso (pendiente / aceptado / listo) en turnos que terminaron hace más de 2 h. Un aceptado
  // o listo conserva sus líneas en la cuenta (se sirvió o se cobra): solo cambia el estado del tablero.
  try {
    const colgados = await db.collectionGroup("pedidos").where("estado", "in", ["pendiente", "aceptado", "listo"]).get();
    let cancelados = 0;
    const cuentasTocadas = new Map();
    for (const d of colgados.docs) {
      const p = d.data() || {};
      if (!cc.terminoHace(p)) continue;
      await d.ref.update({
        estado: "cancelado",
        rechazo: { motivo: "El turno terminó", por: "sistema", porNombre: "Padely" },
        "tiempos.cancelado": FieldValue.serverTimestamp(),
        actualizadoEn: FieldValue.serverTimestamp(),
      });
      cancelados += 1;
      if (p.estado === "pendiente" && p.cuentaId && d.ref.parent.parent) cuentasTocadas.set(`${d.ref.parent.parent.path}/${p.cuentaId}`, { clubRef: d.ref.parent.parent, cuentaId: p.cuentaId });
    }
    for (const { clubRef, cuentaId } of cuentasTocadas.values()) await recalcularPedidosPendientes(clubRef, cuentaId);
    logger.info(`cerrarCuentasVencidas: ${cancelados} pedidos colgados cancelados (${colgados.size} en curso)`);
  } catch (err) {
    logger.error("cerrarCuentasVencidas: barrido de pedidos colgados", err);
  }
  const snap = await db.collectionGroup("cuentas").where("estado", "==", "abierta").where("fecha", "<", hoy).get();
  if (snap.empty) {
    logger.info("cerrarCuentasVencidas: sin cuentas vencidas");
    return;
  }
  const util = await cuentasUtil();
  let anuladas = 0;
  let cerradas = 0;
  let avisos = 0;
  for (const cuentaDoc of snap.docs) {
    try {
      const cuenta = cuentaDoc.data() || {};
      const clubRef = cuentaDoc.ref.parent.parent;
      // B-P3-8b-2: nunca se anula una cuenta con plata (pagos, ventas, seña pagada)
      const saldos = util.saldosDeCuenta(cuenta);
      const decision = cc.decisionCuentaVencida(cuenta, { pendiente: saldos.pendiente });
      if (decision === "cerrar") {
        await cuentaDoc.ref.update({
          estado: "cerrada",
          cerradaPor: "sistema",
          cerradaEn: FieldValue.serverTimestamp(),
          cierreAutomatico: true,
          totales: util.calcularTotalesCuenta(cuenta),
          actualizadoEn: FieldValue.serverTimestamp(),
        });
        cerradas += 1;
        continue;
      }
      if (decision === "anular") {
        await cuentaDoc.ref.update({
          estado: "anulada",
          cerradaPor: "sistema",
          cerradaEn: FieldValue.serverTimestamp(),
          cierreAutomatico: true,
          anulacion: { por: "sistema", porNombre: "Padely", motivo: "sin consumos ni pagos, vencida" },
          actualizadoEn: FieldValue.serverTimestamp(),
        });
        anuladas += 1;
        continue;
      }
      if (cuenta.avisoVencidaEnviado === true || !clubRef) continue;
      const clubSnap = await clubRef.get();
      const ownerUid = clubSnap.exists ? clubSnap.data().ownerUid : null;
      if (ownerUid) {
        await nuevaNotificacionRef(ownerUid).set({
          tipo: "cuenta_vencida",
          titulo: "Cuenta del turno sin cerrar",
          mensaje: `La cuenta de ${cuenta.canchaNombre || "una cancha"} del ${cuenta.fecha || ""} (${cuenta.nombreJugador || "sin nombre"}) sigue abierta con $ ${Math.round(Number(saldos.pendiente) || 0).toLocaleString("es-AR")} pendientes. Cobrala o anulala desde Bar → Cuentas.`,
          link: "/admin/bar/cuentas",
          icono: "🧾",
          leida: false,
          createdAt: FieldValue.serverTimestamp(),
        });
        avisos += 1;
      }
      await cuentaDoc.ref.update({ avisoVencidaEnviado: true });
    } catch (err) {
      logger.error(`cerrarCuentasVencidas: ${cuentaDoc.ref.path}`, err);
    }
  }
  logger.info(`cerrarCuentasVencidas: ${anuladas} anuladas, ${cerradas} cerradas, ${avisos} avisos (${snap.size} vencidas)`);
});

// ============================================================================
// BAR — PEDIDOS A LA BARRA: un pedido (clubs/{c}/pedidos) lo crea el jugador o un anónimo en la cancha; la barra
// lo acepta desde el cliente (los items pasan a la cuenta del turno). Acá: lo que las reglas no pueden mirar
// (horario del turno, máximo 3 en espera, cuenta cerrada → rechazo automático), el borrado del qrToken, el contador
// pedidosPendientes de la cuenta y las notificaciones (a la barra al crearse; al jugador en cada cambio de estado).
// ============================================================================
const PEDIDO_MARGEN_MIN = 15;
const PEDIDO_MAX_PENDIENTES = 3;
const MENSAJE_ESTADO_PEDIDO = {
  aceptado: (p) => ({ titulo: "Tu pedido fue aceptado", mensaje: `${resumenPedido(p)} · ya lo están preparando.` }),
  listo: (p) => ({ titulo: "Tu pedido está listo", mensaje: `${resumenPedido(p)} · retiralo en la barra.` }),
  entregado: (p) => ({ titulo: "Pedido entregado", mensaje: `${resumenPedido(p)} · va a la cuenta del turno.` }),
  rechazado: (p) => ({ titulo: "Pedido rechazado", mensaje: `${resumenPedido(p)} · ${(p.rechazo && p.rechazo.motivo) || "sin motivo"}.` }),
  cancelado: (p) => ({ titulo: "Pedido cancelado", mensaje: `${resumenPedido(p)} · ${(p.rechazo && p.rechazo.motivo) || "cancelado"}.` }),
};
function resumenPedido(p) {
  const items = Array.isArray(p.items) ? p.items : [];
  return items.map((it) => `${Number(it.cantidad) || 0} ${it.nombre}`).join(", ") || "Pedido";
}
function minutosDe(hora) {
  const [h, m] = String(hora || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
// Minutos del día, ahora, en Argentina
function minutosAhoraArgentina(date = new Date()) {
  const partes = new Intl.DateTimeFormat("en-GB", { timeZone: ZONA_HORARIA, hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(date);
  const h = Number((partes.find((p) => p.type === "hour") || {}).value) || 0;
  const m = Number((partes.find((p) => p.type === "minute") || {}).value) || 0;
  return (h % 24) * 60 + m;
}

// pedidosPendientes de la cuenta = pedidos en espera de ese turno (se recalcula, nunca se suma a ciegas)
async function recalcularPedidosPendientes(clubRef, cuentaId) {
  if (!cuentaId) return null;
  const cuentaRef = clubRef.collection("cuentas").doc(cuentaId);
  const [cuentaSnap, pendientes] = await Promise.all([
    cuentaRef.get(),
    clubRef.collection("pedidos").where("cuentaId", "==", cuentaId).where("estado", "==", "pendiente").get(),
  ]);
  if (!cuentaSnap.exists) return pendientes.size;
  if ((Number(cuentaSnap.data().pedidosPendientes) || 0) !== pendientes.size) await cuentaRef.update({ pedidosPendientes: pendientes.size });
  return pendientes.size;
}

// Los pedidos en curso de una cuenta pasan a cancelado (con motivo) — al cerrar o anular la cuenta
async function cancelarPedidosDeCuenta(clubRef, cuentaId, motivo) {
  const snap = await clubRef.collection("pedidos").where("cuentaId", "==", cuentaId).where("estado", "in", ["pendiente", "aceptado", "listo"]).get();
  if (snap.empty) return 0;
  const batch = db.batch();
  snap.docs.forEach((d) =>
    batch.update(d.ref, {
      estado: "cancelado",
      rechazo: { motivo, por: "sistema", porNombre: "Padely" },
      "tiempos.cancelado": FieldValue.serverTimestamp(),
      actualizadoEn: FieldValue.serverTimestamp(),
    }),
  );
  await batch.commit();
  return snap.size;
}

exports.onPedidoCreated = onDocumentCreated("clubs/{clubId}/pedidos/{pedidoId}", async (event) => {
  const { clubId, pedidoId } = event.params;
  const clubRef = db.collection("clubs").doc(clubId);
  const pedidoRef = clubRef.collection("pedidos").doc(pedidoId);
  try {
    const snap = await pedidoRef.get();
    if (!snap.exists) return;
    const pedido = snap.data() || {};
    if (pedido.validado === true) return;
    // Las reglas exigen creadoEn del servidor desde P3-6b; si un pedido viejo llegara sin fecha, se le pone la de
    // creación del documento en la misma escritura (la pantalla Barra ordena por creadoEn: sin fecha no se ve)
    const sinCreadoEn = pedido.creadoEn ? {} : { creadoEn: snap.createTime, actualizadoEn: FieldValue.serverTimestamp() };

    // 1. Validaciones que las reglas no pueden hacer
    let motivo = null;
    const reservaSnap = await clubRef.collection("reservas").doc(String(pedido.reservaGrupoId || "")).get();
    const reserva = reservaSnap.exists ? reservaSnap.data() : null;
    if (!reserva || reserva.status !== "confirmada") motivo = "El turno no está confirmado";
    else {
      const hoy = fechaLocalArgentina();
      const ahora = minutosAhoraArgentina();
      const inicio = minutosDe(reserva.horaInicio || reserva.hora);
      const fin = reserva.horaFin ? minutosDe(reserva.horaFin) : inicio + 60 * (Number(reserva.turnos) || 1);
      if (reserva.fecha !== hoy || ahora < inicio - PEDIDO_MARGEN_MIN || ahora > fin + PEDIDO_MARGEN_MIN) motivo = "Fuera del horario del turno";
    }
    if (!motivo && pedido.cuentaId) {
      const cuentaSnap = await clubRef.collection("cuentas").doc(String(pedido.cuentaId)).get();
      if (cuentaSnap.exists && cuentaSnap.data().estado === "cerrada") motivo = "La cuenta está cerrada";
    }
    if (!motivo && pedido.cuentaId) {
      const enEspera = await clubRef.collection("pedidos").where("cuentaId", "==", pedido.cuentaId).where("estado", "==", "pendiente").get();
      const otros = enEspera.docs.filter((d) => d.id !== pedidoId && (d.data().validado === true || d.createTime.toMillis() < snap.createTime.toMillis()));
      if (otros.length >= PEDIDO_MAX_PENDIENTES) motivo = `Máximo ${PEDIDO_MAX_PENDIENTES} pedidos en espera`;
    }

    if (motivo) {
      await pedidoRef.update({
        ...sinCreadoEn,
        estado: "rechazado",
        rechazo: { motivo, por: "sistema", porNombre: "Padely" },
        "tiempos.rechazado": FieldValue.serverTimestamp(),
        validado: true,
        qrToken: FieldValue.delete(),
        actualizadoEn: FieldValue.serverTimestamp(),
      });
      logger.info(`onPedidoCreated ${clubId}/${pedidoId}: rechazado (${motivo})`);
      return;
    }
    await pedidoRef.update({ ...sinCreadoEn, validado: true, qrToken: FieldValue.delete() });
    await recalcularPedidosPendientes(clubRef, pedido.cuentaId);

    // 2. Aviso a la barra: el dueño y el staff activo con 'pedidos' (una vez por pedido)
    if (pedido.notificado && pedido.notificado.staff === true) return;
    const [clubSnap, staffSnap] = await Promise.all([clubRef.get(), clubRef.collection("staff").where("activo", "==", true).get()]);
    const destinatarios = new Set();
    if (clubSnap.exists && clubSnap.data().ownerUid) destinatarios.add(clubSnap.data().ownerUid);
    staffSnap.docs.forEach((d) => {
      const s = d.data();
      if (Array.isArray(s.permisos) && s.permisos.includes("pedidos") && s.uid) destinatarios.add(s.uid);
    });
    const batch = db.batch();
    destinatarios.forEach((uid) =>
      batch.set(nuevaNotificacionRef(uid), {
        tipo: "pedido_nuevo",
        titulo: `Nuevo pedido · ${pedido.canchaNombre || "Cancha"}`,
        mensaje: `${pedido.nombre || "Alguien"}: ${resumenPedido(pedido)}${pedido.nota ? ` · "${pedido.nota}"` : ""}`,
        link: "/admin/bar/barra",
        icono: "🧾",
        leida: false,
        createdAt: FieldValue.serverTimestamp(),
      }),
    );
    batch.update(pedidoRef, { "notificado.staff": true });
    await batch.commit();
    logger.info(`onPedidoCreated ${clubId}/${pedidoId}: validado, ${destinatarios.size} avisos`);
  } catch (err) {
    logger.error(`onPedidoCreated ${clubId}/${pedidoId}`, err);
  }
});

exports.onPedidoUpdated = onDocumentUpdated("clubs/{clubId}/pedidos/{pedidoId}", async (event) => {
  const { clubId, pedidoId } = event.params;
  const antes = event.data && event.data.before ? event.data.before.data() : null;
  const despues = event.data && event.data.after ? event.data.after.data() : null;
  if (!antes || !despues || antes.estado === despues.estado) return;
  const clubRef = db.collection("clubs").doc(clubId);
  const pedidoRef = clubRef.collection("pedidos").doc(pedidoId);
  try {
    if (antes.estado === "pendiente" || despues.estado === "pendiente") await recalcularPedidosPendientes(clubRef, despues.cuentaId);
    const armar = MENSAJE_ESTADO_PEDIDO[despues.estado];
    // Al jugador (no a los anónimos: ellos ven el estado en la página del pedido). Una cancelación propia no se avisa.
    const cancelacionPropia = despues.estado === "cancelado" && !(despues.rechazo && despues.rechazo.motivo);
    if (!armar || despues.anonimo === true || !despues.jugadorUid || cancelacionPropia) return;
    if (despues.notificado && despues.notificado[despues.estado] === true) return;
    const { titulo, mensaje } = armar(despues);
    const batch = db.batch();
    batch.set(nuevaNotificacionRef(despues.jugadorUid), {
      tipo: `pedido_${despues.estado}`,
      titulo,
      mensaje,
      link: "/mis-reservas",
      icono: "🧾",
      leida: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    batch.update(pedidoRef, { [`notificado.${despues.estado}`]: true });
    await batch.commit();
    logger.info(`onPedidoUpdated ${clubId}/${pedidoId}: ${antes.estado} → ${despues.estado}, avisado`);
  } catch (err) {
    logger.error(`onPedidoUpdated ${clubId}/${pedidoId}`, err);
  }
});

// ============================================================================
// BAR — REPORTES DIARIOS, CATÁLOGO PÚBLICO, ALERTAS DE STOCK Y TICKETS PÚBLICOS
// Los reportes se leen de clubs/{c}/reportesDiarios/{YYYY-MM-DD} (fecha local de Argentina), que mantienen las
// Functions con FieldValue.increment: una venta suma, su anulación resta (ventas.anuladas y totalAnulado suman).
// Qué suma cada venta (cubos, descuentos, margen sobre costos conocidos) está en ./rollup.js, con sus pruebas.
// Nunca se recorre `ventas` al abrir Reportes. `recalcularReporte` (callable) reconstruye un día desde cero.
// catalogo/{productoId} es la proyección pública (sin costo ni stock) que leen jugadores y sesiones anónimas.
// alertasStock/{productoId} vive mientras el stock esté en o bajo el mínimo; avisosStockDiario avisa a las 8:30.
// P3-14: id del documento público = venta.publicId (aleatorio, lo pone el cliente o la Function que crea la venta);
// las ventas anteriores sin publicId usan el número (las reglas ya no dejan leer esos: hay que migrar)
const idTicketPublicoDe = (venta, numero) => (venta && typeof venta.publicId === "string" && /^[a-z0-9]{12,32}$/.test(venta.publicId) ? venta.publicId : numero);
// ticketsPublicos/{numero} es lo que muestra /t/v/{clubId}/{numero}: sin creadoPor, cajaId, descuentos por línea
// ni referencias de pago.
// ============================================================================
const { onCall, HttpsError } = require("firebase-functions/v2/https");

// La agregación vive en ./rollup (pura, con pruebas): qué suma una venta, cómo se anula y cómo cierra el día
const { aporteDeVenta, horaDe, limpiarClave, sumarAporte, tipoLineaDe, costoNumerico } = require("./rollup");
const fechaDe = (ts) => (ts && typeof ts.toDate === "function" ? fechaLocalArgentina(ts.toDate()) : fechaLocalArgentina());
// Rango [inicio, fin) en UTC de un día local argentino (UTC−3 fijo, sin horario de verano)
const rangoDelDia = (fecha) => ({ inicio: new Date(`${fecha}T00:00:00-03:00`), fin: new Date(`${fecha}T24:00:00-03:00`) });

// Convierte el aporte en un objeto con FieldValue.increment por hoja (nombres quedan como texto)
function comoIncrementos(aporte) {
  const inc = (obj) => {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === null || v === undefined) continue;
      if (typeof v === "number") out[k] = FieldValue.increment(v);
      else if (typeof v === "string") out[k] = v;
      else if (typeof v === "object") out[k] = inc(v);
    }
    return out;
  };
  return inc(aporte);
}

// Lee las categorías de los productos de una venta (dentro de la transacción si viene tx)
async function categoriasDeVenta(clubRef, venta, tx = null) {
  const ids = [...new Set((venta.items || []).filter((it) => it && it.productoId && (it.categoriaId === undefined || it.categoriaId === null)).map((it) => String(it.productoId)))];
  if (!ids.length) return {};
  const refs = ids.map((id) => clubRef.collection("productos").doc(id));
  const snaps = tx ? await tx.getAll(...refs) : await db.getAll(...refs);
  const out = {};
  snaps.forEach((s, i) => {
    out[ids[i]] = s.exists ? s.data().categoriaId || "sin" : "sin";
  });
  return out;
}

// Proyección pública de una venta (lo que muestra /t/v/{clubId}/{numero}): sin creadoPor, cajaId, ref de pagos
function ticketPublicoDe(venta, club, clubId, numero) {
  const t = (club && club.ticket) || {};
  return {
    numero,
    clubId,
    fecha: fechaDe(venta.creadoEn),
    hora: `${horaDe(venta.creadoEn)}:${String(venta.creadoEn && typeof venta.creadoEn.toDate === "function" ? new Intl.DateTimeFormat("en-GB", { timeZone: ZONA_HORARIA, minute: "2-digit" }).format(venta.creadoEn.toDate()) : "00").padStart(2, "0")}`,
    club: {
      nombre: (club && club.nombre) || "",
      direccion: (club && club.direccion) || "",
      ciudad: (club && club.ciudad) || "",
      ticket: { encabezado: t.encabezado || null, alias: t.alias || null, pie: t.pie || null },
    },
    items: (venta.items || []).map((it) => ({
      nombre: it.nombre || "",
      cantidad: Number(it.cantidad) || 0,
      precio: Number(it.precio) || 0,
      descuento: Number(it.descuento) || 0,
      subtotal: Number(it.subtotal) || 0,
      tipoLinea: tipoLineaDe(it),
    })),
    subtotal: Number(venta.subtotal) || 0,
    descuentoTotal: Number(venta.descuentoTotal) || 0,
    descuento: venta.descuento ? { tipo: venta.descuento.tipo || null, valor: Number(venta.descuento.valor) || 0, monto: Number(venta.descuento.monto) || 0 } : null,
    total: Number(venta.total) || 0,
    pagos: (venta.pagos || []).map((p) => ({ medio: p.medio || null, monto: Number(p.monto) || 0, entregado: p.entregado !== undefined ? Number(p.entregado) || 0 : null })),
    vuelto: Number(venta.vuelto) || 0,
    estado: venta.estado || "ok",
    anulacion: venta.anulacion ? { motivo: venta.anulacion.motivo || null } : null,
    cuentaNombre: venta.cuentaId && venta.cliente && venta.cliente.nombre ? venta.cliente.nombre : null,
    dispositivo: venta.dispositivo || null,
    creadoEn: venta.creadoEn || FieldValue.serverTimestamp(),
    actualizadoEn: FieldValue.serverTimestamp(),
  };
}

// Reporte del día de la venta ± su aporte, dentro de la transacción (set+merge crea el día si no existe)
function sumarAlReporte(tx, clubRef, fecha, aporte) {
  const ref = clubRef.collection("reportesDiarios").doc(fecha);
  tx.set(ref, { fecha, ...comoIncrementos(aporte), actualizadoEn: FieldValue.serverTimestamp() }, { merge: true });
}

// ----- Reconstrucción completa de un día (callable "recalcularReporte") -----
// Las líneas sin costo toman el costo ACTUAL del producto (una lectura de productos por recálculo) y cuentan en
// lineasCostoEstimado; nunca se escribe nada en la venta. Las que tampoco tienen costo en el producto quedan fuera
// del margen (lineasSinCosto).
async function reconstruirReporteDiario(clubId, fecha) {
  const clubRef = db.collection("clubs").doc(clubId);
  const { inicio, fin } = rangoDelDia(fecha);
  const [ventasSnap, cajasSnap, productosSnap] = await Promise.all([
    clubRef.collection("ventas").where("creadoEn", ">=", inicio).where("creadoEn", "<", fin).get(),
    clubRef.collection("cajas").where("cerradaEn", ">=", inicio).where("cerradaEn", "<", fin).get(),
    clubRef.collection("productos").get(),
  ]);
  const costosActuales = {};
  productosSnap.docs.forEach((d) => {
    const c = costoNumerico(d.data().costo);
    if (c !== null) costosActuales[d.id] = c;
  });
  const acumulado = { ventas: {}, porMedio: {}, porCategoria: {}, porProducto: {}, porHora: {}, porCancha: {} };
  const cuentas = new Map();
  for (const d of ventasSnap.docs) {
    const venta = d.data();
    const categorias = await categoriasDeVenta(clubRef, venta);
    let cuenta = null;
    if (venta.cuentaId) {
      if (!cuentas.has(venta.cuentaId)) {
        const cs = await clubRef.collection("cuentas").doc(String(venta.cuentaId)).get();
        cuentas.set(venta.cuentaId, cs.exists ? cs.data() : null);
      }
      cuenta = cuentas.get(venta.cuentaId);
    }
    sumarAporte(acumulado, aporteDeVenta(venta, { categorias, cuenta, signo: 1, costosActuales }));
    if (venta.estado === "anulada") sumarAporte(acumulado, aporteDeVenta(venta, { categorias, cuenta, signo: -1, costosActuales }));
  }
  // Cuentas cerradas ese día por cancha
  const cuentasSnap = await clubRef.collection("cuentas").where("cerradaEn", ">=", inicio).where("cerradaEn", "<", fin).get();
  cuentasSnap.docs.forEach((d) => {
    const c = d.data();
    if (c.estado !== "cerrada" || !c.canchaId) return;
    const k = limpiarClave(c.canchaId);
    acumulado.porCancha[k] = acumulado.porCancha[k] || { nombre: c.canchaNombre || null, total: 0, consumos: 0, cobros: 0 };
    acumulado.porCancha[k].cuentas = (acumulado.porCancha[k].cuentas || 0) + 1;
    acumulado.porCancha[k].nombre = acumulado.porCancha[k].nombre || c.canchaNombre || null;
  });
  const cierres = cajasSnap.docs
    .map((d) => cierreDeCaja(d.id, d.data()))
    .filter(Boolean)
    .sort((a, b) => (a.cerradaEn && a.cerradaEn.toMillis ? a.cerradaEn.toMillis() : 0) - (b.cerradaEn && b.cerradaEn.toMillis ? b.cerradaEn.toMillis() : 0));
  await clubRef.collection("reportesDiarios").doc(fecha).set({ fecha, ...acumulado, cajas: { cierres }, recalculadoEn: FieldValue.serverTimestamp(), actualizadoEn: FieldValue.serverTimestamp() });
  return { ventas: ventasSnap.size, cierres: cierres.length, estimadas: Number(acumulado.ventas.lineasCostoEstimado) || 0 };
}

function cierreDeCaja(cajaId, caja) {
  if (!caja || caja.estado !== "cerrada") return null;
  return {
    cajaId,
    dispositivo: caja.dispositivo || null,
    abiertaEn: caja.abiertaEn || null,
    cerradaEn: caja.cerradaEn || null,
    esperadoEfectivo: Number(caja.esperadoEfectivo) || 0,
    efectivoContado: Number(caja.arqueo && caja.arqueo.efectivoContado) || 0,
    diferencia: Number(caja.diferencia) || 0,
    ventas: Number(caja.totales && caja.totales.ventas) || 0,
  };
}

exports.recalcularReporte = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth || !request.auth.uid) throw new HttpsError("unauthenticated", "Iniciá sesión");
  const uid = request.auth.uid;
  const clubId = String((request.data && request.data.clubId) || "");
  const fecha = String((request.data && request.data.fecha) || "");
  if (!clubId || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new HttpsError("invalid-argument", "clubId y fecha (YYYY-MM-DD)");
  const clubRef = db.collection("clubs").doc(clubId);
  const [clubSnap, staffSnap] = await Promise.all([clubRef.get(), clubRef.collection("staff").doc(uid).get()]);
  if (!clubSnap.exists) throw new HttpsError("not-found", "El club no existe");
  const esDueño = clubSnap.data().ownerUid === uid;
  const staff = staffSnap.exists ? staffSnap.data() : null;
  const puede = esDueño || (staff && staff.activo === true && Array.isArray(staff.permisos) && staff.permisos.includes("verReportes"));
  if (!puede) throw new HttpsError("permission-denied", "Solo quien ve los reportes puede recalcularlos");
  const resultado = await reconstruirReporteDiario(clubId, fecha);
  logger.info(`recalcularReporte ${clubId}/${fecha} por ${uid}: ${resultado.ventas} ventas, ${resultado.cierres} cierres, ${resultado.estimadas} líneas con costo estimado`);
  return { ok: true, fecha, ...resultado };
});

// ----- Cierre de caja → reporte del día -----
exports.onCajaUpdated = onDocumentUpdated("clubs/{clubId}/cajas/{cajaId}", async (event) => {
  const { clubId, cajaId } = event.params;
  const antes = event.data && event.data.before ? event.data.before.data() : null;
  const despues = event.data && event.data.after ? event.data.after.data() : null;
  if (!antes || !despues || antes.estado === "cerrada" || despues.estado !== "cerrada") return;
  const clubRef = db.collection("clubs").doc(clubId);
  const cajaRef = clubRef.collection("cajas").doc(cajaId);
  try {
    const resultado = await db.runTransaction(async (tx) => {
      const snap = await tx.get(cajaRef);
      if (!snap.exists) return "sin caja";
      const caja = snap.data();
      if (caja.rollupAplicado === true) return "ya en el reporte";
      const cierre = cierreDeCaja(cajaId, caja);
      if (!cierre) return "no cerrada";
      const fecha = fechaDe(caja.cerradaEn);
      tx.set(clubRef.collection("reportesDiarios").doc(fecha), { fecha, cajas: { cierres: FieldValue.arrayUnion(cierre) }, actualizadoEn: FieldValue.serverTimestamp() }, { merge: true });
      tx.update(cajaRef, { rollupAplicado: true });
      return `cierre en ${fecha}`;
    });
    logger.info(`onCajaUpdated ${clubId}/${cajaId}: ${resultado}`);
  } catch (err) {
    logger.error(`onCajaUpdated ${clubId}/${cajaId}`, err);
  }
});

// ----- Catálogo público y alertas de stock -----
function entradaCatalogo(p, categoriaNombre) {
  return {
    nombre: p.nombre || "",
    categoriaId: p.categoriaId || null,
    categoriaNombre: categoriaNombre || null,
    precio: Number(p.precio) || 0,
    favorito: p.favorito === true,
    orden: Number(p.orden) || 0,
    activo: p.activo !== false,
    controlaStock: p.controlaStock !== false,
    agotado: p.controlaStock !== false && (Number(p.stock) || 0) <= 0,
    unidad: p.unidad || "u",
    actualizadoEn: FieldValue.serverTimestamp(),
  };
}
const bajoMinimo = (p) => p && p.controlaStock !== false && p.stockMinimo !== null && p.stockMinimo !== undefined && (Number(p.stock) || 0) <= Number(p.stockMinimo);

exports.onProductoWritten = onDocumentWritten("clubs/{clubId}/productos/{productoId}", async (event) => {
  const { clubId, productoId } = event.params;
  const clubRef = db.collection("clubs").doc(clubId);
  const catRef = clubRef.collection("catalogo").doc(productoId);
  const alertaRef = clubRef.collection("alertasStock").doc(productoId);
  try {
    const despues = event.data && event.data.after && event.data.after.exists ? event.data.after.data() : null;
    if (!despues) {
      await Promise.all([catRef.delete(), alertaRef.delete()]);
      logger.info(`onProductoWritten ${clubId}/${productoId}: borrado del catálogo`);
      return;
    }
    let categoriaNombre = null;
    if (despues.categoriaId) {
      const cs = await clubRef.collection("categoriasProductos").doc(String(despues.categoriaId)).get();
      categoriaNombre = cs.exists ? cs.data().nombre || null : null;
    }
    const batch = db.batch();
    batch.set(catRef, entradaCatalogo(despues, categoriaNombre));
    if (bajoMinimo(despues)) {
      const prev = await alertaRef.get();
      batch.set(
        alertaRef,
        {
          nombre: despues.nombre || "",
          stock: Number(despues.stock) || 0,
          stockMinimo: Number(despues.stockMinimo) || 0,
          desde: prev.exists && prev.data().desde ? prev.data().desde : FieldValue.serverTimestamp(),
          avisado: prev.exists ? prev.data().avisado || null : null,
          actualizadoEn: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    } else {
      batch.delete(alertaRef);
    }
    await batch.commit();
  } catch (err) {
    logger.error(`onProductoWritten ${clubId}/${productoId}`, err);
  }
});

exports.onCategoriaWritten = onDocumentWritten("clubs/{clubId}/categoriasProductos/{categoriaId}", async (event) => {
  const { clubId, categoriaId } = event.params;
  const clubRef = db.collection("clubs").doc(clubId);
  try {
    const snap = await clubRef.collection("categoriasProductos").get();
    const lista = snap.docs.map((d) => ({ id: d.id, nombre: d.data().nombre || "", orden: Number(d.data().orden) || 0 })).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));
    const despues = event.data && event.data.after && event.data.after.exists ? event.data.after.data() : null;
    const nombre = despues ? despues.nombre || null : null;
    const productos = await clubRef.collection("catalogo").where("categoriaId", "==", categoriaId).get();
    const batch = db.batch();
    batch.set(clubRef.collection("catalogo").doc("_categorias"), { lista, actualizadoEn: FieldValue.serverTimestamp() });
    productos.docs.forEach((d) => batch.update(d.ref, despues ? { categoriaNombre: nombre } : { categoriaId: null, categoriaNombre: null }));
    await batch.commit();
    logger.info(`onCategoriaWritten ${clubId}/${categoriaId}: ${lista.length} categorías, ${productos.size} productos`);
  } catch (err) {
    logger.error(`onCategoriaWritten ${clubId}/${categoriaId}`, err);
  }
});

// Todos los días a las 8:30: un aviso por club con alertas de stock sin avisar hoy, al dueño y al staff que carga stock
exports.avisosStockDiario = onSchedule({ schedule: "every day 08:30", timeZone: ZONA_HORARIA }, async () => {
  const hoy = fechaLocalArgentina();
  const snap = await db.collectionGroup("alertasStock").get();
  const porClub = new Map();
  snap.docs.forEach((d) => {
    const clubRef = d.ref.parent.parent;
    if (!clubRef) return;
    if (!porClub.has(clubRef.id)) porClub.set(clubRef.id, { clubRef, alertas: [] });
    porClub.get(clubRef.id).alertas.push(d);
  });
  let avisos = 0;
  for (const { clubRef, alertas } of porClub.values()) {
    const pendientes = alertas.filter((d) => d.data().avisado !== hoy);
    if (!pendientes.length) continue;
    try {
      const [clubSnap, staffSnap] = await Promise.all([clubRef.get(), clubRef.collection("staff").where("activo", "==", true).get()]);
      const destinatarios = new Set();
      if (clubSnap.exists && clubSnap.data().ownerUid) destinatarios.add(clubSnap.data().ownerUid);
      staffSnap.docs.forEach((d) => {
        const s = d.data();
        if (s.uid && Array.isArray(s.permisos) && (s.permisos.includes("editarProductos") || s.permisos.includes("cargarStock"))) destinatarios.add(s.uid);
      });
      const nombres = alertas.map((d) => d.data().nombre).filter(Boolean);
      const mensaje = `${nombres.slice(0, 5).join(", ")}${nombres.length > 5 ? ` y ${nombres.length - 5} más` : ""} · en o bajo el mínimo. Revisá Productos → Stock bajo.`;
      const batch = db.batch();
      destinatarios.forEach((uid) =>
        batch.set(nuevaNotificacionRef(uid), {
          tipo: "stock_bajo",
          titulo: `Stock bajo: ${alertas.length} ${alertas.length === 1 ? "producto" : "productos"}`,
          mensaje,
          link: "/admin/bar/productos?filtro=bajo",
          icono: "📦",
          leida: false,
          createdAt: FieldValue.serverTimestamp(),
        }),
      );
      alertas.forEach((d) => batch.update(d.ref, { avisado: hoy }));
      await batch.commit();
      avisos += destinatarios.size;
    } catch (err) {
      logger.error(`avisosStockDiario ${clubRef.id}`, err);
    }
  }
  logger.info(`avisosStockDiario: ${avisos} avisos en ${porClub.size} clubes`);
});

// P3-6 deploy: cambio de fuente para que todas las funciones se vuelvan a publicar (el primer deploy dejó el hash
// actualizado sin una revisión sana en Cloud Run).

// ----- Reconstrucción del catálogo público y las alertas de stock (callable "reconstruirCatalogo") -----
// onProductoWritten solo escribe catalogo/{id} cuando un producto cambia: los productos que ya existían antes de
// P3-6 necesitan una pasada completa. La corre el dueño o quien edita productos desde Productos → "Publicar catálogo".
exports.reconstruirCatalogo = onCall({ region: "us-central1" }, async (request) => {
  if (!request.auth || !request.auth.uid) throw new HttpsError("unauthenticated", "Iniciá sesión");
  const uid = request.auth.uid;
  const clubId = String((request.data && request.data.clubId) || "");
  if (!clubId) throw new HttpsError("invalid-argument", "clubId");
  const clubRef = db.collection("clubs").doc(clubId);
  const [clubSnap, staffSnap] = await Promise.all([clubRef.get(), clubRef.collection("staff").doc(uid).get()]);
  if (!clubSnap.exists) throw new HttpsError("not-found", "El club no existe");
  const staff = staffSnap.exists ? staffSnap.data() : null;
  const puede = clubSnap.data().ownerUid === uid || (staff && staff.activo === true && Array.isArray(staff.permisos) && staff.permisos.includes("editarProductos"));
  if (!puede) throw new HttpsError("permission-denied", "Solo quien edita productos puede publicar el catálogo");

  const [productos, categorias, catalogoViejo, alertasViejas] = await Promise.all([
    clubRef.collection("productos").get(),
    clubRef.collection("categoriasProductos").get(),
    clubRef.collection("catalogo").get(),
    clubRef.collection("alertasStock").get(),
  ]);
  const nombres = Object.fromEntries(categorias.docs.map((d) => [d.id, d.data().nombre || null]));
  const ops = [];
  const vivos = new Set();
  productos.docs.forEach((d) => {
    const p = d.data();
    vivos.add(d.id);
    ops.push((b) => b.set(clubRef.collection("catalogo").doc(d.id), entradaCatalogo(p, p.categoriaId ? nombres[p.categoriaId] || null : null)));
    const alertaRef = clubRef.collection("alertasStock").doc(d.id);
    if (bajoMinimo(p)) {
      const prev = alertasViejas.docs.find((a) => a.id === d.id);
      ops.push((b) =>
        b.set(
          alertaRef,
          {
            nombre: p.nombre || "",
            stock: Number(p.stock) || 0,
            stockMinimo: Number(p.stockMinimo) || 0,
            desde: prev && prev.data().desde ? prev.data().desde : FieldValue.serverTimestamp(),
            avisado: prev ? prev.data().avisado || null : null,
            actualizadoEn: FieldValue.serverTimestamp(),
          },
          { merge: true },
        ),
      );
    } else ops.push((b) => b.delete(alertaRef));
  });
  // Entradas del catálogo (y alertas) de productos que ya no existen
  catalogoViejo.docs.forEach((d) => {
    if (d.id !== "_categorias" && !vivos.has(d.id)) ops.push((b) => b.delete(d.ref));
  });
  alertasViejas.docs.forEach((d) => {
    if (!vivos.has(d.id)) ops.push((b) => b.delete(d.ref));
  });
  const lista = categorias.docs.map((d) => ({ id: d.id, nombre: d.data().nombre || "", orden: Number(d.data().orden) || 0 })).sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));
  ops.push((b) => b.set(clubRef.collection("catalogo").doc("_categorias"), { lista, actualizadoEn: FieldValue.serverTimestamp() }));
  await escribirEnLotes(ops);
  logger.info(`reconstruirCatalogo ${clubId} por ${uid}: ${productos.size} productos, ${lista.length} categorías`);
  return { ok: true, productos: productos.size, categorias: lista.length };
});

// ============================================================================
// CUENTA COMPARTIDA (P3-7): participantes, invitación por link, perfiles públicos, "Jugaste con…".
// Lo que escribe el cliente directo (staff): items, asignaciones, pagos, excluir/monto fijo. Lo que pasa por acá
// porque también lo hace el titular o un participante desde el celular (y porque toca otras colecciones):
//   crearInvitacionTurno · unirseATurno (anónimos incluidos) · sumarJugador · quitarParticipante · asignarLineas
//   reconstruirPerfilesPublicos (super-admin) · onUserWritten → perfilesPublicos/{uid}
// Al cerrarse una cuenta (onCuentaUpdated): companeros entre los registrados, la invitación muere.
// Todas las callables verifican dueño/staff/permiso y titular en el servidor; nunca confían en el cliente.
// ============================================================================

const esAnonimoReq = (request) => !!(request.auth && request.auth.token && request.auth.token.firebase && request.auth.token.firebase.sign_in_provider === "anonymous");
function exigirAuth(request, { anonimoOk = false } = {}) {
  if (!request.auth || !request.auth.uid) throw new HttpsError("unauthenticated", "Iniciá sesión");
  if (!anonimoOk && esAnonimoReq(request)) throw new HttpsError("permission-denied", "Entrá con tu cuenta de Padely");
  return request.auth.uid;
}
const texto = (v, max = 200) => String(v === null || v === undefined ? "" : v).trim().slice(0, max);
const PERMISOS_CUENTA = ["cobrarTurnos", "vender", "pedidos"];
// Dueño / staff del club con alguno de estos permisos
async function accesoClub(clubRef, uid, permisos = PERMISOS_CUENTA) {
  const [clubSnap, staffSnap] = await Promise.all([clubRef.get(), clubRef.collection("staff").doc(uid).get()]);
  if (!clubSnap.exists) throw new HttpsError("not-found", "El club no existe");
  const club = clubSnap.data();
  const staff = staffSnap.exists && staffSnap.data().activo === true ? staffSnap.data() : null;
  const esDueño = club.ownerUid === uid;
  const esStaff = esDueño || (!!staff && Array.isArray(staff.permisos) && permisos.some((p) => staff.permisos.includes(p)));
  return { club, staff, esDueño, esStaff, nombre: esDueño ? club.nombre || "El club" : (staff && staff.nombre) || null };
}
async function nombreDeUsuario(uid, alternativa = "") {
  if (!uid) return alternativa;
  const snap = await userRef(uid).get();
  return (snap.exists && (snap.data().nombre || snap.data().displayName)) || alternativa;
}
// La reserva cabeza del turno (clubs/{c}/reservas/{grupoId}), confirmada
async function reservaDelTurno(clubRef, grupoId, tx = null) {
  const ref = clubRef.collection("reservas").doc(grupoId);
  const snap = tx ? await tx.get(ref) : await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "El turno no existe");
  const r = snap.data();
  if (r.status !== "confirmada") throw new HttpsError("failed-precondition", "El turno no está confirmado");
  return r;
}
// Dentro de una transacción: la cuenta abierta del turno (o la nueva, con el titular). guardar(cambios) escribe
// una sola vez: set (nueva) o update (abierta). Las reglas no intervienen (Admin SDK): la verificación es nuestra.
async function cuentaDelTurnoEnTx(tx, clubRef, grupoId, { uid, nombre }) {
  const ref = clubRef.collection("cuentas").doc(grupoId);
  const snap = await tx.get(ref);
  if (snap.exists) {
    const cuenta = snap.data();
    if (cuenta.estado !== "abierta") throw new HttpsError("failed-precondition", cuenta.estado === "anulada" ? "La cuenta del turno fue anulada" : "La cuenta del turno ya está cerrada");
    const extra = {};
    if (!Array.isArray(cuenta.participantes) || !cuenta.participantes.length) {
      extra.participantes = [cc.titularDe(cuenta, { agregadoPor: uid, ahora: Timestamp.now() })];
      extra.participantesUids = cc.uidsDe(extra.participantes);
    }
    return { ref, cuenta: { ...cuenta, ...extra }, nueva: false, guardar: (cambios) => tx.update(ref, { ...extra, ...cambios, actualizadoEn: FieldValue.serverTimestamp() }) };
  }
  const reserva = await reservaDelTurno(clubRef, grupoId, tx);
  const datos = { ...cc.cuentaDesdeReserva(grupoId, reserva, { agregadoPor: uid, ahora: Timestamp.now() }), abiertaPor: uid, abiertaPorNombre: nombre || null, abiertaEn: FieldValue.serverTimestamp(), cerradaPor: null, cerradaEn: null, actualizadoEn: FieldValue.serverTimestamp() };
  return { ref, cuenta: datos, nueva: true, guardar: (cambios) => tx.set(ref, { ...datos, ...cambios }) };
}
const horaTurno = (t) => `${t.horaInicio || ""}${t.horaFin ? `–${t.horaFin}` : ""}`;
const avisoA = (uid, datos) => nuevaNotificacionRef(uid).set({ ...datos, leida: false, createdAt: FieldValue.serverTimestamp() });

// ----- Invitación por link (WhatsApp) -----
exports.crearInvitacionTurno = onCall({ region: REGION }, async (request) => {
  const uid = exigirAuth(request);
  const clubId = texto(request.data && request.data.clubId, 80);
  const grupoId = texto(request.data && request.data.grupoId, 120);
  if (!clubId || !grupoId) throw new HttpsError("invalid-argument", "clubId y grupoId");
  const clubRef = db.collection("clubs").doc(clubId);
  const [acceso, reserva] = await Promise.all([accesoClub(clubRef, uid), reservaDelTurno(clubRef, grupoId)]);
  const esTitular = !!reserva.jugadorUid && reserva.jugadorUid === uid;
  if (!esTitular && !acceso.esStaff) throw new HttpsError("permission-denied", "Solo el titular del turno o el club pueden invitar");
  if (cc.terminoHace(reserva)) throw new HttpsError("failed-precondition", "El turno ya terminó");
  const nombre = acceso.esStaff ? acceso.nombre || (await nombreDeUsuario(uid)) : await nombreDeUsuario(uid, reserva.nombreJugador);
  const token = await db.runTransaction(async (tx) => {
    const { cuenta, guardar } = await cuentaDelTurnoEnTx(tx, clubRef, grupoId, { uid, nombre });
    if (cuenta.invitacion && cuenta.invitacion.activa === true && cuenta.invitacion.token) {
      guardar({});
      return cuenta.invitacion.token;
    }
    const nuevo = cc.generarToken(16);
    tx.set(clubRef.collection("invitacionesTurno").doc(nuevo), {
      grupoId,
      clubId,
      clubNombre: acceso.club.nombre || "",
      canchaNombre: cuenta.canchaNombre || "",
      fecha: cuenta.fecha || reserva.fecha || "",
      horaInicio: cuenta.horaInicio || "",
      horaFin: cuenta.horaFin || "",
      titularNombre: cuenta.nombreJugador || "",
      activa: true,
      creadaEn: FieldValue.serverTimestamp(),
    });
    guardar({ invitacion: { token: nuevo, activa: true, creadaEn: FieldValue.serverTimestamp(), creadaPor: uid } });
    return nuevo;
  });
  logger.info(`crearInvitacionTurno ${clubId}/${grupoId} por ${uid}${esTitular ? " (titular)" : ""}`);
  return { ok: true, grupoId, token };
});

exports.unirseATurno = onCall({ region: REGION }, async (request) => {
  const uid = exigirAuth(request, { anonimoOk: true });
  const anonimo = esAnonimoReq(request);
  const clubId = texto(request.data && request.data.clubId, 80);
  const token = texto(request.data && request.data.token, 40);
  const nombreDado = texto(request.data && request.data.nombre, 40);
  // M2 (P3-8b): reclamar = id de un invitado sin cuenta con el mismo nombre que la persona dice ser; nuevo = "soy otra"
  const reclamarId = texto(request.data && request.data.reclamar, 80);
  const esNuevo = request.data && request.data.nuevo === true;
  if (!clubId || !token) throw new HttpsError("invalid-argument", "clubId y token");
  const clubRef = db.collection("clubs").doc(clubId);
  const invSnap = await clubRef.collection("invitacionesTurno").doc(token).get();
  if (!invSnap.exists || invSnap.data().activa !== true) throw new HttpsError("not-found", "Este turno ya cerró o el link no es válido");
  const inv = invSnap.data();
  if (!cc.ventanaUnirse(inv)) throw new HttpsError("failed-precondition", "Fuera del horario del turno");
  const nombre = anonimo ? nombreDado : (await nombreDeUsuario(uid)) || nombreDado;
  if (!nombre || nombre.length < 2) throw new HttpsError("invalid-argument", "Decinos cómo te llamás (2 a 40 letras)");
  const resultado = await db.runTransaction(async (tx) => {
    const ref = clubRef.collection("cuentas").doc(inv.grupoId);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "La cuenta del turno no existe");
    const cuenta = snap.data();
    if (cuenta.estado !== "abierta") throw new HttpsError("failed-precondition", "Este turno ya cerró");
    const participantes = cc.participantesDe(cuenta, { agregadoPor: uid, ahora: Timestamp.now() }).map((p) => ({ ...p }));
    const yo = participantes.find((p) => p.uid === uid);
    if (yo && yo.estado !== "quitado") return { participanteId: yo.id, nuevo: false, titularUid: cuenta.jugadorUid, cuenta };
    let agregado = yo;
    if (yo) yo.estado = "activo";
    else if (reclamarId) {
      // Reclama el lugar de un invitado sin cuenta con su mismo nombre que no pagó nada: queda con su uid
      const cand = participantes.find((p) => p.id === reclamarId);
      if (!cand || !cc.huespedReclamable(cand, cuenta, nombre)) throw new HttpsError("failed-precondition", "Ese lugar ya no se puede reclamar: sumate como una persona nueva");
      Object.assign(cand, { uid, anonimo, tipo: anonimo ? "invitado" : "jugador", estado: "activo", reclamadoEn: Timestamp.now() });
      agregado = cand;
    } else {
      if (!esNuevo) {
        const cand = participantes.find((p) => cc.huespedReclamable(p, cuenta, nombre));
        if (cand) throw new HttpsError("already-exists", `¿Sos ${cand.nombre}?`, { candidato: { id: cand.id, nombre: cand.nombre } });
      }
      if (cc.participantesActivos({ participantes }).length >= cc.PARTICIPANTES_MAX) throw new HttpsError("resource-exhausted", `El turno ya tiene ${cc.PARTICIPANTES_MAX} personas`);
      participantes.push(cc.nuevoParticipante({ uid, nombre, tipo: anonimo ? "invitado" : "jugador", anonimo, origen: "link", agregadoPor: uid, ahora: Timestamp.now() }));
      agregado = participantes[participantes.length - 1];
    }
    tx.update(ref, { participantes, participantesUids: cc.uidsDe(participantes), actualizadoEn: FieldValue.serverTimestamp() });
    return { participanteId: agregado.id, nuevo: true, reclamado: !!reclamarId, titularUid: cuenta.jugadorUid, cuenta };
  });
  if (resultado.nuevo && resultado.titularUid && resultado.titularUid !== uid) {
    try {
      await avisoA(resultado.titularUid, {
        tipo: "turno_se_sumo",
        titulo: `${nombre} se sumó a tu turno`,
        mensaje: `${nombre} se sumó a tu turno de las ${resultado.cuenta.horaInicio || ""} en ${inv.clubNombre || "el club"} (${inv.canchaNombre || "cancha"}).`,
        link: `/mi-cuenta/${clubId}/${inv.grupoId}`,
        icono: "🎾",
      });
    } catch (err) {
      logger.error(`unirseATurno ${clubId}/${inv.grupoId}: no se pudo avisar al titular`, err);
    }
  }
  logger.info(`unirseATurno ${clubId}/${inv.grupoId}: ${uid}${anonimo ? " (anónimo)" : ""} → ${resultado.participanteId}${resultado.nuevo ? "" : " (ya estaba)"}`);
  return { ok: true, grupoId: inv.grupoId, participanteId: resultado.participanteId };
});

// ----- Sumar / quitar desde el panel o el titular -----
exports.sumarJugador = onCall({ region: REGION }, async (request) => {
  const uid = exigirAuth(request);
  const clubId = texto(request.data && request.data.clubId, 80);
  const grupoId = texto(request.data && request.data.grupoId, 120);
  const otroUid = texto(request.data && request.data.uid, 128);
  const nombreDado = texto(request.data && request.data.nombre, 40);
  if (!clubId || !grupoId || (!otroUid && nombreDado.length < 2)) throw new HttpsError("invalid-argument", "clubId, grupoId y un jugador (uid) o un nombre de 2 a 40 letras");
  const clubRef = db.collection("clubs").doc(clubId);
  const [acceso, reserva] = await Promise.all([accesoClub(clubRef, uid), reservaDelTurno(clubRef, grupoId)]);
  const esTitular = !!reserva.jugadorUid && reserva.jugadorUid === uid;
  if (!esTitular && !acceso.esStaff) throw new HttpsError("permission-denied", "Solo el titular del turno o el club pueden sumar jugadores");
  if (cc.terminoHace(reserva)) throw new HttpsError("failed-precondition", "El turno ya terminó");
  let nombreOtro = nombreDado;
  if (otroUid) {
    const perfil = await userRef(otroUid).get();
    if (!perfil.exists) throw new HttpsError("not-found", "Ese jugador no existe");
    nombreOtro = perfil.data().nombre || nombreDado || "Jugador";
  }
  const quien = acceso.esStaff && !esTitular ? acceso.nombre || (await nombreDeUsuario(uid, "El club")) : await nombreDeUsuario(uid, reserva.nombreJugador || "El titular");
  const resultado = await db.runTransaction(async (tx) => {
    const { cuenta, guardar } = await cuentaDelTurnoEnTx(tx, clubRef, grupoId, { uid, nombre: quien });
    const participantes = cc.participantesDe(cuenta).map((p) => ({ ...p }));
    if (otroUid) {
      const ya = participantes.find((p) => p.uid === otroUid);
      if (ya && ya.estado !== "quitado") {
        guardar({});
        return { participanteId: ya.id, nuevo: false, cuenta };
      }
      if (ya) {
        ya.estado = "activo";
        guardar({ participantes, participantesUids: cc.uidsDe(participantes) });
        return { participanteId: ya.id, nuevo: true, cuenta };
      }
    }
    if (cc.participantesActivos({ participantes }).length >= cc.PARTICIPANTES_MAX) throw new HttpsError("resource-exhausted", `El turno ya tiene ${cc.PARTICIPANTES_MAX} personas`);
    const nuevo = cc.nuevoParticipante({ uid: otroUid || null, nombre: nombreOtro, tipo: otroUid ? "jugador" : "invitado", anonimo: false, origen: otroUid ? "busqueda" : esTitular && !acceso.esStaff ? "titular" : "staff", agregadoPor: uid, ahora: Timestamp.now() });
    participantes.push(nuevo);
    guardar({ participantes, participantesUids: cc.uidsDe(participantes) });
    return { participanteId: nuevo.id, nuevo: true, cuenta };
  });
  if (otroUid && resultado.nuevo && otroUid !== uid) {
    try {
      await avisoA(otroUid, {
        tipo: "turno_sumado",
        titulo: "Te sumaron a un turno",
        // Staff: "Te sumaron al turno de Gómez · vie 23 oct · 14:00 en Club X"; titular: "Gómez te sumó al turno del vie 23 oct · 14:00 en Club X"
        mensaje: esTitular
          ? `${quien} te sumó al turno del ${fechaCortaArgentina(resultado.cuenta.fecha)} · ${resultado.cuenta.horaInicio || ""} en ${acceso.club.nombre || "el club"}.`
          : `Te sumaron al turno de ${resultado.cuenta.nombreJugador || "un jugador"} · ${fechaCortaArgentina(resultado.cuenta.fecha)} · ${resultado.cuenta.horaInicio || ""} en ${acceso.club.nombre || "el club"}.`,
        link: `/mi-cuenta/${clubId}/${grupoId}`,
        icono: "🎾",
      });
    } catch (err) {
      logger.error(`sumarJugador ${clubId}/${grupoId}: no se pudo avisar a ${otroUid}`, err);
    }
  }
  logger.info(`sumarJugador ${clubId}/${grupoId} por ${uid}: ${otroUid || `"${nombreOtro}"`} → ${resultado.participanteId}`);
  return { ok: true, participanteId: resultado.participanteId, nuevo: resultado.nuevo };
});

exports.quitarParticipante = onCall({ region: REGION }, async (request) => {
  const uid = exigirAuth(request);
  const clubId = texto(request.data && request.data.clubId, 80);
  const grupoId = texto(request.data && request.data.grupoId, 120);
  const participanteId = texto(request.data && request.data.participanteId, 80);
  if (!clubId || !grupoId || !participanteId) throw new HttpsError("invalid-argument", "clubId, grupoId y participanteId");
  const clubRef = db.collection("clubs").doc(clubId);
  const acceso = await accesoClub(clubRef, uid);
  await db.runTransaction(async (tx) => {
    const ref = clubRef.collection("cuentas").doc(grupoId);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "La cuenta del turno no existe");
    const cuenta = snap.data();
    if (cuenta.estado !== "abierta") throw new HttpsError("failed-precondition", "La cuenta ya está cerrada");
    const esTitular = !!cuenta.jugadorUid && cuenta.jugadorUid === uid;
    if (!esTitular && !acceso.esStaff) throw new HttpsError("permission-denied", "Solo el titular del turno o el club pueden quitar participantes");
    const participantes = cc.participantesDe(cuenta).map((p) => ({ ...p }));
    const p = participantes.find((x) => x.id === participanteId && x.estado !== "quitado");
    if (!p) throw new HttpsError("not-found", "Ese participante no está en el turno");
    if (p.tipo === "titular") throw new HttpsError("failed-precondition", "El titular no se puede quitar");
    if (cc.algoPagadoDe(cuenta, participanteId)) throw new HttpsError("failed-precondition", `${p.nombre} ya pagó algo: no se puede quitar`);
    p.estado = "quitado";
    // Sus líneas quedan sin asignar (o siguen con los demás asignados)
    const items = (cuenta.items || []).map((it) => (Array.isArray(it.asignadoA) && it.asignadoA.includes(participanteId) ? { ...it, asignadoA: it.asignadoA.filter((id) => id !== participanteId) } : it));
    tx.update(ref, { participantes, participantesUids: cc.uidsDe(participantes), items, actualizadoEn: FieldValue.serverTimestamp() });
  });
  logger.info(`quitarParticipante ${clubId}/${grupoId}: ${participanteId} por ${uid}`);
  return { ok: true };
});

// ----- Asignación desde el celular (y el panel) -----
exports.asignarLineas = onCall({ region: REGION }, async (request) => {
  const uid = exigirAuth(request, { anonimoOk: true });
  const clubId = texto(request.data && request.data.clubId, 80);
  const grupoId = texto(request.data && request.data.grupoId, 120);
  const lineaIds = Array.isArray(request.data && request.data.lineaIds) ? request.data.lineaIds.map((x) => texto(x, 80)).filter(Boolean).slice(0, 100) : [];
  const asignadoA = Array.isArray(request.data && request.data.asignadoA) ? [...new Set(request.data.asignadoA.map((x) => texto(x, 80)).filter(Boolean))].slice(0, cc.PARTICIPANTES_MAX) : [];
  if (!clubId || !grupoId || !lineaIds.length) throw new HttpsError("invalid-argument", "clubId, grupoId y lineaIds");
  const clubRef = db.collection("clubs").doc(clubId);
  const acceso = esAnonimoReq(request) ? { esStaff: false } : await accesoClub(clubRef, uid);
  await db.runTransaction(async (tx) => {
    const ref = clubRef.collection("cuentas").doc(grupoId);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "La cuenta del turno no existe");
    const cuenta = snap.data();
    if (cuenta.estado !== "abierta") throw new HttpsError("failed-precondition", "La cuenta ya está cerrada");
    const activos = cc.participantesActivos(cuenta);
    const yo = activos.find((p) => p.uid === uid) || null;
    const esTitular = (!!cuenta.jugadorUid && cuenta.jugadorUid === uid) || (yo && yo.tipo === "titular");
    if (!acceso.esStaff && !esTitular && !yo) throw new HttpsError("permission-denied", "No estás en este turno");
    if (asignadoA.some((id) => !activos.some((p) => p.id === id))) throw new HttpsError("invalid-argument", "Alguno de los participantes no está en el turno");
    const ids = new Set(lineaIds);
    const items = (cuenta.items || []).map((it) => {
      if (!ids.has(it.lineaId)) return it;
      if (cc.lineaPagada(cuenta, it.lineaId)) throw new HttpsError("failed-precondition", `${it.nombre} ya tiene pagos: no se reasigna`);
      if (!acceso.esStaff && !esTitular) {
        const propia = (it.asignadoA || []).includes(yo.id) || (!!it.pedidoUid && it.pedidoUid === uid);
        if (!propia) throw new HttpsError("permission-denied", `${it.nombre} no es tuya: solo podés mover lo tuyo`);
        if (asignadoA.length && !asignadoA.includes(yo.id)) throw new HttpsError("permission-denied", "Podés compartir o quedarte una línea, no pasársela a otro");
      }
      return { ...it, asignadoA };
    });
    tx.update(ref, { items, actualizadoEn: FieldValue.serverTimestamp() });
  });
  return { ok: true };
});

// ----- Perfiles públicos de jugadores (proyección de users: nombre, foto, ciudad; nunca email ni teléfono) -----
function perfilPublicoDe(u) {
  const roles = Array.isArray(u && u.role) ? u.role : u && u.role ? [u.role] : ["jugador"];
  const nombre = texto(u && u.nombre, 80);
  return {
    nombre,
    nombreBusqueda: cc.nombreBusqueda(nombre),
    foto: (u && u.fotoUrl) || null,
    ciudad: texto(u && u.ciudad, 60) || null,
    visible: !!nombre && (u && u.buscable) !== false && roles.includes("jugador"),
  };
}
const mismoPerfil = (a, b) => ["nombre", "nombreBusqueda", "foto", "ciudad", "visible"].every((k) => (a || {})[k] === (b || {})[k]);

exports.onUserWritten = onDocumentWritten("users/{uid}", async (event) => {
  const { uid } = event.params;
  const perfilRef = db.collection("perfilesPublicos").doc(uid);
  try {
    const despues = event.data && event.data.after && event.data.after.exists ? event.data.after.data() : null;
    if (!despues) {
      await perfilRef.delete();
      return;
    }
    const antes = event.data && event.data.before && event.data.before.exists ? event.data.before.data() : null;
    const nuevo = perfilPublicoDe(despues);
    if (antes && mismoPerfil(perfilPublicoDe(antes), nuevo)) return;
    await perfilRef.set({ ...nuevo, actualizadoEn: FieldValue.serverTimestamp() });
  } catch (err) {
    logger.error(`onUserWritten ${uid}`, err);
  }
});

exports.reconstruirPerfilesPublicos = onCall({ region: REGION, timeoutSeconds: 540 }, async (request) => {
  const uid = exigirAuth(request);
  const admin = await db.collection("superadmins").doc(uid).get();
  if (!admin.exists) throw new HttpsError("permission-denied", "Solo el super-admin");
  let ultimo = null;
  let usuarios = 0;
  let visibles = 0;
  for (;;) {
    let q = db.collection("users").orderBy(FieldPath.documentId()).limit(300);
    if (ultimo) q = q.startAfter(ultimo);
    const snap = await q.get();
    if (snap.empty) break;
    const ops = snap.docs.map((d) => {
      const perfil = perfilPublicoDe(d.data());
      if (perfil.visible) visibles += 1;
      return (b) => b.set(db.collection("perfilesPublicos").doc(d.id), { ...perfil, actualizadoEn: FieldValue.serverTimestamp() });
    });
    await escribirEnLotes(ops);
    usuarios += snap.size;
    ultimo = snap.docs[snap.docs.length - 1];
    if (snap.size < 300) break;
  }
  logger.info(`reconstruirPerfilesPublicos por ${uid}: ${usuarios} usuarios, ${visibles} visibles`);
  return { ok: true, usuarios, visibles };
});

// ============================================================================
// MERCADO PAGO (P3-8). Modelo marketplace: cada club conecta SU cuenta de MP por OAuth y cada preferencia se crea
// con el token del club, así la plata va a su cuenta; Padely puede retener marketplace_fee (comisionPadelyPct,
// 0 por defecto, la fija el super-admin). Los tokens viven en clubs/{c}/privado/mercadopago (ningún cliente lo lee).
// Secretos: MP_CLIENT_SECRET y MP_WEBHOOK_SECRET (firebase functions:secrets:set); MP_CLIENT_ID es un parámetro
// (functions/.env.padely-dev). Nada de esto se escribe en logs.
// ============================================================================
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret, defineString } = require("firebase-functions/params");
const mp = require("./mercadopago");
const MP_CLIENT_SECRET = defineSecret("MP_CLIENT_SECRET");
const MP_WEBHOOK_SECRET = defineSecret("MP_WEBHOOK_SECRET");
const MP_CLIENT_ID = defineString("MP_CLIENT_ID");
const APP_URL = "https://padely.netlify.app";
const FUNCTIONS_URL = `https://${REGION}-padely-dev.cloudfunctions.net`;
const MP_REDIRECT_URI = `${FUNCTIONS_URL}/mpOAuthCallback`;
const MP_STATE_MIN = 10;
const MP_REFRESH_DIAS = 30;

// Llamada a la API de MP. Nunca registra el token ni el cuerpo de la respuesta de /oauth/token.
async function mpFetch(path, { method = "GET", token = null, body = null, idempotencia = null } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (idempotencia) headers["X-Idempotency-Key"] = idempotencia;
  const res = await fetch(`${mp.MP_API}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const texto = await res.text();
  let json = null;
  try {
    json = texto ? JSON.parse(texto) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const err = new Error(`MP ${method} ${path} → ${res.status}${json && json.message ? `: ${json.message}` : ""}`);
    err.status = res.status;
    err.detalle = json;
    throw err;
  }
  return json;
}
const privadoMpRef = (clubRef) => clubRef.collection("privado").doc("mercadopago");
const stateMpRef = (clubRef) => clubRef.collection("privado").doc("mpOauthState");

// Tokens del club, renovados si vencen pronto (o si lo pide `forzar`). null si no está conectado.
async function tokensDelClub(clubRef, { forzar = false } = {}) {
  const snap = await privadoMpRef(clubRef).get();
  if (!snap.exists || !snap.data().accessToken) return null;
  const t = snap.data();
  const vence = Number(t.expiraEnMs) || 0;
  if (!forzar && vence - Date.now() > MP_REFRESH_DIAS * 24 * 3600 * 1000) return t;
  if (!t.refreshToken) return t;
  try {
    const r = await mpFetch("/oauth/token", { method: "POST", body: mp.cuerpoTokenPorRefresh({ clientId: MP_CLIENT_ID.value(), clientSecret: MP_CLIENT_SECRET.value(), refreshToken: t.refreshToken }) });
    const nuevos = mp.tokensDeRespuesta(r);
    const datos = { ...t, ...nuevos, userId: nuevos.userId || t.userId, publicKey: nuevos.publicKey || t.publicKey, refrescadoEn: FieldValue.serverTimestamp() };
    await privadoMpRef(clubRef).set(datos, { merge: true });
    logger.info(`mp: tokens renovados para ${clubRef.id}`);
    return datos;
  } catch (err) {
    logger.error(`mp: no se pudieron renovar los tokens de ${clubRef.id} (${err.status || ""})`);
    return t;
  }
}

exports.mpConectarUrl = onCall({ region: REGION, secrets: [MP_CLIENT_SECRET] }, async (request) => {
  const uid = exigirAuth(request);
  // P3-14 C: una entidad organizadora conecta su cuenta para cobrar inscripciones (state "org-<id>")
  const organizerId = texto(request.data && request.data.organizerId, 80);
  if (organizerId) {
    const orgRef = db.collection("organizers").doc(organizerId);
    const org = await orgRef.get();
    if (!org.exists || org.data().ownerUid !== uid) throw new HttpsError("permission-denied", "Solo el dueño de la entidad conecta Mercado Pago");
    const stateOrg = mp.nuevoState(MP_CLIENT_SECRET.value(), `org-${organizerId}`);
    await stateMpRef(orgRef).set({ state: stateOrg, uid, creadoEn: FieldValue.serverTimestamp(), creadoEnMs: Date.now() });
    return { ok: true, url: mp.urlAutorizacion({ clientId: MP_CLIENT_ID.value(), state: stateOrg, redirectUri: MP_REDIRECT_URI }) };
  }
  const clubId = texto(request.data && request.data.clubId, 80);
  if (!clubId) throw new HttpsError("invalid-argument", "clubId");
  const clubRef = db.collection("clubs").doc(clubId);
  const acceso = await accesoClub(clubRef, uid, []);
  if (!acceso.esDueño) throw new HttpsError("permission-denied", "Solo el dueño del club conecta Mercado Pago");
  const state = mp.nuevoState(MP_CLIENT_SECRET.value(), clubId);
  await stateMpRef(clubRef).set({ state, uid, creadoEn: FieldValue.serverTimestamp(), creadoEnMs: Date.now() });
  return { ok: true, url: mp.urlAutorizacion({ clientId: MP_CLIENT_ID.value(), state, redirectUri: MP_REDIRECT_URI }) };
});

// Vuelta de la autorización de MP: valida el state, cambia el code por tokens, guarda y vuelve a Configuración
exports.mpOAuthCallback = onRequest({ region: REGION, secrets: [MP_CLIENT_SECRET] }, async (req, res) => {
  const volver = (q) => res.redirect(302, `${APP_URL}/admin/configuracion?${new URLSearchParams(q).toString()}`);
  try {
    const { code, state, error } = req.query || {};
    if (error) return volver({ mp: "error", motivo: String(error).slice(0, 80) });
    const st = mp.stateValido(state, MP_CLIENT_SECRET.value());
    if (!st.ok || !st.prefijo) return volver({ mp: "error", motivo: "state" });
    if (st.prefijo.startsWith("org-")) return conectarOrganizador(st.prefijo.slice(4), String(state), code, res);
    const clubRef = db.collection("clubs").doc(st.prefijo);
    const guardado = await stateMpRef(clubRef).get();
    if (!guardado.exists || guardado.data().state !== state || Date.now() - (Number(guardado.data().creadoEnMs) || 0) > MP_STATE_MIN * 60000) return volver({ mp: "error", motivo: "state-vencido" });
    if (!code) return volver({ mp: "error", motivo: "sin-code" });
    const r = await mpFetch("/oauth/token", { method: "POST", body: mp.cuerpoTokenPorCodigo({ clientId: MP_CLIENT_ID.value(), clientSecret: MP_CLIENT_SECRET.value(), code: String(code), redirectUri: MP_REDIRECT_URI }) });
    const tokens = mp.tokensDeRespuesta(r);
    if (!tokens.accessToken) return volver({ mp: "error", motivo: "sin-token" });
    let nickname = null;
    let esPrueba = false;
    try {
      const me = await mpFetch("/users/me", { token: tokens.accessToken });
      nickname = (me && me.nickname) || null;
      esPrueba = mp.esUsuarioDePrueba(me);
    } catch {
      nickname = null;
    }
    const batch = db.batch();
    batch.set(privadoMpRef(clubRef), { ...tokens, conectadoEn: FieldValue.serverTimestamp(), conectadoPor: guardado.data().uid || null });
    // P3-14: el documento público del club solo dice si está conectado (y la comisión); la cuenta (userId, nickname,
    // esPrueba) va a clubs/{c}/privado/mpCuenta, que leen quien configura el club y el super-admin
    batch.set(clubRef, { mercadoPago: { conectado: true, conectadoEn: FieldValue.serverTimestamp(), liveMode: tokens.liveMode, comisionPadelyPct: (await clubRef.get()).get("mercadoPago.comisionPadelyPct") || 0, userId: FieldValue.delete(), nickname: FieldValue.delete(), esPrueba: FieldValue.delete() } }, { merge: true });
    batch.set(clubRef.collection("privado").doc("mpCuenta"), { userId: tokens.userId, nickname, esPrueba, liveMode: tokens.liveMode, conectadoEn: FieldValue.serverTimestamp() });
    batch.delete(stateMpRef(clubRef));
    await batch.commit();
    logger.info(`mp: club ${st.prefijo} conectado (user ${tokens.userId}, live ${tokens.liveMode})`);
    return volver({ mp: "ok" });
  } catch (err) {
    logger.error(`mpOAuthCallback: ${err.message || err}`);
    return volver({ mp: "error", motivo: "token" });
  }
});

exports.mpDesconectar = onCall({ region: REGION }, async (request) => {
  const uid = exigirAuth(request);
  const organizerId = texto(request.data && request.data.organizerId, 80);
  if (organizerId) {
    const orgRef = db.collection("organizers").doc(organizerId);
    const org = await orgRef.get();
    if (!org.exists || org.data().ownerUid !== uid) throw new HttpsError("permission-denied", "Solo el dueño de la entidad desconecta Mercado Pago");
    const b = db.batch();
    b.delete(privadoMpRef(orgRef));
    b.delete(orgRef.collection("privado").doc("mpCuenta"));
    b.set(orgRef, { mercadoPago: { conectado: false, desconectadoEn: FieldValue.serverTimestamp() } }, { merge: true });
    await b.commit();
    return { ok: true };
  }
  const clubId = texto(request.data && request.data.clubId, 80);
  if (!clubId) throw new HttpsError("invalid-argument", "clubId");
  const clubRef = db.collection("clubs").doc(clubId);
  const acceso = await accesoClub(clubRef, uid, []);
  if (!acceso.esDueño) throw new HttpsError("permission-denied", "Solo el dueño del club desconecta Mercado Pago");
  const batch = db.batch();
  batch.delete(privadoMpRef(clubRef));
  batch.set(clubRef, { mercadoPago: { conectado: false, userId: FieldValue.delete(), nickname: FieldValue.delete(), esPrueba: FieldValue.delete(), liveMode: null, desconectadoEn: FieldValue.serverTimestamp() } }, { merge: true });
  batch.delete(clubRef.collection("privado").doc("mpCuenta"));
  await batch.commit();
  logger.info(`mp: club ${clubId} desconectado por ${uid}`);
  return { ok: true };
});

// Super-admin: comisión de Padely por pago (marketplace_fee), 0 a 10 % en pasos de 0,5
exports.mpSetComision = onCall({ region: REGION }, async (request) => {
  const uid = exigirAuth(request);
  const admin = await db.collection("superadmins").doc(uid).get();
  if (!admin.exists) throw new HttpsError("permission-denied", "Solo el super-admin");
  const clubId = texto(request.data && request.data.clubId, 80);
  // P3-9: la comisión normal sale del plan; esto guarda un override explícito (pct null = volver a la del plan)
  const crudo = request.data ? request.data.pct : undefined;
  if (crudo === null) {
    if (!clubId) throw new HttpsError("invalid-argument", "clubId");
    await db.collection("clubs").doc(clubId).update({ "mercadoPago.comisionOverridePct": FieldValue.delete() });
    logger.info(`mp: comisión de ${clubId} vuelve a la del plan por ${uid}`);
    return { ok: true, pct: null };
  }
  const pct = Number(crudo);
  if (!clubId || !Number.isFinite(pct) || pct < 0 || pct > mp.COMISION_MAX_PCT || Math.round(pct * 2) !== pct * 2) throw new HttpsError("invalid-argument", "clubId y pct entre 0 y 10 en pasos de 0,5");
  await db.collection("clubs").doc(clubId).set({ mercadoPago: { comisionOverridePct: pct } }, { merge: true });
  logger.info(`mp: comisión override de ${clubId} = ${pct} % por ${uid}`);
  return { ok: true, pct };
});

// Todos los días a las 5: renueva los tokens que vencen en menos de 30 días
exports.mpRefrescarTokens = onSchedule({ schedule: "every day 05:00", timeZone: ZONA_HORARIA, secrets: [MP_CLIENT_SECRET] }, async () => {
  const snap = await db.collection("clubs").where("mercadoPago.conectado", "==", true).get();
  let renovados = 0;
  for (const d of snap.docs) {
    const antes = await privadoMpRef(d.ref).get();
    const t = await tokensDelClub(d.ref);
    if (t && antes.exists && t.expiraEnMs !== antes.data().expiraEnMs) renovados += 1;
  }
  logger.info(`mpRefrescarTokens: ${renovados} de ${snap.size} clubes renovados`);
});

// ----- Pagos (Checkout Pro): preferencia → webhook → venta online + pago congelado en la cuenta -----
// Los saldos se calculan con EL MISMO código que el cliente: functions/lib/cuentas.mjs es una copia generada de
// src/utils/cuentas.js (functions/sync-utils.mjs; el test cuentasCopia.test.js falla si quedó vieja).
let cuentasUtilPromesa = null;
const cuentasUtil = () => (cuentasUtilPromesa ||= import("./lib/cuentas.mjs"));
let senasUtilPromesa = null;
const senasUtil = () => (senasUtilPromesa ||= import("./lib/senas.mjs"));
let planesUtilPromesa = null;
const planesUtil = () => (planesUtilPromesa ||= import("./lib/planes.mjs"));
const MP_WEBHOOK_URL = `${FUNCTIONS_URL}/mpWebhook`;
const PERMISOS_COBRO = ["cobrarTurnos", "vender"];
const horaCorta = (c) => `${fechaCortaArgentina(c.fecha)} ${c.horaInicio || ""}`.trim();

// Avisa al dueño y al staff activo con alguno de estos permisos (una campana por persona)
async function avisarStaff(clubRef, permisos, datos) {
  const [clubSnap, staffSnap] = await Promise.all([clubRef.get(), clubRef.collection("staff").where("activo", "==", true).get()]);
  const uids = new Set();
  if (clubSnap.exists && clubSnap.data().ownerUid) uids.add(clubSnap.data().ownerUid);
  staffSnap.docs.forEach((d) => {
    const s = d.data();
    if (s.uid && Array.isArray(s.permisos) && permisos.some((p) => s.permisos.includes(p))) uids.add(s.uid);
  });
  if (!uids.size) return 0;
  const batch = db.batch();
  uids.forEach((uid) => batch.set(nuevaNotificacionRef(uid), { ...datos, leida: false, createdAt: FieldValue.serverTimestamp() }));
  await batch.commit();
  return uids.size;
}

// Una preferencia pendiente y vigente para el mismo destino (mismos participantes / misma reserva) se reutiliza
async function pagoMpPendiente(clubRef, filtro) {
  let q = clubRef.collection("pagosMp").where("estado", "==", "pendiente");
  q = filtro.grupoId ? q.where("grupoId", "==", filtro.grupoId) : q.where("reservaId", "==", filtro.reservaId);
  const snap = await q.get();
  const ahora = Date.now();
  return (
    snap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .find((p) => (p.venceEn && p.venceEn.toMillis ? p.venceEn.toMillis() : 0) > ahora && p.monto === filtro.monto && JSON.stringify([...(p.participanteIds || [])].sort()) === JSON.stringify([...(filtro.participanteIds || [])].sort())) || null
  );
}

exports.mpCrearPago = onCall({ region: REGION, secrets: [MP_CLIENT_SECRET] }, async (request) => {
  const uid = exigirAuth(request, { anonimoOk: true });
  const anonimo = esAnonimoReq(request);
  const d = request.data || {};
  const clubId = texto(d.clubId, 80);
  const tipo = texto(d.tipo, 20);
  if (!clubId || !["parte", "seña", "mostrador"].includes(tipo)) throw new HttpsError("invalid-argument", "clubId y tipo (parte | seña | mostrador)");
  const clubRef = db.collection("clubs").doc(clubId);
  const clubSnap = await clubRef.get();
  if (!clubSnap.exists) throw new HttpsError("not-found", "El club no existe");
  const club = clubSnap.data();
  if (!club.mercadoPago || club.mercadoPago.conectado !== true) throw new HttpsError("failed-precondition", "El club no tiene Mercado Pago conectado");
  const tokens = await tokensDelClub(clubRef);
  if (!tokens || !tokens.accessToken) throw new HttpsError("failed-precondition", "El club no tiene Mercado Pago conectado");
  const util = await cuentasUtil();
  // P3-9: la comisión sale del plan (FREE 2,5 %, prueba/PRO/sin plan 0 %) salvo un override del super-admin
  const comisionPct = (await planesUtil()).comisionPct(club);

  let destino; // { monto, titulo, backUrl, pagador, participanteIds, lineas, piezas, grupoId, reservaId, filtro }
  if (tipo === "seña") {
    if (anonimo) throw new HttpsError("permission-denied", "Entrá con tu cuenta de Padely");
    const reservaId = texto(d.reservaId, 120);
    if (!reservaId) throw new HttpsError("invalid-argument", "reservaId");
    const rSnap = await clubRef.collection("reservas").doc(reservaId).get();
    if (!rSnap.exists) throw new HttpsError("not-found", "La reserva no existe");
    const r = rSnap.data();
    if (r.jugadorUid !== uid) throw new HttpsError("permission-denied", "La reserva no es tuya");
    if (r.status === "cancelada") throw new HttpsError("failed-precondition", "La reserva está cancelada");
    const seña = Number(r.seña) || 0;
    if (seña <= 0) throw new HttpsError("failed-precondition", "Esta reserva no lleva seña");
    if (r.señaPagada) throw new HttpsError("failed-precondition", "La seña ya está pagada");
    const nombre = await nombreDeUsuario(uid, r.nombreJugador || "");
    // P3-14 B: el crédito del jugador en este club (señas devueltas) se aplica solo
    const creditos = await creditosDisponibles(uid, clubId);
    const credito = creditos.reduce((acc, c) => acc + c.monto, 0);
    if (credito >= seña) {
      await usarCreditoEnSeña({ uid, clubId, clubRef, reservaId, seña, creditos });
      logger.info(`mpCrearPago ${clubId}: seña de ${reservaId} cubierta con crédito ($${seña})`);
      return { cubiertoPorCredito: true, monto: 0, creditoAplicado: seña };
    }
    const creditoAplicado = credito > 0 ? credito : 0;
    destino = { monto: seña - creditoAplicado, creditoAplicado, creditoIds: creditos.map((c) => c.id), titulo: `${club.nombre || "Club"} · ${r.canchaName || "Cancha"} · ${fechaCortaArgentina(r.fecha)} ${r.horaInicio || r.hora || ""} · Seña`, backUrl: `${APP_URL}/mis-reservas`, pagador: { uid, nombre }, participanteIds: [], lineas: [], piezas: [], grupoId: null, reservaId, filtro: { reservaId, monto: seña - creditoAplicado, participanteIds: [] } };
  } else {
    const grupoId = texto(d.grupoId, 120);
    if (!grupoId) throw new HttpsError("invalid-argument", "grupoId");
    const cSnap = await clubRef.collection("cuentas").doc(grupoId).get();
    if (!cSnap.exists) throw new HttpsError("not-found", "La cuenta del turno no existe");
    const cuenta = cSnap.data();
    if (cuenta.estado !== "abierta") throw new HttpsError("failed-precondition", "La cuenta ya está cerrada");
    const saldos = util.saldosDeCuenta(cuenta);
    if (saldos.legacy) throw new HttpsError("failed-precondition", "Esta cuenta se cobra por partes desde el mostrador");
    let cobro;
    let pagador;
    let participanteIds;
    let pedido = null; // lo que pidió el mostrador, para volver a abrir el mismo QR
    if (tipo === "parte") {
      const yo = util.participantePorUid(cuenta, uid);
      if (!yo) throw new HttpsError("permission-denied", "No estás en este turno");
      const pedido = texto(d.participanteId, 80);
      if (pedido && pedido !== yo.id) throw new HttpsError("permission-denied", "Solo podés pagar tu parte");
      const s = saldos.participantes.find((p) => p.id === yo.id);
      if (!s || s.debe <= 0) throw new HttpsError("failed-precondition", "No tenés nada pendiente");
      cobro = util.cobroDe(cuenta, [yo.id], { saldos });
      pagador = { uid, nombre: yo.nombre || (await nombreDeUsuario(uid, "Jugador")) };
      participanteIds = [yo.id];
    } else {
      if (anonimo) throw new HttpsError("permission-denied", "Entrá con tu cuenta de Padely");
      const acceso = await accesoClub(clubRef, uid, PERMISOS_COBRO);
      if (!acceso.esStaff) throw new HttpsError("permission-denied", "Solo quien cobra puede armar un QR de Mercado Pago");
      const ids = Array.isArray(d.participanteIds) ? d.participanteIds.map((x) => texto(x, 80)).filter(Boolean) : [];
      const lineaIds = Array.isArray(d.lineaIds) ? d.lineaIds.map((x) => texto(x, 80)).filter(Boolean) : [];
      const pagadorId = texto(d.pagadorId, 80);
      if (lineaIds.length) {
        if (!pagadorId) throw new HttpsError("invalid-argument", "pagadorId");
        cobro = util.cobroDeLineas(cuenta, lineaIds, pagadorId, { saldos });
        participanteIds = [pagadorId];
        pedido = { lineaIds, pagadorId };
      } else {
        if (!ids.length) throw new HttpsError("invalid-argument", "participanteIds o lineaIds");
        cobro = util.cobroDe(cuenta, ids, { saldos });
        participanteIds = ids.length === 1 ? ids : cobro.cubreA;
        pedido = { participanteIds: ids };
      }
      const nombres = participanteIds.map((id) => (util.participantePorId(cuenta, id) || {}).nombre).filter(Boolean);
      pagador = { uid: null, nombre: nombres.join(", ") || cuenta.nombreJugador || "" };
    }
    if (!cobro || cobro.total <= 0) throw new HttpsError("failed-precondition", "No hay nada para cobrar");
    destino = {
      monto: cobro.total,
      titulo: `${club.nombre || "Club"} · ${cuenta.canchaNombre || "Cancha"} · ${horaCorta(cuenta)} · ${tipo === "parte" ? "Tu parte" : pagador.nombre ? `Parte de ${pagador.nombre}` : "Cuenta"}`,
      // M4: quien paga un QR del mostrador no ve la cuenta; vuelve a una página neutra (el club lo ve en su pantalla)
      backUrl: tipo === "mostrador" ? `${APP_URL}/pago-recibido` : `${APP_URL}/turno/${clubId}/${grupoId}`,
      pagador,
      participanteIds,
      lineas: cobro.lineas,
      piezas: cobro.piezas,
      grupoId,
      reservaId: null,
      filtro: { grupoId, monto: cobro.total, participanteIds },
      pedido,
    };
  }

  // ¿Ya hay una preferencia pendiente y vigente igual? Se devuelve esa
  const previa = await pagoMpPendiente(clubRef, destino.filtro);
  if (previa) return { ok: true, pagoMpId: previa.id, initPoint: previa.initPoint, linkCorto: previa.linkCorto || null, monto: previa.monto, venceEn: previa.venceEn.toMillis(), reutilizado: true };

  const pagoMpRef = clubRef.collection("pagosMp").doc();
  const pref = mp.cuerpoPreferencia({ titulo: destino.titulo, monto: destino.monto, pagoMpId: pagoMpRef.id, pagador: destino.pagador, notificationUrl: `${MP_WEBHOOK_URL}?club=${clubId}`, backUrl: destino.backUrl, comisionPct });
  let r;
  try {
    r = await mpFetch("/checkout/preferences", { method: "POST", token: tokens.accessToken, body: pref.body, idempotencia: pagoMpRef.id });
  } catch (err) {
    logger.error(`mpCrearPago ${clubId}: preferencia rechazada (${err.status || ""}) ${err.message}`);
    throw new HttpsError("unavailable", "Mercado Pago no aceptó el cobro. Probá de nuevo en un momento.");
  }
  const initPoint = r.init_point || r.sandbox_init_point || null;
  if (!r.id || !initPoint) throw new HttpsError("unavailable", "Mercado Pago no devolvió el link de pago");
  // El init_point (~113 bytes) no entra en el QR de src/utils/qr.js (máx. 106): el QR lleva este link corto → mpIr
  const linkCorto = `${FUNCTIONS_URL}/mpIr?p=${pagoMpRef.id}`;
  await db.collection("pagosMpIndice").doc(pagoMpRef.id).set({ clubId, creadoEn: FieldValue.serverTimestamp() });
  await pagoMpRef.set({
    tipo,
    estado: "pendiente",
    clubId,
    grupoId: destino.grupoId,
    reservaId: destino.reservaId,
    creditoAplicado: destino.creditoAplicado || 0,
    creditoIds: destino.creditoIds || [],
    participanteIds: destino.participanteIds,
    lineas: destino.lineas,
    piezas: destino.piezas,
    monto: pref.total,
    comision: pref.fee,
    comisionPct,
    preferenceId: String(r.id),
    initPoint,
    linkCorto,
    pedido: destino.pedido || null,
    sandboxInitPoint: r.sandbox_init_point || null,
    paymentId: null,
    pagador: destino.pagador,
    creadoPor: uid,
    creadoEn: FieldValue.serverTimestamp(),
    venceEn: Timestamp.fromMillis(pref.venceEnMs),
    aprobadoEn: null,
    ventaNumero: null,
    devolucion: null,
    liveMode: tokens.liveMode === true,
    actualizadoEn: FieldValue.serverTimestamp(),
  });
  logger.info(`mpCrearPago ${clubId}/${pagoMpRef.id}: ${tipo} $${pref.total} por ${uid}${anonimo ? " (anónimo)" : ""}`);
  return { ok: true, pagoMpId: pagoMpRef.id, initPoint, linkCorto, monto: pref.total, venceEn: pref.venceEnMs, reutilizado: false };
});

// Link corto para el QR del mostrador: pagosMpIndice/{id} → clubs/{c}/pagosMp/{id} → 302 al checkout de Mercado Pago
exports.mpIr = onRequest({ region: REGION }, async (req, res) => {
  const id = texto(req.query && req.query.p, 40);
  res.set("Cache-Control", "no-store");
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
    res.status(404).type("text/plain").send("Link inválido");
    return;
  }
  const indice = await db.collection("pagosMpIndice").doc(id).get();
  if (!indice.exists) {
    res.status(404).type("text/plain").send("Este link de pago no existe.");
    return;
  }
  const snap = await db.collection("clubs").doc(indice.data().clubId).collection("pagosMp").doc(id).get();
  const pm = snap.exists ? snap.data() : null;
  const vigente = pm && pm.estado === "pendiente" && pm.venceEn && pm.venceEn.toMillis() > Date.now() && pm.initPoint;
  if (!vigente) {
    res.status(410).type("text/plain").send(pm && pm.estado === "aprobado" ? "Este pago ya se hizo." : "Este QR ya no está vigente: pedí uno nuevo en el mostrador.");
    return;
  }
  res.redirect(302, pm.initPoint);
});

// Aplica un pago APROBADO en una sola transacción: relee la cuenta, aplica solo las piezas que siguen sin cubrir
// (si el mostrador cobró algo mientras tanto, lo pagado de más queda como excedente a devolver), crea la venta online
// (MP-000001…, dispositivo "Online", cajaId null: nunca entra en una caja física), congela el pago en la cuenta y la
// cierra si ya nadie debe. Idempotente por paymentId.
async function aplicarPagoAprobado(clubRef, pagoMpRef, pago) {
  const util = await cuentasUtil();
  const clubSnap = await clubRef.get();
  const club = clubSnap.exists ? clubSnap.data() : {};
  const paymentId = String(pago.id);
  const montoPagado = Number(pago.transaction_amount) || 0;
  return db.runTransaction(async (tx) => {
    const pmSnap = await tx.get(pagoMpRef);
    if (!pmSnap.exists) return { resultado: "sin pagoMp" };
    const pm = pmSnap.data();
    // B-P3-8b-1: un pago crea venta UNA vez. MP reintenta notificaciones viejas: un pagoMp devuelto/anulado/aprobado
    // o una venta previa con este paymentId (aunque esté anulada) → "ya procesado"
    const previas = await tx.get(clubRef.collection("ventas").where("mpPaymentId", "==", paymentId).limit(1));
    const decision = mp.decisionPagoAprobado(pm, paymentId, { ventaConEsePago: previas.empty ? null : previas.docs[0].id });
    if (decision.accion === "ignorar") return { resultado: decision.resultado, pm };
    if (decision.accion === "tardio") {
      // El link había vencido: la plata no se aplica a la cuenta; queda como excedente (alerta + "Devolver" / "Ya lo devolví")
      const cuentaRef = pm.grupoId ? clubRef.collection("cuentas").doc(pm.grupoId) : null;
      const cSnap = cuentaRef ? await tx.get(cuentaRef) : null;
      if (cSnap && cSnap.exists) tx.update(cuentaRef, { alertas: FieldValue.arrayUnion("mp-excedente"), actualizadoEn: FieldValue.serverTimestamp() });
      tx.update(pagoMpRef, { estado: "aprobado", paymentId, aprobadoEn: FieldValue.serverTimestamp(), ventaNumero: null, montoPagado, montoAplicado: 0, excedente: montoPagado, excedenteDevuelto: null, pagoTardio: true, estadoMp: pago.status, actualizadoEn: FieldValue.serverTimestamp() });
      return { resultado: decision.resultado, pm, excedente: montoPagado, tardio: true };
    }
    if (pm.tipo === "seña") {
      const cabezaRef = clubRef.collection("reservas").doc(pm.reservaId);
      const contadorRef = clubRef.collection("contadoresDispositivos").doc("MP");
      // P3-15 (revisión): el crédito descontado al crear la preferencia se relee acá; si otro pago ya lo usó, solo se
      // marca el que sigue disponible y la diferencia queda anotada (señaFaltante) para que el club la cobre
      const creditoRefs = Number(pm.creditoAplicado) > 0 && pm.pagador && pm.pagador.uid ? (pm.creditoIds || []).map((id) => userRef(pm.pagador.uid).collection("creditos").doc(String(id))) : [];
      const [cabeza, slots, contSnap, ...creditoSnaps] = await Promise.all([tx.get(cabezaRef), tx.get(clubRef.collection("reservas").where("grupoId", "==", pm.reservaId)), tx.get(contadorRef), ...creditoRefs.map((ref) => tx.get(ref))]);
      const creditosLibres = creditoSnaps.filter((c) => c.exists && c.data().estado === "disponible");
      const creditoCubierto = Math.min(Number(pm.creditoAplicado) || 0, creditosLibres.reduce((acc, c) => acc + (Number(c.data().monto) || 0), 0));
      const señaFaltante = Math.max(0, (Number(pm.creditoAplicado) || 0) - creditoCubierto);
      const docs = slots.docs.length ? slots.docs : cabeza.exists ? [cabeza] : [];
      const reserva = cabeza.exists ? cabeza.data() : docs[0] ? docs[0].data() : null;
      const cambios = { señaPagada: true, señaMedio: "mercadopago", señaPagoMpId: pagoMpRef.id, señaPagadaEn: FieldValue.serverTimestamp(), ...(señaFaltante > 0 ? { señaFaltante } : {}) };
      if (reserva && reserva.status === "pendiente" && club.reservaDirecta !== false) cambios.status = "confirmada";
      docs.forEach((s) => tx.update(s.ref, cambios));
      // P3-14 B: el crédito que se descontó de esta seña queda usado
      creditosLibres.forEach((c) => tx.update(c.ref, { estado: "usado", usadoEn: FieldValue.serverTimestamp(), usadoEnReserva: pm.reservaId }));
      // M3: la seña cobrada online es plata que entró: una venta online con UNA línea "seña" (positiva) para que
      // Reportes y el cierre la vean. La venta de la cuenta trae después su "Seña pagada" en negativo y el día cierra.
      const n = (Number(contSnap.exists ? contSnap.data().usado : 0) || 0) + 1;
      const numero = mp.numeroMp(n);
      const monto = Number(pm.monto) || 0;
      const nombreLinea = `Seña · ${(reserva && reserva.canchaName) || "Cancha"} · ${fechaCortaArgentina(reserva && reserva.fecha)} ${(reserva && (reserva.horaInicio || reserva.hora)) || ""}`.trim();
      tx.set(clubRef.collection("ventas").doc(numero), {
        numero,
        publicId: cc.generarToken(16),
        dispositivo: "Online",
        codigoDispositivo: "MP",
        secuencia: n,
        cajaId: null,
        items: [{ productoId: null, nombre: nombreLinea, precio: monto, cantidad: 1, descuento: 0, subtotal: monto, tipoLinea: "seña", costo: null }],
        subtotal: monto,
        descuento: null,
        descuentoTotal: 0,
        total: monto,
        pagos: [{ medio: "mercadopago", monto, ref: paymentId }],
        pagado: monto,
        vuelto: 0,
        cuentaId: null,
        reservaId: pm.reservaId,
        participanteIds: [],
        cliente: { nombre: (pm.pagador && pm.pagador.nombre) || (reserva && reserva.nombreJugador) || null },
        creadoPor: (pm.pagador && pm.pagador.uid) || pm.creadoPor || "mercadopago",
        creadoPorNombre: (pm.pagador && pm.pagador.nombre) || "Mercado Pago",
        estado: "ok",
        anulacion: null,
        aplicado: false,
        fiscal: null,
        mpPaymentId: paymentId,
        pagoMpId: pagoMpRef.id,
        mpMontoCobrado: montoPagado,
        mpExcedente: 0,
        creadoEn: FieldValue.serverTimestamp(),
        actualizadoEn: FieldValue.serverTimestamp(),
      });
      tx.set(contadorRef, { codigo: "MP", dispositivo: "Online", usado: n, actualizadoEn: FieldValue.serverTimestamp() }, { merge: true });
      tx.update(pagoMpRef, { estado: "aprobado", paymentId, aprobadoEn: FieldValue.serverTimestamp(), ventaNumero: numero, montoPagado, montoAplicado: pm.monto, excedente: 0, estadoMp: pago.status, actualizadoEn: FieldValue.serverTimestamp() });
      return { resultado: "seña aplicada", pm, reserva, numero, total: monto, confirmada: cambios.status === "confirmada" };
    }
    const cuentaRef = clubRef.collection("cuentas").doc(pm.grupoId);
    const contadorRef = clubRef.collection("contadoresDispositivos").doc("MP");
    const [cSnap, contSnap] = await Promise.all([tx.get(cuentaRef), tx.get(contadorRef)]);
    if (!cSnap.exists) throw new Error(`cuenta ${pm.grupoId} inexistente`);
    const cuenta = cSnap.data();
    const piezas = Array.isArray(pm.piezas) ? pm.piezas : [];
    const { aplicadas, montoAplicado, excedente } = mp.aplicarPiezas(cuenta, piezas);
    const indices = new Set(piezas.map((p, i) => (aplicadas.includes(p) ? i : -1)).filter((i) => i >= 0));
    const lineasVenta = (pm.lineas || []).filter((_, i) => indices.has(i));
    const total = montoAplicado;
    const n = (Number(contSnap.exists ? contSnap.data().usado : 0) || 0) + 1;
    const numero = total > 0 ? mp.numeroMp(n) : null;
    if (total > 0) {
      tx.set(clubRef.collection("ventas").doc(numero), {
        numero,
        publicId: cc.generarToken(16),
        dispositivo: "Online",
        codigoDispositivo: "MP",
        secuencia: n,
        cajaId: null,
        items: lineasVenta,
        subtotal: total,
        descuento: null,
        descuentoTotal: 0,
        total,
        pagos: [{ medio: "mercadopago", monto: total, ref: paymentId }],
        pagado: total,
        vuelto: 0,
        cuentaId: pm.grupoId,
        participanteIds: pm.participanteIds || [],
        cliente: { nombre: (pm.pagador && pm.pagador.nombre) || cuenta.nombreJugador || null },
        creadoPor: (pm.pagador && pm.pagador.uid) || pm.creadoPor || "mercadopago",
        creadoPorNombre: (pm.pagador && pm.pagador.nombre) || "Mercado Pago",
        estado: "ok",
        anulacion: null,
        aplicado: false,
        fiscal: null,
        mpPaymentId: paymentId,
        pagoMpId: pagoMpRef.id,
        mpMontoCobrado: montoPagado,
        mpExcedente: excedente,
        creadoEn: FieldValue.serverTimestamp(),
        actualizadoEn: FieldValue.serverTimestamp(),
      });
      tx.set(contadorRef, { codigo: "MP", dispositivo: "Online", usado: n, actualizadoEn: FieldValue.serverTimestamp() }, { merge: true });
    }
    const pagoCongelado = {
      id: `mp_${pagoMpRef.id}`,
      ventaNumero: numero,
      participanteIds: pm.participanteIds || [],
      lineas: aplicadas.map((p) => ({ lineaId: p.lineaId || null, tipo: p.tipo, monto: Number(p.monto) || 0, participanteId: p.participanteId || null })),
      total,
      medios: [{ medio: "mercadopago", monto: total }],
      en: Timestamp.now(),
      por: (pm.pagador && pm.pagador.uid) || null,
      porNombre: (pm.pagador && pm.pagador.nombre) || "Mercado Pago",
      cubreA: [...new Set(aplicadas.map((p) => p.participanteId).filter(Boolean))],
      mpPaymentId: paymentId,
      pagoMpId: pagoMpRef.id,
    };
    const pagos = total > 0 ? [...(cuenta.pagos || []), pagoCongelado] : cuenta.pagos || [];
    const saldada = cuenta.estado === "abierta" && total > 0 && util.saldosDeCuenta({ ...cuenta, pagos }).saldada;
    const cambios = { pagos, actualizadoEn: FieldValue.serverTimestamp() };
    if (numero) cambios.ventas = FieldValue.arrayUnion(numero);
    if (excedente > 0) cambios.alertas = FieldValue.arrayUnion("mp-excedente");
    if (saldada) Object.assign(cambios, { estado: "cerrada", cerradaPor: (pm.pagador && pm.pagador.uid) || "mercadopago", cerradaEn: FieldValue.serverTimestamp(), totales: util.calcularTotalesCuenta(cuenta) });
    tx.update(cuentaRef, cambios);
    tx.update(pagoMpRef, { estado: "aprobado", paymentId, aprobadoEn: FieldValue.serverTimestamp(), ventaNumero: numero, montoPagado, montoAplicado: total, excedente, excedenteDevuelto: null, estadoMp: pago.status, actualizadoEn: FieldValue.serverTimestamp() });
    return { resultado: "aplicado", pm, cuenta, numero, total, excedente, saldada };
  });
}

// Aplica un pago YA LEÍDO de la API con el token del club (nunca el cuerpo de la notificación): busca el pagoMp por
// external_reference en ESTE club; si no existe, se ignora. Devuelve un texto corto para el log.
async function aplicarPagoLeido(clubRef, pago) {
  const clubId = clubRef.id;
  const paymentId = String(pago.id);
  const pagoMpId = (pago && pago.external_reference) || (pago && pago.metadata && pago.metadata.pago_mp_id) || null;
  if (!pagoMpId) return `pago ${paymentId} sin external_reference (${pago.status}) → ignorado`;
  const pagoMpRef = clubRef.collection("pagosMp").doc(String(pagoMpId));
  const existe = await pagoMpRef.get();
  if (!existe.exists) return `pago ${paymentId} (ref ${pagoMpId}) no es de este club → ignorado`;
  const estado = pago.status;
  if (estado === "approved") {
    const r = await aplicarPagoAprobado(clubRef, pagoMpRef, pago);
    logger.info(`mpWebhook ${clubId}/${pagoMpId}: ${r.resultado}${r.numero ? ` → ${r.numero} $${r.total}` : ""}${r.excedente ? ` excedente $${r.excedente}` : ""}${r.saldada ? " · cuenta cerrada" : ""}`);
    if (r.tardio) {
      const pm = r.pm;
      const quien = (pm.pagador && pm.pagador.nombre) || "Un jugador";
      const monto = Math.round(r.excedente).toLocaleString("es-AR");
      try {
        await avisarStaff(clubRef, PERMISOS_COBRO, { tipo: "mp_excedente", titulo: "Pago tardío por Mercado Pago", mensaje: `${quien} pagó $ ${monto} con un link que ya había vencido: no se aplicó a la cuenta. Devolvelo desde la cuenta o marcalo como devuelto.`, link: pm.grupoId ? `/admin/bar/cuentas/${pm.grupoId}` : "/admin/canchas", icono: "💳" });
      } catch (err) {
        logger.error(`mpWebhook ${clubId}/${pagoMpId}: aviso de pago tardío`, err);
      }
      return `pago ${paymentId}: ${r.resultado}`;
    }
    if (r.resultado !== "aplicado" && r.resultado !== "seña aplicada") return `pago ${paymentId}: ${r.resultado}`;
    const pm = r.pm;
    const club = (await clubRef.get()).data() || {};
    const monto = Math.round(Number(pago.transaction_amount) || pm.monto).toLocaleString("es-AR");
    try {
      if (pm.pagador && pm.pagador.uid && pm.pagador.anonimo !== true && !String(pm.pagador.uid).startsWith("anon")) {
        const esAnon = r.cuenta ? (cc.participantesActivos(r.cuenta).find((p) => p.uid === pm.pagador.uid) || {}).anonimo === true : false;
        if (!esAnon) {
          await avisoA(pm.pagador.uid, {
            tipo: "mp_pago_aprobado",
            titulo: pm.tipo === "seña" ? `Seña pagada · $ ${monto}` : `Pago aprobado · $ ${monto}`,
            mensaje: pm.tipo === "seña" ? `Tu seña en ${club.nombre || "el club"} quedó pagada con Mercado Pago.` : `Tu parte del turno en ${club.nombre || "el club"} quedó pagada con Mercado Pago.`,
            link: pm.tipo === "seña" ? "/mis-reservas" : `/mi-cuenta/${clubId}/${pm.grupoId}`,
            icono: "💳",
          });
        }
      }
      const quien = (pm.pagador && pm.pagador.nombre) || "Un jugador";
      if (pm.tipo === "seña") {
        await avisarStaff(clubRef, ["gestionarReservas", ...PERMISOS_COBRO], { tipo: "mp_seña", titulo: "Seña pagada por Mercado Pago", mensaje: `${quien} pagó la seña ($ ${monto}) del turno ${r.reserva ? `${r.reserva.canchaName || ""} ${fechaCortaArgentina(r.reserva.fecha)} ${r.reserva.horaInicio || r.reserva.hora || ""}` : ""}.`, link: `/admin/canchas?fecha=${(r.reserva && r.reserva.fecha) || ""}&turno=${pm.reservaId}`, icono: "💳" });
      } else {
        await avisarStaff(clubRef, PERMISOS_COBRO, { tipo: "mp_pago", titulo: "Pago por Mercado Pago", mensaje: `${quien} pagó su parte por Mercado Pago ($ ${monto}) · ${r.cuenta ? horaCorta(r.cuenta) : ""}${r.saldada ? " · la cuenta se cerró" : ""}.`, link: `/admin/bar/cuentas/${pm.grupoId}`, icono: "💳" });
        if (r.excedente > 0) {
          await avisarStaff(clubRef, PERMISOS_COBRO, { tipo: "mp_excedente", titulo: "Pago de más por Mercado Pago", mensaje: `${quien} pagó $ ${Math.round(r.excedente).toLocaleString("es-AR")} que ya se habían cobrado en el mostrador: devolvelo desde la cuenta.`, link: `/admin/bar/cuentas/${pm.grupoId}`, icono: "💳" });
        }
      }
    } catch (err) {
      logger.error(`mpWebhook ${clubId}/${pagoMpId}: avisos`, err);
    }
    return `pago ${paymentId}: ${r.resultado}`;
  }
  // No aprobado: rechazado/cancelado cierran la preferencia; pendiente/en proceso solo anotan
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(pagoMpRef);
    if (!snap.exists) return;
    const pm = snap.data();
    if (pm.estado === "aprobado" && (estado === "refunded" || estado === "charged_back")) {
      tx.update(pagoMpRef, { estado: "devuelto", estadoMp: estado, devolucion: pm.devolucion || { origen: "mercadopago", en: FieldValue.serverTimestamp() }, actualizadoEn: FieldValue.serverTimestamp() });
      return;
    }
    if (pm.estado !== "pendiente") return;
    if (estado === "rejected" || estado === "cancelled") tx.update(pagoMpRef, { estado: "rechazado", paymentId, estadoMp: estado, motivo: pago.status_detail || null, actualizadoEn: FieldValue.serverTimestamp() });
    else tx.update(pagoMpRef, { paymentId, estadoMp: estado, actualizadoEn: FieldValue.serverTimestamp() });
  });
  logger.info(`mpWebhook ${clubId}/${pagoMpId}: pago ${paymentId} ${estado}`);
  if (estado === "rejected" || estado === "cancelled") {
    const snap = await pagoMpRef.get();
    const pm = snap.exists ? snap.data() : null;
    if (pm && pm.pagador && pm.pagador.uid) {
      try {
        await avisoA(pm.pagador.uid, { tipo: "mp_pago_rechazado", titulo: "Pago rechazado", mensaje: `Mercado Pago no aprobó tu pago${pago.status_detail ? ` (${pago.status_detail})` : ""}. Podés intentar de nuevo o pagar en el mostrador.`, link: pm.tipo === "seña" ? "/mis-reservas" : `/mi-cuenta/${clubId}/${pm.grupoId}`, icono: "💳" });
      } catch (err) {
        logger.error(`mpWebhook ${clubId}/${pagoMpId}: aviso de rechazo`, err);
      }
    }
  }
  return `pago ${paymentId} ${estado}`;
}

// Webhook de Mercado Pago (B-P3-8-2). La firma HMAC (x-signature / x-request-id) se calcula y se registra, pero la
// notificación es solo una pista: todo pago se relee de la API con el token del club y se aplica solo si existe, es de
// este club (external_reference → pagosMp) y está aprobado (idempotente por paymentId). Responde 200 a toda
// notificación bien formada después de procesarla (ids desconocidos → "ignorado"); 401 solo si el club no existe;
// 500 solo ante un error interno (MP reintenta cada 15 min).
exports.mpWebhook = onRequest({ region: REGION, secrets: [MP_WEBHOOK_SECRET, MP_CLIENT_SECRET], timeoutSeconds: 60 }, async (req, res) => {
  const clubId = texto(req.query && req.query.club, 80);
  const datos = mp.datosDeNotificacion(req.query || {}, req.body || {});
  const xSignature = req.get("x-signature");
  const firma = xSignature ? mp.firmaValida({ xSignature, xRequestId: req.get("x-request-id"), dataId: datos.dataId, secreto: MP_WEBHOOK_SECRET.value() }) : { ok: false, motivo: "ausente" };
  // Las notificaciones legacy (IPN: ?topic=payment|merchant_order&id=…) llegan duplicadas junto a las de Webhooks
  // (?type=payment&data.id=…) y no firman igual: no son un ataque, se registran como "notificación legacy"
  const legacy = !!(req.query && req.query.topic) && !(req.query && req.query.type);
  const firmaTxt = firma.ok ? "ok" : legacy ? "notificación legacy (sin firma de Webhooks)" : !xSignature ? "ausente" : `inválida (${firma.motivo})`;
  // P3-14 C: pagos de inscripciones (?org=<organizerId>): mismo criterio (la notificación es una pista; el pago se
  // relee de la API con el token de la entidad y se aplica una sola vez)
  const organizerId = texto(req.query && req.query.org, 80);
  if (organizerId && !clubId) {
    const orgRef = db.collection("organizers").doc(organizerId);
    const orgSnap = await orgRef.get();
    if (!orgSnap.exists) {
      res.status(401).send("entidad desconocida");
      return;
    }
    try {
      const tokens = await tokensDelClub(orgRef);
      const leer = (path) => (tokens && tokens.accessToken ? mpFetch(path, { token: tokens.accessToken }).catch((err) => (err.status === 404 ? null : Promise.reject(err))) : Promise.resolve(null));
      const r = await mp.procesarNotificacion({ tipo: datos.tipo, dataId: datos.dataId, deps: { leerPago: (id) => leer(`/v1/payments/${encodeURIComponent(id)}`), leerOrden: (id) => leer(`/merchant_orders/${encodeURIComponent(id)}`), aplicar: (pago) => aplicarPagoInscripcionLeido(orgRef, pago) } });
      logger.info(`mpWebhook org ${organizerId}: firma ${firmaTxt} · ${datos.tipo || "payment"} ${datos.dataId || "?"} → ${r.resultado}: ${r.resumen}`);
      res.status(200).send(r.resultado);
    } catch (err) {
      logger.error(`mpWebhook org ${organizerId}: ${err.message || err}`);
      res.status(500).send("error");
    }
    return;
  }
  const clubRef = clubId ? db.collection("clubs").doc(clubId) : null;
  const clubSnap = clubRef ? await clubRef.get() : null;
  if (!clubSnap || !clubSnap.exists) {
    logger.warn(`mpWebhook: club desconocido (${clubId || "sin club"}) · firma ${firmaTxt} · ${datos.tipo || "?"} ${datos.dataId || "?"}`);
    res.status(401).send("club desconocido");
    return;
  }
  try {
    const tokens = await tokensDelClub(clubRef);
    const leer = (path) =>
      tokens && tokens.accessToken
        ? mpFetch(path, { token: tokens.accessToken }).catch((err) => {
            if (err.status === 404) return null;
            throw err;
          })
        : Promise.resolve(null);
    const r = await mp.procesarNotificacion({
      tipo: datos.tipo,
      dataId: datos.dataId,
      deps: {
        leerPago: (id) => leer(`/v1/payments/${encodeURIComponent(id)}`),
        leerOrden: (id) => leer(`/merchant_orders/${encodeURIComponent(id)}`),
        aplicar: (pago) => aplicarPagoLeido(clubRef, pago),
      },
    });
    logger.info(`mpWebhook ${clubId}: firma ${firmaTxt} · ${datos.tipo || "payment"} ${datos.dataId || "?"} → ${r.resultado}: ${r.resumen}${tokens && tokens.accessToken ? "" : " (club sin tokens)"}`);
    res.status(200).send(r.resultado);
  } catch (err) {
    logger.error(`mpWebhook ${clubId}: firma ${firmaTxt} · ${err.message || err}`);
    res.status(500).send("error");
  }
});

// B-P3-8-3: el club devolvió a mano desde su cuenta de Mercado Pago (la API no aceptó la devolución). Marca el
// excedente o la devolución de una venta anulada como resueltos, con quién y cuándo, y limpia la alerta.
exports.mpMarcarDevueltoManual = onCall({ region: REGION }, async (request) => {
  const uid = exigirAuth(request);
  const clubId = texto(request.data && request.data.clubId, 80);
  const pagoMpId = texto(request.data && request.data.pagoMpId, 80);
  const que = texto(request.data && request.data.que, 20) || "excedente";
  if (!clubId || !pagoMpId || !["excedente", "venta"].includes(que)) throw new HttpsError("invalid-argument", "clubId, pagoMpId y que (excedente | venta)");
  const clubRef = db.collection("clubs").doc(clubId);
  const acceso = await accesoClub(clubRef, uid, ["anularVenta", ...PERMISOS_COBRO]);
  if (!acceso.esStaff) throw new HttpsError("permission-denied", "Solo quien cobra o anula ventas puede marcar devoluciones");
  const pagoMpRef = clubRef.collection("pagosMp").doc(pagoMpId);
  const snap = await pagoMpRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "El pago no existe");
  const pm = snap.data();
  const porNombre = acceso.nombre || (await nombreDeUsuario(uid, null));
  const batch = db.batch();
  if (que === "excedente") {
    const excedente = Number(pm.excedente) || 0;
    if (excedente <= 0 || pm.excedenteDevuelto) throw new HttpsError("failed-precondition", "No hay un excedente pendiente de devolver");
    batch.update(pagoMpRef, { excedenteDevuelto: { ...mp.devolucionDe({ ok: true }, { monto: excedente, manual: true, por: uid }), porNombre, en: FieldValue.serverTimestamp() }, excedenteError: null, actualizadoEn: FieldValue.serverTimestamp() });
    if (pm.grupoId) batch.update(clubRef.collection("cuentas").doc(pm.grupoId), { alertas: FieldValue.arrayRemove("mp-excedente"), actualizadoEn: FieldValue.serverTimestamp() });
  } else {
    if (!pm.devolucion || pm.devolucion.ok) throw new HttpsError("failed-precondition", "Ese pago no tiene una devolución pendiente");
    const devolucion = { ...pm.devolucion, ...mp.devolucionDe({ ok: true }, { monto: pm.devolucion.monto, manual: true, por: uid }), porNombre, en: FieldValue.serverTimestamp() };
    batch.update(pagoMpRef, { estado: "devuelto", devolucion, actualizadoEn: FieldValue.serverTimestamp() });
    if (pm.ventaNumero) batch.update(clubRef.collection("ventas").doc(pm.ventaNumero), { devolucion, actualizadoEn: FieldValue.serverTimestamp() });
  }
  await batch.commit();
  logger.info(`mpMarcarDevueltoManual ${clubId}/${pagoMpId}: ${que} marcado por ${uid}`);
  return { ok: true };
});

// Cada 15 minutos: las preferencias pendientes vencidas pasan a "vencido"
exports.expirarPagosMp = onSchedule({ schedule: "every 15 minutes", timeZone: ZONA_HORARIA }, async () => {
  const snap = await db.collectionGroup("pagosMp").where("estado", "==", "pendiente").where("venceEn", "<=", Timestamp.now()).get();
  if (snap.empty) return;
  const ops = snap.docs.map((d) => (b) => b.update(d.ref, { estado: "vencido", actualizadoEn: FieldValue.serverTimestamp() }));
  await escribirEnLotes(ops);
  logger.info(`expirarPagosMp: ${snap.size} vencidos`);
});

// Devolución (total o parcial) con el token del club. Devuelve { ok, refundId } o { ok: false, error }.
async function devolverPagoMp(clubRef, paymentId, { monto = null, idempotencia }) {
  const tokens = await tokensDelClub(clubRef);
  if (!tokens || !tokens.accessToken) return { ok: false, error: "club sin tokens" };
  try {
    const r = await mpFetch(`/v1/payments/${encodeURIComponent(paymentId)}/refunds`, { method: "POST", token: tokens.accessToken, body: monto ? { amount: Number(monto) } : {}, idempotencia });
    return { ok: true, refundId: r && r.id ? String(r.id) : null, estado: r && r.status };
  } catch (err) {
    return { ok: false, error: `${err.status || ""} ${err.message || err}`.trim() };
  }
}

// Staff: devuelve el excedente de un pago aprobado de más (carrera con el mostrador)
exports.mpDevolverExcedente = onCall({ region: REGION, secrets: [MP_CLIENT_SECRET] }, async (request) => {
  const uid = exigirAuth(request);
  const clubId = texto(request.data && request.data.clubId, 80);
  const pagoMpId = texto(request.data && request.data.pagoMpId, 80);
  if (!clubId || !pagoMpId) throw new HttpsError("invalid-argument", "clubId y pagoMpId");
  const clubRef = db.collection("clubs").doc(clubId);
  const acceso = await accesoClub(clubRef, uid, PERMISOS_COBRO);
  if (!acceso.esStaff) throw new HttpsError("permission-denied", "Solo quien cobra puede devolver");
  const pagoMpRef = clubRef.collection("pagosMp").doc(pagoMpId);
  const snap = await pagoMpRef.get();
  if (!snap.exists) throw new HttpsError("not-found", "El pago no existe");
  const pm = snap.data();
  if (pm.estado !== "aprobado" || !pm.paymentId) throw new HttpsError("failed-precondition", "El pago no está aprobado");
  const excedente = Number(pm.excedente) || 0;
  if (excedente <= 0 || pm.excedenteDevuelto) throw new HttpsError("failed-precondition", "No hay excedente para devolver");
  const r = await devolverPagoMp(clubRef, pm.paymentId, { monto: excedente, idempotencia: `exc_${pagoMpId}` });
  if (!r.ok) {
    await pagoMpRef.update({ excedenteError: mp.devolucionDe(r, { monto: excedente }).error, excedenteErrorEn: FieldValue.serverTimestamp(), actualizadoEn: FieldValue.serverTimestamp() });
    throw new HttpsError("unavailable", `Mercado Pago no aceptó la devolución (${mp.devolucionDe(r).error}). Si la hacés desde tu cuenta de MP, marcala como devuelta.`);
  }
  const batch = db.batch();
  batch.update(pagoMpRef, { excedenteDevuelto: { monto: excedente, refundId: r.refundId, en: FieldValue.serverTimestamp(), por: uid }, excedenteError: null, actualizadoEn: FieldValue.serverTimestamp() });
  if (pm.grupoId) batch.update(clubRef.collection("cuentas").doc(pm.grupoId), { alertas: FieldValue.arrayRemove("mp-excedente"), actualizadoEn: FieldValue.serverTimestamp() });
  await batch.commit();
  logger.info(`mpDevolverExcedente ${clubId}/${pagoMpId}: $${excedente} devueltos por ${uid}`);
  return { ok: true, monto: excedente, refundId: r.refundId };
});

// Al anular una venta de cuenta: el pago congelado se saca de la cuenta (la deuda vuelve) y, si era de Mercado Pago,
// se devuelve el pago completo con el token del club. Si falla, aviso al dueño. Con { sinDevolucion } (P3-8c: un
// duplicado o una venta ya devuelta por fuera) no se llama a Mercado Pago: queda devolucion { manual, sinDevolucion }.
// Devuelve { reabierta, devolucion } (devolucion null si la venta no era de Mercado Pago)
async function revertirVentaDeCuenta(clubId, numero, venta, { sinDevolucion = false, por = null, porNombre = null } = {}) {
  const clubRef = db.collection("clubs").doc(clubId);
  let reabierta = false;
  let devolucion = null;
  if (venta.cuentaId) {
    try {
      const cuentaRef = clubRef.collection("cuentas").doc(String(venta.cuentaId));
      reabierta = await db.runTransaction(async (tx) => {
        const snap = await tx.get(cuentaRef);
        if (!snap.exists) return false;
        const cuenta = snap.data();
        const pagos = (cuenta.pagos || []).filter((p) => p.ventaNumero !== numero);
        if (pagos.length === (cuenta.pagos || []).length) return false;
        const cambios = { pagos, alertas: FieldValue.arrayUnion("venta-anulada"), actualizadoEn: FieldValue.serverTimestamp() };
        let reabre = false;
        if (cuenta.estado === "cerrada") {
          Object.assign(cambios, { estado: "abierta", cerradaPor: null, cerradaEn: null, reabiertaPorAnulacion: numero });
          reabre = true;
          const slots = await tx.get(clubRef.collection("reservas").where("grupoId", "==", String(venta.cuentaId)));
          slots.docs.forEach((d) => tx.update(d.ref, { cuentaCerrada: false }));
        }
        tx.update(cuentaRef, cambios);
        return reabre;
      });
      logger.info(`onVentaUpdated ${clubId}/${numero}: pago quitado de la cuenta${reabierta ? " (reabierta)" : ""}`);
    } catch (err) {
      logger.error(`onVentaUpdated ${clubId}/${numero}: no se pudo quitar el pago de la cuenta`, err);
    }
  }
  if (!venta.cuentaId && venta.reservaId) {
    // Venta de una seña online (M3): al anularla, la seña de la reserva vuelve a pendiente (la cuenta abierta se
    // sincroniza por onReservaUpdated)
    try {
      const reservaId = String(venta.reservaId);
      const [slots, cabeza] = await Promise.all([clubRef.collection("reservas").where("grupoId", "==", reservaId).get(), clubRef.collection("reservas").doc(reservaId).get()]);
      const refs = slots.docs.map((d) => d.ref);
      if (!refs.length && cabeza.exists) refs.push(cabeza.ref);
      const batch = db.batch();
      refs.forEach((ref) => batch.update(ref, { señaPagada: false, señaMedio: null, señaPagoMpId: null, señaDevueltaEn: FieldValue.serverTimestamp() }));
      await batch.commit();
      logger.info(`venta ${clubId}/${numero}: la seña de la reserva ${reservaId} vuelve a pendiente`);
    } catch (err) {
      logger.error(`venta ${clubId}/${numero}: no se pudo volver la seña a pendiente`, err);
    }
  }
  if (venta.mpPaymentId && sinDevolucion) {
    const monto = venta.mpMontoCobrado || venta.total;
    devolucion = { ...mp.devolucionDe({ ok: true }, { monto, manual: true, por }), sinDevolucion: true, porNombre, en: Timestamp.now(), motivo: (venta.anulacion && venta.anulacion.motivo) || null, ventaNumero: numero };
    const batch = db.batch();
    batch.update(clubRef.collection("ventas").doc(numero), { devolucion, actualizadoEn: FieldValue.serverTimestamp() });
    if (venta.pagoMpId) {
      const pagoMpRef = clubRef.collection("pagosMp").doc(String(venta.pagoMpId));
      const pmSnap = await pagoMpRef.get();
      // Solo si el pagoMp apunta a ESTA venta (un duplicado puede haberlo pisado); "anulado" es final para el webhook
      if (pmSnap.exists && pmSnap.data().ventaNumero === numero) batch.update(pagoMpRef, { estado: "anulado", devolucion, actualizadoEn: FieldValue.serverTimestamp() });
    }
    await batch.commit();
    logger.info(`venta ${clubId}/${numero}: anulada sin devolución por Mercado Pago (${devolucion.motivo || "sin motivo"})`);
  } else if (venta.mpPaymentId) {
    const monto = venta.mpMontoCobrado || venta.total;
    const r = await devolverPagoMp(clubRef, String(venta.mpPaymentId), { idempotencia: `anul_${numero}` });
    devolucion = { ...mp.devolucionDe(r, { monto }), en: Timestamp.now(), motivo: (venta.anulacion && venta.anulacion.motivo) || null, ventaNumero: numero };
    const ventaRef = clubRef.collection("ventas").doc(numero);
    const pagoMpRef = venta.pagoMpId ? clubRef.collection("pagosMp").doc(String(venta.pagoMpId)) : null;
    const batch = db.batch();
    batch.update(ventaRef, { devolucion, actualizadoEn: FieldValue.serverTimestamp() });
    if (pagoMpRef) batch.update(pagoMpRef, r.ok ? { estado: "devuelto", devolucion, actualizadoEn: FieldValue.serverTimestamp() } : { devolucion, actualizadoEn: FieldValue.serverTimestamp() });
    if (r.ok) logger.info(`venta ${clubId}/${numero}: devolución MP ${r.refundId || ""}`);
    else logger.error(`venta ${clubId}/${numero}: devolución MP falló (${r.error})`);
    await batch.commit();
    if (!r.ok) {
      const clubSnap = await clubRef.get();
      const ownerUid = clubSnap.exists ? clubSnap.data().ownerUid : null;
      if (ownerUid) await avisoA(ownerUid, { tipo: "mp_devolucion_error", titulo: "No se pudo devolver el pago de Mercado Pago", mensaje: `La venta ${numero} se anuló pero Mercado Pago no aceptó la devolución: hacela desde tu cuenta de MP.`, link: `/admin/bar/cuentas${venta.cuentaId ? `/${venta.cuentaId}` : ""}`, icono: "💳" }).catch(() => {});
    }
  }
  return { reabierta, devolucion };
}

// B-P3-8-1: las ventas online (cajaId null) no pueden anularse desde el cliente (la regla de ventas exige la caja
// abierta): se anulan acá. Marca la venta anulada, saca el pago congelado de la cuenta (la deuda vuelve; una cuenta
// cerrada se reabre con alerta), pide la devolución completa y guarda el resultado en la venta y el pagoMp.
// onVentaUpdated hace rollup/stock como con cualquier anulación y NO repite la devolución (anulacion.origen).
exports.mpAnularVenta = onCall({ region: REGION, secrets: [MP_CLIENT_SECRET] }, async (request) => {
  const uid = exigirAuth(request);
  const clubId = texto(request.data && request.data.clubId, 80);
  const numero = texto(request.data && request.data.numero, 40);
  // P3-8c: sinDevolucion anula y saca el pago de la cuenta SIN pedir la devolución (duplicados, devoluciones hechas
  // por fuera); exige un motivo escrito
  const sinDevolucion = !!(request.data && request.data.sinDevolucion === true);
  const motivoEscrito = texto(request.data && request.data.motivo, 120);
  if (sinDevolucion && !motivoEscrito) throw new HttpsError("invalid-argument", "Para anular sin devolver, escribí el motivo");
  const motivo = motivoEscrito || "Devolución por Mercado Pago";
  if (!clubId || !numero) throw new HttpsError("invalid-argument", "clubId y numero");
  const clubRef = db.collection("clubs").doc(clubId);
  const acceso = await accesoClub(clubRef, uid, ["anularVenta"]);
  if (!acceso.esStaff) throw new HttpsError("permission-denied", "Solo quien puede anular ventas (o el dueño) devuelve pagos de Mercado Pago");
  const ventaRef = clubRef.collection("ventas").doc(numero);
  const anulacion = { por: uid, porNombre: acceso.nombre || (await nombreDeUsuario(uid, null)), motivo, en: Timestamp.now(), origen: "mpAnularVenta", sinDevolucion };
  const venta = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ventaRef);
    const v = snap.exists ? snap.data() : null;
    const chequeo = mp.ventaAnulableOnline(v);
    if (!chequeo.ok) throw new HttpsError(v ? "failed-precondition" : "not-found", chequeo.motivo);
    tx.update(ventaRef, { estado: "anulada", anulacion, actualizadoEn: FieldValue.serverTimestamp() });
    return { ...v, estado: "anulada", anulacion };
  });
  const r = await revertirVentaDeCuenta(clubId, numero, venta, { sinDevolucion, por: uid, porNombre: anulacion.porNombre });
  logger.info(`mpAnularVenta ${clubId}/${numero}: por ${uid} · devolución ${sinDevolucion ? "no pedida (sin devolución)" : r.devolucion && r.devolucion.ok ? "ok" : "falló"}${r.reabierta ? " · cuenta reabierta" : ""}`);
  return { ok: true, numero, reabierta: r.reabierta, devolucion: r.devolucion ? { ok: r.devolucion.ok, refundId: r.devolucion.refundId, error: r.devolucion.error, monto: r.devolucion.monto, sinDevolucion } : null };
});

// ============================================================================
// PLANES (P3-9): clubs/{c}.plan = { tipo: prueba | free | pro, inicio, vence, escalon?, historial } lo escriben solo
// estas Functions y el super-admin (las reglas no dejan que el club lo toque). La lógica es src/utils/planes.js
// (copiada a functions/lib/planes.mjs). Un club sin plan es "legacy" = PRO sin bloqueos.
// ============================================================================

// ms → Timestamp en inicio, vence y en las fechas del historial
function planAFirestore(plan) {
  const ts = (v) => (v === null || v === undefined ? null : typeof v === "number" ? Timestamp.fromMillis(v) : v);
  return {
    ...plan,
    inicio: ts(plan.inicio),
    vence: ts(plan.vence),
    historial: (plan.historial || []).map((h) => ({ ...h, desde: ts(h.desde), hasta: ts(h.hasta) })),
  };
}

// P3-14: el plan público lleva solo { tipo, inicio, vence, escalon } (lo que necesita la app para habilitar o no);
// el historial (con montos) vive en clubs/{c}/privado/plan, que leen quien configura el club y el super-admin
const planPublico = (plan) => {
  const { historial: _historial, ...resto } = plan;
  return resto;
};
async function historialDelPlan(clubRef, club) {
  const priv = await clubRef.collection("privado").doc("plan").get();
  const privado = priv.exists && Array.isArray(priv.data().historial) ? priv.data().historial : [];
  const publico = (club && club.plan && Array.isArray(club.plan.historial) && club.plan.historial) || [];
  // P3-15 (revisión): entre el deploy y la migración puede haber entradas en los dos lados: se unen sin repetir
  const clave = (h) => JSON.stringify([h && h.tipo, h && h.desde && (h.desde.seconds ?? h.desde), h && h.hasta && (h.hasta.seconds ?? h.hasta), h && h.monto, h && h.nota]);
  const vistos = new Set(privado.map(clave));
  return [...privado, ...publico.filter((h) => !vistos.has(clave(h)))];
}
async function guardarPlanServidor(clubRef, plan) {
  const p = planAFirestore(plan);
  const batch = db.batch();
  batch.update(clubRef, { plan: planPublico(p) });
  batch.set(clubRef.collection("privado").doc("plan"), { historial: p.historial || [], actualizadoEn: FieldValue.serverTimestamp() }, { merge: true });
  await batch.commit();
}

// Un club nuevo arranca en "prueba" sin fecha: los 30 días empiezan con su primera reserva confirmada
exports.onClubCreated = onDocumentCreated("clubs/{clubId}", async (event) => {
  const club = event.data && event.data.data();
  if (!club || club.plan) return;
  const planes = await planesUtil();
  await guardarPlanServidor(event.data.ref, planes.planInicial());
  logger.info(`plan: club ${event.params.clubId} en prueba (sin empezar)`);
});

// La primera reserva confirmada (no de torneo) arranca la prueba. Lectura barata primero; transacción solo si toca.
async function iniciarPruebaDelClub(clubId, reserva) {
  if (!reserva || reserva.tipo === "torneo") return;
  try {
    const clubRef = db.collection("clubs").doc(clubId);
    const snap = await clubRef.get();
    const plan = snap.exists ? snap.data().plan : null;
    if (!plan || plan.tipo !== "prueba" || plan.inicio) return;
    const planes = await planesUtil();
    const empezo = await db.runTransaction(async (tx) => {
      const s = await tx.get(clubRef);
      const nuevo = planes.iniciarPrueba(s.exists ? s.data().plan : null, Date.now());
      if (!nuevo) return false;
      tx.update(clubRef, { "plan.inicio": Timestamp.fromMillis(nuevo.inicio), "plan.vence": Timestamp.fromMillis(nuevo.vence) });
      return true;
    });
    if (empezo) logger.info(`plan: empezó la prueba de ${clubId}`);
  } catch (err) {
    logger.error(`plan: no se pudo iniciar la prueba de ${clubId}`, err);
  }
}

exports.onReservaCreated = onDocumentCreated("clubs/{clubId}/reservas/{reservaId}", async (event) => {
  const reserva = event.data && event.data.data();
  if (reserva && reserva.status === "confirmada") await iniciarPruebaDelClub(event.params.clubId, reserva);
});

// Todos los días 03:30: prueba vencida → FREE; PRO vencido hace más de 7 días → FREE. Aviso al dueño.
exports.planesVencidos = onSchedule({ schedule: "every day 03:30", timeZone: ZONA_HORARIA }, async () => {
  const planes = await planesUtil();
  const snap = await db.collection("clubs").where("plan.tipo", "in", ["prueba", "pro"]).get();
  const ahora = Date.now();
  let pasados = 0;
  for (const d of snap.docs) {
    try {
      const club = d.data();
      const historial = await historialDelPlan(d.ref, club);
      const nuevo = planes.transicionVencida({ ...club.plan, historial }, ahora);
      if (!nuevo) continue;
      await guardarPlanServidor(d.ref, nuevo);
      pasados += 1;
      if (club.ownerUid) {
        const eraPrueba = club.plan.tipo === "prueba";
        await nuevaNotificacionRef(club.ownerUid).set({
          tipo: "plan_vencido",
          titulo: eraPrueba ? "Terminó tu prueba de Padely" : "Tu plan PRO venció",
          mensaje: `${club.nombre || "Tu club"} pasó al plan FREE: las canchas, las reservas y la seña online siguen andando, con una comisión de ${planes.COMISION_FREE_PCT.toLocaleString("es-AR")} % por pago online. El bar, la caja y las cuentas del equipo quedan bloqueados hasta que pases a PRO.`,
          link: "/admin/plan",
          icono: "📋",
          leida: false,
          createdAt: FieldValue.serverTimestamp(),
        });
      }
    } catch (err) {
      logger.error(`planesVencidos: ${d.id}`, err);
    }
  }
  logger.info(`planesVencidos: ${pasados} pasaron a FREE (${snap.size} con prueba o PRO)`);
});

// "Ya pagué, avisar" desde Mi plan: avisosPago/{id} lo crea el dueño; acá se avisa a cada super-admin
exports.onAvisoPagoCreated = onDocumentCreated("avisosPago/{avisoId}", async (event) => {
  const aviso = event.data && event.data.data();
  if (!aviso) return;
  const admins = await db.collection("superadmins").get();
  const batch = db.batch();
  admins.docs.forEach((a) =>
    batch.set(nuevaNotificacionRef(a.id), {
      tipo: "plan_aviso_pago",
      titulo: "Un club avisó que pagó",
      mensaje: `${aviso.clubNombre || "Un club"} avisó un pago${aviso.monto ? ` de $ ${Math.round(Number(aviso.monto)).toLocaleString("es-AR")}` : ""}${aviso.nota ? `: ${String(aviso.nota).slice(0, 120)}` : ""}.`,
      link: "/superadmin/planes",
      icono: "💳",
      leida: false,
      createdAt: FieldValue.serverTimestamp(),
    }),
  );
  await batch.commit();
  logger.info(`plan: aviso de pago de ${aviso.clubId} → ${admins.size} super-admins`);
});

// ============================================================================
// ORGANIZADORES (P3-10): users/{uid}.organizerId vincula la cuenta con su entidad para que las reglas bloqueen
// los torneos de una entidad suspendida. Lo escriben solo estas Functions (las reglas no dejan que el usuario lo toque).
// ============================================================================
exports.onOrganizerCreated = onDocumentCreated("organizers/{orgId}", async (event) => {
  const org = event.data && event.data.data();
  if (!org || !org.ownerUid) return;
  await Promise.all([
    userRef(org.ownerUid).set({ organizerId: event.params.orgId }, { merge: true }),
    db.collection("organizadoresPorUid").doc(org.ownerUid).set({ orgId: event.params.orgId, actualizadoEn: FieldValue.serverTimestamp() }),
  ]);
  logger.info(`organizador ${event.params.orgId} vinculado a ${org.ownerUid}`);
});

// Super-admin: completa organizerId en las cuentas de las entidades que ya existían
exports.vincularOrganizadores = onCall({ region: REGION, timeoutSeconds: 120 }, async (request) => {
  const uid = exigirAuth(request);
  const admin = await db.collection("superadmins").doc(uid).get();
  if (!admin.exists) throw new HttpsError("permission-denied", "Solo el super-admin");
  const snap = await db.collection("organizers").get();
  const conDueño = snap.docs.filter((d) => d.data().ownerUid);
  const ops = conDueño.flatMap((d) => [
    (b) => b.set(userRef(d.data().ownerUid), { organizerId: d.id }, { merge: true }),
    (b) => b.set(db.collection("organizadoresPorUid").doc(d.data().ownerUid), { orgId: d.id, actualizadoEn: FieldValue.serverTimestamp() }),
  ]);
  await escribirEnLotes(ops);
  logger.info(`vincularOrganizadores: ${conDueño.length} cuentas por ${uid}`);
  return { ok: true, vinculadas: conDueño.length };
});

// ============================================================================
// PRIVACIDAD (P3-14): migración única e idempotente (super-admin). 1) Ventas sin publicId → publicId aleatorio y
// copia del ticket público a ticketsPublicos/{publicId} (el documento numerado queda, pero las reglas ya no dejan
// leerlo). 2) plan.historial → clubs/{c}/privado/plan. 3) mercadoPago.userId/nickname/esPrueba → privado/mpCuenta.
// Al final prende configuracionPadely/flags { ticketsPublicId, privacidadMigrada }.
// ============================================================================
exports.migrarPrivacidad = onCall({ region: REGION, timeoutSeconds: 540, memory: "512MiB" }, async (request) => {
  const uid = exigirAuth(request);
  const admin = await db.collection("superadmins").doc(uid).get();
  if (!admin.exists) throw new HttpsError("permission-denied", "Solo el super-admin");
  const clubs = await db.collection("clubs").get();
  const r = { clubes: clubs.size, tickets: 0, planes: 0, cuentasMp: 0 };
  for (const c of clubs.docs) {
    const club = c.data() || {};
    const ref = c.ref;
    const ops = [];
    if (club.plan && Array.isArray(club.plan.historial)) {
      const historial = await historialDelPlan(ref, club);
      ops.push((b) => b.set(ref.collection("privado").doc("plan"), { historial, actualizadoEn: FieldValue.serverTimestamp() }, { merge: true }));
      ops.push((b) => b.update(ref, { plan: planPublico(club.plan) }));
      r.planes += 1;
    }
    const mpc = club.mercadoPago || {};
    if (["userId", "nickname", "esPrueba"].some((k) => k in mpc)) {
      ops.push((b) =>
        b.set(ref.collection("privado").doc("mpCuenta"), { userId: mpc.userId ?? null, nickname: mpc.nickname ?? null, esPrueba: mpc.esPrueba ?? null, liveMode: mpc.liveMode ?? null, conectadoEn: mpc.conectadoEn ?? null }, { merge: true }),
      );
      ops.push((b) => b.update(ref, { "mercadoPago.userId": FieldValue.delete(), "mercadoPago.nickname": FieldValue.delete(), "mercadoPago.esPrueba": FieldValue.delete() }));
      r.cuentasMp += 1;
    }
    const ventas = await ref.collection("ventas").get();
    for (const v of ventas.docs) {
      if (typeof v.data().publicId === "string" && v.data().publicId) continue;
      const publicId = cc.generarToken(16);
      const ticket = await ref.collection("ticketsPublicos").doc(v.id).get();
      ops.push((b) => b.update(v.ref, { publicId }));
      if (ticket.exists) ops.push((b) => b.set(ref.collection("ticketsPublicos").doc(publicId), ticket.data()));
      r.tickets += 1;
    }
    await escribirEnLotes(ops);
  }
  await db.collection("configuracionPadely").doc("flags").set({ ticketsPublicId: true, privacidadMigrada: true, migradoEn: FieldValue.serverTimestamp(), migradoPor: uid }, { merge: true });
  logger.info(`migrarPrivacidad por ${uid}: ${JSON.stringify(r)}`);
  return { ok: true, ...r };
});


// ============================================================================
// SEÑAS DE RESERVAS CANCELADAS (P3-14 B): devolución por MP, crédito en el club o queda para el club, según
// src/utils/senas.js (política del club). Créditos: users/{uid}/creditos/{id} = { clubId, clubNombre, monto, estado:
// disponible | usado, origen, creadoEn } (solo Functions); se aplican solos en la próxima seña online de ese club.
// ============================================================================
async function creditosDisponibles(uid, clubId) {
  const snap = await userRef(uid).collection("creditos").where("clubId", "==", clubId).where("estado", "==", "disponible").get();
  return snap.docs.map((d) => ({ id: d.id, monto: Number(d.data().monto) || 0 })).filter((c) => c.monto > 0);
}

// La seña entera sale del crédito: se usan los créditos necesarios (el sobrante vuelve como crédito nuevo) y la
// reserva queda con la seña pagada (señaMedio "credito")
async function usarCreditoEnSeña({ uid, clubId, clubRef, reservaId, seña, creditos }) {
  await db.runTransaction(async (tx) => {
    const refs = creditos.map((c) => userRef(uid).collection("creditos").doc(c.id));
    const snaps = await Promise.all(refs.map((r) => tx.get(r)));
    const slots = await tx.get(clubRef.collection("reservas").where("grupoId", "==", reservaId));
    const cabeza = await tx.get(clubRef.collection("reservas").doc(reservaId));
    let falta = seña;
    snaps.forEach((snap, i) => {
      if (falta <= 0 || !snap.exists || snap.data().estado !== "disponible") return;
      const monto = Number(snap.data().monto) || 0;
      tx.update(refs[i], { estado: "usado", usadoEn: FieldValue.serverTimestamp(), usadoEnReserva: reservaId });
      if (monto > falta) tx.set(userRef(uid).collection("creditos").doc(), { ...snap.data(), monto: monto - falta, estado: "disponible", origen: { ...(snap.data().origen || {}), sobranteDe: snap.id }, creadoEn: FieldValue.serverTimestamp() });
      falta -= Math.min(monto, falta);
    });
    if (falta > 0) throw new HttpsError("failed-precondition", "El crédito ya no alcanza: probá de nuevo");
    const docs = slots.docs.length ? slots.docs : cabeza.exists ? [cabeza] : [];
    docs.forEach((d) => tx.update(d.ref, { señaPagada: true, señaMedio: "credito", señaPagadaEn: FieldValue.serverTimestamp() }));
  });
}

async function procesarSeñaCancelada(clubId, reservaId, reserva) {
  try {
    if (reserva.señaResultado) return;
    const senas = await senasUtil();
    const clubRef = db.collection("clubs").doc(clubId);
    const club = (await clubRef.get()).data() || {};
    const monto = Number(reserva.seña) || 0;
    const r = senas.resolverSeñaCancelada({
      canceladaPor: reserva.canceladaPor === "club" ? "club" : "jugador",
      politica: senas.politicaDe(club),
      inicioTurnoMs: senas.inicioDelTurnoMs(reserva.fecha, reserva.horaInicio || reserva.hora),
      ahoraMs: Date.now(),
      señaPagada: !!reserva.señaPagada,
      monto,
      medio: reserva.señaMedio || null,
    });
    if (r.accion === "nada") return;
    const resultado = { accion: r.accion, motivo: r.motivo, monto, en: FieldValue.serverTimestamp() };
    const reservaRef = clubRef.collection("reservas").doc(reservaId);
    // Idempotente aunque el trigger llegue dos veces: señaResultado se reclama en una transacción que relee la reserva,
    // y el crédito tiene id fijo por reserva (club + reserva + creación: un turno re-reservado da otro id). Una seña pagada en parte con crédito y en parte por MP devuelve el crédito como crédito.
    const pagoSnap = r.accion === "reembolso_mp" && reserva.señaPagoMpId ? await clubRef.collection("pagosMp").doc(String(reserva.señaPagoMpId)).get().catch(() => null) : null;
    const creditoUsado = pagoSnap && pagoSnap.exists ? Number(pagoSnap.data().creditoAplicado) || 0 : 0;
    const montoCredito = r.accion === "credito" ? monto : creditoUsado;
    const reclamado = await db.runTransaction(async (tx) => {
      const actual = await tx.get(reservaRef);
      if (!actual.exists || actual.data().señaResultado) return false;
      if (montoCredito > 0 && reserva.jugadorUid) {
        tx.set(userRef(reserva.jugadorUid).collection("creditos").doc(`seña_${clubId}_${reservaId}_${(reserva.createdAt && reserva.createdAt.seconds) || 0}`), { clubId, clubNombre: club.nombre || null, monto: montoCredito, estado: "disponible", origen: { tipo: "seña", reservaId, fecha: reserva.fecha || null, motivo: r.motivo, ...(r.accion === "reembolso_mp" ? { parteCredito: true } : {}) }, creadoEn: FieldValue.serverTimestamp() });
      }
      tx.update(reservaRef, { señaResultado: { ...resultado, ...(creditoUsado > 0 ? { creditoDevuelto: creditoUsado } : {}), ...(r.accion === "credito" && !reserva.jugadorUid ? { sinCuenta: true } : {}) } });
      return true;
    });
    if (!reclamado) return;
    if (r.accion === "credito" && !reserva.jugadorUid) resultado.sinCuenta = true;
    const nombreClub = club.nombre || "el club";
    const montoTxt = `$ ${Math.round(monto).toLocaleString("es-AR")}`;
    let mensajeJugador = null;
    if (r.accion === "reembolso_mp") {
      // La venta de la seña online (M3) se anula: onVentaUpdated → revertirVentaDeCuenta pide la devolución a MP y,
      // si MP no la acepta, avisa al dueño para que la haga a mano (como cualquier devolución)
      const ventas = await clubRef.collection("ventas").where("reservaId", "==", reservaId).where("estado", "==", "ok").limit(1).get();
      if (!ventas.empty) await ventas.docs[0].ref.update({ estado: "anulada", anulacion: { por: "sistema", porNombre: "Padely", motivo: `Reserva cancelada: ${r.motivo}`, en: Timestamp.now(), origen: "señaCancelada" }, actualizadoEn: FieldValue.serverTimestamp() });
      else await reservaRef.update({ "señaResultado.sinVenta": true });
      const mpTxt = `$ ${Math.round(monto - creditoUsado).toLocaleString("es-AR")}`;
      mensajeJugador = creditoUsado > 0
        ? `Tu reserva en ${nombreClub} se canceló: te devolvemos ${mpTxt} por Mercado Pago y $ ${Math.round(creditoUsado).toLocaleString("es-AR")} te quedan como crédito ahí.`
        : `Tu reserva en ${nombreClub} se canceló y te devolvemos la seña (${montoTxt}) por Mercado Pago.`;
    } else if (r.accion === "credito") {
      if (reserva.jugadorUid) mensajeJugador = `Tu reserva en ${nombreClub} se canceló: la seña (${montoTxt}) te queda como crédito para tu próxima reserva ahí.`;
    } else if (r.accion === "queda_club") {
      mensajeJugador = `Tu reserva en ${nombreClub} se canceló. Según la política del club, la seña (${montoTxt}) no se devuelve (${r.motivo}).`;
    }
    if (mensajeJugador && reserva.jugadorUid) {
      await avisoA(reserva.jugadorUid, { tipo: "seña_cancelada", titulo: "Seña de tu reserva cancelada", mensaje: mensajeJugador, link: "/mis-reservas", icono: "💳" }).catch(() => {});
    }
    if (club.ownerUid) {
      const textoClub = { reembolso_mp: `se devuelve por Mercado Pago`, credito: resultado.sinCuenta ? "no se pudo dar como crédito (reserva sin cuenta de jugador): resolvela a mano" : "quedó como crédito del jugador", queda_club: "queda para el club" }[r.accion];
      await avisoA(club.ownerUid, { tipo: "seña_cancelada", titulo: "Reserva con seña cancelada", mensaje: `${reserva.nombreJugador || "Una reserva"} · ${reserva.fecha || ""} ${reserva.horaInicio || reserva.hora || ""}: la seña (${montoTxt}) ${textoClub}.`, link: `/admin/canchas?fecha=${reserva.fecha || ""}`, icono: "💳" }).catch(() => {});
    }
    logger.info(`seña cancelada ${clubId}/${reservaId}: ${r.accion} (${r.motivo})`);
  } catch (err) {
    logger.error(`seña cancelada ${clubId}/${reservaId}`, err);
  }
}


// ============================================================================
// INSCRIPCIONES ONLINE (P3-14 C): la entidad organizadora conecta su cuenta de MP (organizers/{o}/privado/mercadopago,
// igual que los clubes) y cada torneo con inscripcion > 0 e inscripcionOnline cobra la inscripción por Checkout Pro.
// tournaments/{t}/pagosInscripcion/{pagoId} (solo Functions) + pagosInscripcionIndice/{pagoId} → { torneoId,
// organizerId }; external_reference "ins_<pagoId>". Al aprobarse: inscripciones/{i}.pago = { estado: "pagado",
// medio, paymentId, monto, pagoId, en }. Comisión de Padely: configuracionPadely/facturacion.comisionTorneosPct.
// Si la pareja se rechaza o se borra antes de empezar el torneo, se devuelve el pago.
// ============================================================================
async function conectarOrganizador(organizerId, state, code, res) {
  const volver = (q) => res.redirect(302, `${APP_URL}/org/entidad?${new URLSearchParams(q).toString()}`);
  const orgRef = db.collection("organizers").doc(organizerId);
  const guardado = await stateMpRef(orgRef).get();
  if (!guardado.exists || guardado.data().state !== state || Date.now() - (Number(guardado.data().creadoEnMs) || 0) > MP_STATE_MIN * 60000) return volver({ mp: "error", motivo: "state-vencido" });
  if (!code) return volver({ mp: "error", motivo: "sin-code" });
  const r = await mpFetch("/oauth/token", { method: "POST", body: mp.cuerpoTokenPorCodigo({ clientId: MP_CLIENT_ID.value(), clientSecret: MP_CLIENT_SECRET.value(), code: String(code), redirectUri: MP_REDIRECT_URI }) });
  const tokens = mp.tokensDeRespuesta(r);
  if (!tokens.accessToken) return volver({ mp: "error", motivo: "sin-token" });
  let nickname = null;
  let esPrueba = false;
  try {
    const me = await mpFetch("/users/me", { token: tokens.accessToken });
    nickname = (me && me.nickname) || null;
    esPrueba = mp.esUsuarioDePrueba(me);
  } catch {
    nickname = null;
  }
  const batch = db.batch();
  batch.set(privadoMpRef(orgRef), { ...tokens, conectadoEn: FieldValue.serverTimestamp(), conectadoPor: guardado.data().uid || null });
  batch.set(orgRef, { mercadoPago: { conectado: true, conectadoEn: FieldValue.serverTimestamp(), liveMode: tokens.liveMode } }, { merge: true });
  batch.set(orgRef.collection("privado").doc("mpCuenta"), { userId: tokens.userId, nickname, esPrueba, liveMode: tokens.liveMode, conectadoEn: FieldValue.serverTimestamp() });
  batch.delete(stateMpRef(orgRef));
  await batch.commit();
  logger.info(`mp: entidad ${organizerId} conectada (user ${tokens.userId}, live ${tokens.liveMode})`);
  return volver({ mp: "ok" });
}

// Jugador: paga la inscripción de su pareja → { initPoint, monto }
exports.mpPagarInscripcion = onCall({ region: REGION, secrets: [MP_CLIENT_SECRET] }, async (request) => {
  const uid = exigirAuth(request);
  const torneoId = texto(request.data && request.data.torneoId, 80);
  const inscripcionId = texto(request.data && request.data.inscripcionId, 80);
  if (!torneoId || !inscripcionId) throw new HttpsError("invalid-argument", "torneoId e inscripcionId");
  const torneoRef = db.collection("tournaments").doc(torneoId);
  const [tSnap, iSnap] = await Promise.all([torneoRef.get(), torneoRef.collection("inscripciones").doc(inscripcionId).get()]);
  if (!tSnap.exists || !iSnap.exists) throw new HttpsError("not-found", "El torneo o la inscripción no existen");
  const torneo = tSnap.data();
  const insc = iSnap.data();
  if (insc.jugador1Uid !== uid && insc.jugador2Uid !== uid) throw new HttpsError("permission-denied", "La inscripción no es tuya");
  if (!torneo.inscripcionOnline || !(Number(torneo.inscripcion) > 0)) throw new HttpsError("failed-precondition", "Este torneo no cobra la inscripción online");
  if (insc.status === "rechazada") throw new HttpsError("failed-precondition", "La inscripción fue rechazada");
  if (insc.pago && insc.pago.estado === "pagado") throw new HttpsError("failed-precondition", "La inscripción ya está pagada");
  const orgSnap = await db.collection("organizers").where("ownerUid", "==", torneo.organizerId).limit(1).get();
  if (orgSnap.empty) throw new HttpsError("failed-precondition", "El organizador no tiene Mercado Pago conectado");
  const orgRef = orgSnap.docs[0].ref;
  const tokens = await tokensDelClub(orgRef);
  if (!tokens || !tokens.accessToken) throw new HttpsError("failed-precondition", "El organizador no tiene Mercado Pago conectado");
  const facturacion = (await db.collection("configuracionPadely").doc("facturacion").get()).data() || {};
  const comision = mp.comisionTorneos(facturacion);
  const monto = Number(torneo.inscripcion);
  const pagoRef = torneoRef.collection("pagosInscripcion").doc();
  const nombre = await nombreDeUsuario(uid, "");
  const pref = mp.cuerpoPreferencia({
    titulo: `${torneo.nombre || "Torneo"} · Inscripción`,
    monto,
    pagoMpId: mp.referenciaInscripcion(pagoRef.id),
    pagador: { uid, nombre },
    notificationUrl: `${MP_WEBHOOK_URL}?org=${orgRef.id}`,
    backUrl: `${APP_URL}/torneos/${torneoId}`,
    comisionPct: comision,
  });
  let r;
  try {
    r = await mpFetch("/checkout/preferences", { method: "POST", token: tokens.accessToken, body: pref.body, idempotencia: pagoRef.id });
  } catch (err) {
    logger.error(`mpPagarInscripcion ${torneoId}: preferencia rechazada (${err.status || ""}) ${err.message}`);
    throw new HttpsError("unavailable", "Mercado Pago no aceptó el cobro. Probá de nuevo en un momento.");
  }
  const initPoint = r.init_point || r.sandbox_init_point || null;
  if (!r.id || !initPoint) throw new HttpsError("unavailable", "Mercado Pago no devolvió el link de pago");
  await Promise.all([
    pagoRef.set({ estado: "pendiente", inscripcionId, organizerId: orgRef.id, monto, comisionPct: comision, preferenceId: r.id, pagador: { uid, nombre }, creadoEn: FieldValue.serverTimestamp() }),
    db.collection("pagosInscripcionIndice").doc(pagoRef.id).set({ torneoId, organizerId: orgRef.id, creadoEn: FieldValue.serverTimestamp() }),
  ]);
  logger.info(`mpPagarInscripcion ${torneoId}/${inscripcionId}: $${monto} por ${uid}`);
  return { initPoint, monto };
});

async function aplicarPagoInscripcionLeido(orgRef, pago) {
  const paymentId = String(pago.id);
  const pagoId = mp.pagoIdDeReferencia(pago.external_reference);
  if (!pagoId) return `pago ${paymentId} sin referencia de inscripción → ignorado`;
  const indice = await db.collection("pagosInscripcionIndice").doc(pagoId).get();
  if (!indice.exists || indice.data().organizerId !== orgRef.id) return `pago ${paymentId} no es de esta entidad → ignorado`;
  const torneoRef = db.collection("tournaments").doc(indice.data().torneoId);
  const pagoRef = torneoRef.collection("pagosInscripcion").doc(pagoId);
  if (pago.status === "approved") {
    const resultado = await db.runTransaction(async (tx) => {
      const snap = await tx.get(pagoRef);
      const d = mp.decisionPagoInscripcion(snap.exists ? snap.data() : null, paymentId);
      if (d.accion === "ignorar") return d.resultado;
      const p = snap.data();
      const monto = Number(pago.transaction_amount) || p.monto;
      // P3-15 (revisión): la inscripción se relee. Si ya está pagada (el compañero pagó, o el organizador la marcó en
      // efectivo) o ya no existe, este pago es duplicado: se registra y se devuelve entero.
      const inscRef = torneoRef.collection("inscripciones").doc(p.inscripcionId);
      const iSnap = await tx.get(inscRef);
      const yaPagada = iSnap.exists && iSnap.data().pago && iSnap.data().pago.estado === "pagado" && iSnap.data().pago.paymentId !== paymentId;
      if (!iSnap.exists || yaPagada) {
        tx.update(pagoRef, { estado: "duplicado", paymentId, montoPagado: monto, motivo: iSnap.exists ? "ya pagada" : "inscripción borrada", aprobadoEn: FieldValue.serverTimestamp() });
        return "duplicado";
      }
      tx.update(pagoRef, { estado: "aprobado", paymentId, montoPagado: monto, aprobadoEn: FieldValue.serverTimestamp() });
      tx.update(inscRef, { pago: { estado: "pagado", medio: "mercadopago", paymentId, monto, pagoId, en: FieldValue.serverTimestamp() } });
      return "aplicado";
    });
    if (resultado === "duplicado") {
      const r = await devolverPagoMp(orgRef, paymentId, { idempotencia: `insc_dup_${pagoId}` });
      await pagoRef.set({ devolucion: { ...mp.devolucionDe(r, { monto: Number(pago.transaction_amount) || 0 }), en: Timestamp.now() }, ...(r.ok ? { estado: "devuelto" } : {}) }, { merge: true });
      logger.warn(`inscripción: pago duplicado ${paymentId} → devolución ${r.ok ? "ok" : `falló (${r.error})`}`);
    }
    return `pago ${paymentId}: ${resultado}`;
  }
  if (pago.status === "refunded" || pago.status === "charged_back") {
    await pagoRef.set({ estado: "devuelto", estadoMp: pago.status, actualizadoEn: FieldValue.serverTimestamp() }, { merge: true });
    return `pago ${paymentId} ${pago.status}`;
  }
  if (pago.status === "rejected" || pago.status === "cancelled") await pagoRef.set({ estado: "rechazado", paymentId, estadoMp: pago.status, actualizadoEn: FieldValue.serverTimestamp() }, { merge: true });
  return `pago ${paymentId} ${pago.status}`;
}

// Pareja rechazada o borrada con la inscripción pagada por MP, antes de que empiece el torneo → devolución
exports.onInscripcionEscrita = onDocumentWritten("tournaments/{tid}/inscripciones/{iid}", async (event) => {
  const antes = event.data && event.data.before && event.data.before.exists ? event.data.before.data() : null;
  const despues = event.data && event.data.after && event.data.after.exists ? event.data.after.data() : null;
  if (!antes || !antes.pago || antes.pago.estado !== "pagado" || antes.pago.medio !== "mercadopago") return;
  const sale = !despues || (despues.status === "rechazada" && antes.status !== "rechazada");
  if (!sale || (despues && despues.pago && despues.pago.devolucion)) return;
  const { tid, iid } = event.params;
  const torneo = (await db.collection("tournaments").doc(tid).get()).data() || {};
  if (torneo.status && torneo.status !== "inscripcion") {
    logger.info(`inscripción ${tid}/${iid}: el torneo ya empezó, sin devolución automática`);
    return;
  }
  const indice = await db.collection("pagosInscripcionIndice").doc(String(antes.pago.pagoId || "")).get();
  if (!indice.exists) return;
  const orgRef = db.collection("organizers").doc(indice.data().organizerId);
  const r = await devolverPagoMp(orgRef, String(antes.pago.paymentId), { idempotencia: `insc_${iid}` });
  const devolucion = { ...mp.devolucionDe(r, { monto: antes.pago.monto }), en: Timestamp.now() };
  await db.collection("tournaments").doc(tid).collection("pagosInscripcion").doc(String(antes.pago.pagoId)).set({ estado: r.ok ? "devuelto" : "aprobado", devolucion }, { merge: true });
  if (despues) await event.data.after.ref.update({ "pago.devolucion": devolucion, ...(r.ok ? { "pago.estado": "devuelto" } : {}) });
  logger.info(`inscripción ${tid}/${iid}: devolución ${r.ok ? "ok" : `falló (${r.error})`}`);
});


// ============================================================================
// PARTIDOS ABIERTOS (P3-15): el titular de una reserva confirmada publica "me faltan N jugadores"; otros se suman
// desde el Hub o la página del club y quedan como participantes de la cuenta del turno (pagan su parte). Lógica en
// src/utils/partidos.js (copiada a functions/lib/partidos.mjs). Índice público partidosAbiertos/{reservaId} (sin
// nombres ni contacto) que mantiene onReservaUpdated; el barrido horario saca los que ya empezaron.
// ============================================================================
let partidosUtilPromesa = null;
const partidosUtil = () => (partidosUtilPromesa ||= import("./lib/partidos.mjs"));

async function sincronizarIndicePartido(clubId, reservaId, reserva) {
  const P = await partidosUtil();
  const ref = db.collection("partidosAbiertos").doc(reservaId);
  if (!P.partidoVigente(reserva)) {
    await ref.delete().catch(() => {});
    return;
  }
  const club = (await db.collection("clubs").doc(clubId).get()).data() || {};
  await ref.set({ ...P.indicePublico(reservaId, reserva, club, clubId), actualizadoEn: FieldValue.serverTimestamp() });
}

// Titular: publica o actualiza el partido abierto de su reserva
exports.abrirPartido = onCall({ region: REGION }, async (request) => {
  const uid = exigirAuth(request);
  const d = request.data || {};
  const clubId = texto(d.clubId, 80);
  const reservaId = texto(d.reservaId, 120);
  if (!clubId || !reservaId) throw new HttpsError("invalid-argument", "clubId y reservaId");
  const P = await partidosUtil();
  const datos = P.normalizarPartido(d);
  if (datos.error) throw new HttpsError("invalid-argument", datos.error);
  const ref = db.collection("clubs").doc(clubId).collection("reservas").doc(reservaId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "La reserva no existe");
    const r = snap.data();
    if (r.jugadorUid !== uid) throw new HttpsError("permission-denied", "Solo quien reservó puede buscar jugadores");
    if (r.status !== "confirmada") throw new HttpsError("failed-precondition", "La reserva no está confirmada");
    const inicio = P.inicioMs(r.fecha, r.horaInicio || r.hora);
    if (inicio === null || inicio <= Date.now()) throw new HttpsError("failed-precondition", "El turno ya empezó");
    const jugadores = P.jugadoresDe(r.partidoAbierto);
    if (datos.faltan < jugadores.length) throw new HttpsError("failed-precondition", `Ya se sumaron ${jugadores.length}: no podés pedir menos`);
    tx.update(ref, { partidoAbierto: { ...datos, jugadores, creadoEn: (r.partidoAbierto && r.partidoAbierto.creadoEn) || FieldValue.serverTimestamp() } });
  });
  logger.info(`abrirPartido ${clubId}/${reservaId} por ${uid}: faltan ${datos.faltan}`);
  return { ok: true };
});

// Titular: deja de buscar jugadores (los que ya se sumaron siguen en la cuenta)
exports.cerrarPartido = onCall({ region: REGION }, async (request) => {
  const uid = exigirAuth(request);
  const clubId = texto(request.data && request.data.clubId, 80);
  const reservaId = texto(request.data && request.data.reservaId, 120);
  if (!clubId || !reservaId) throw new HttpsError("invalid-argument", "clubId y reservaId");
  const ref = db.collection("clubs").doc(clubId).collection("reservas").doc(reservaId);
  const snap = await ref.get();
  if (!snap.exists || snap.data().jugadorUid !== uid) throw new HttpsError("permission-denied", "Solo quien reservó");
  await ref.update({ partidoAbierto: null });
  return { ok: true };
});

// Jugador: se suma → participante de la cuenta del turno (la crea si no existe) y aviso al titular
exports.sumarmePartido = onCall({ region: REGION }, async (request) => {
  const uid = exigirAuth(request);
  const clubId = texto(request.data && request.data.clubId, 80);
  const reservaId = texto(request.data && request.data.reservaId, 120);
  if (!clubId || !reservaId) throw new HttpsError("invalid-argument", "clubId y reservaId");
  const P = await partidosUtil();
  const clubRef = db.collection("clubs").doc(clubId);
  const ref = clubRef.collection("reservas").doc(reservaId);
  const nombre = await nombreDeUsuario(uid, "Jugador");
  const r = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "El partido ya no existe");
    const reserva = snap.data();
    const chequeo = P.puedeSumarse(reserva, uid);
    if (!chequeo.ok) throw new HttpsError("failed-precondition", chequeo.motivo);
    const { cuenta, guardar } = await cuentaDelTurnoEnTx(tx, clubRef, reservaId, { uid: reserva.jugadorUid, nombre: reserva.nombreJugador || "" });
    const participantes = cc.participantesDe(cuenta);
    const ya = cc.participantesActivos({ participantes }).some((p) => p.uid === uid);
    const nuevos = ya ? participantes : [...participantes, cc.nuevoParticipante({ uid, nombre, tipo: "jugador", origen: "partidoAbierto", agregadoPor: uid, ahora: Timestamp.now() })];
    guardar({ participantes: nuevos, participantesUids: cc.uidsDe(nuevos) });
    tx.update(ref, { partidoAbierto: P.conJugador(reserva.partidoAbierto, { uid, nombre }) });
    return reserva;
  });
  if (r.jugadorUid) {
    await avisoA(r.jugadorUid, { tipo: "partido_sumado", titulo: "Se sumó un jugador a tu partido", mensaje: `${nombre} se sumó a tu turno del ${fechaCortaArgentina(r.fecha)} a las ${r.horaInicio || r.hora || ""}.`, link: "/mis-reservas", icono: "🎾" }).catch(() => {});
  }
  await avisoA(uid, { tipo: "partido_sumado", titulo: "Te sumaste al partido", mensaje: `Estás en el turno del ${fechaCortaArgentina(r.fecha)} a las ${r.horaInicio || r.hora || ""}. Tu parte se paga en el club o desde la cuenta del turno.`, link: `/mi-cuenta/${clubId}/${reservaId}`, icono: "🎾" }).catch(() => {});
  logger.info(`sumarmePartido ${clubId}/${reservaId}: ${uid}`);
  return { ok: true, grupoId: reservaId };
});

// Titular (saca a alguien) o el propio jugador (se baja): sale del partido y de la cuenta si no pagó nada
exports.quitarDePartido = onCall({ region: REGION }, async (request) => {
  const uid = exigirAuth(request);
  const clubId = texto(request.data && request.data.clubId, 80);
  const reservaId = texto(request.data && request.data.reservaId, 120);
  const quien = texto(request.data && request.data.uid, 128) || uid;
  if (!clubId || !reservaId) throw new HttpsError("invalid-argument", "clubId y reservaId");
  const P = await partidosUtil();
  const clubRef = db.collection("clubs").doc(clubId);
  const ref = clubRef.collection("reservas").doc(reservaId);
  const cuentaRef = clubRef.collection("cuentas").doc(reservaId);
  const r = await db.runTransaction(async (tx) => {
    const [snap, cSnap] = await Promise.all([tx.get(ref), tx.get(cuentaRef)]);
    if (!snap.exists) throw new HttpsError("not-found", "La reserva no existe");
    const reserva = snap.data();
    if (uid !== reserva.jugadorUid && uid !== quien) throw new HttpsError("permission-denied", "Solo quien reservó o el propio jugador");
    if (cSnap.exists && cSnap.data().estado === "abierta") {
      const cuenta = cSnap.data();
      const participantes = cc.participantesDe(cuenta);
      const p = participantes.find((x) => x.uid === quien && x.estado !== "quitado");
      if (p && cc.algoPagadoDe(cuenta, p.id)) throw new HttpsError("failed-precondition", "Ya pagó su parte: sacalo desde la cuenta del turno");
      if (p) {
        // Igual que quitarParticipante: queda en la lista como "quitado" (sus líneas sin asignar vuelven a la cuenta)
        const nuevos = participantes.map((x) => (x.id === p.id ? { ...x, estado: "quitado", quitadoEn: Timestamp.now(), quitadoPor: uid } : x));
        tx.update(cuentaRef, { participantes: nuevos, participantesUids: cc.uidsDe(nuevos), actualizadoEn: FieldValue.serverTimestamp() });
      }
    }
    tx.update(ref, { partidoAbierto: reserva.partidoAbierto ? P.sinJugador(reserva.partidoAbierto, quien) : null });
    return reserva;
  });
  if (quien !== uid) await avisoA(quien, { tipo: "partido_quitado", titulo: "Ya no estás en un partido", mensaje: `El titular te sacó del turno del ${fechaCortaArgentina(r.fecha)} a las ${r.horaInicio || r.hora || ""}.`, link: "/mis-reservas", icono: "🎾" }).catch(() => {});
  else if (r.jugadorUid) await avisoA(r.jugadorUid, { tipo: "partido_quitado", titulo: "Un jugador se bajó de tu partido", mensaje: `Se liberó un lugar en tu turno del ${fechaCortaArgentina(r.fecha)} a las ${r.horaInicio || r.hora || ""}.`, link: "/mis-reservas", icono: "🎾" }).catch(() => {});
  return { ok: true };
});

// Cada hora: los partidos cuyo turno ya empezó salen del índice público
exports.partidosAbiertosVencidos = onSchedule({ schedule: "every 60 minutes", timeZone: ZONA_HORARIA }, async () => {
  const snap = await db.collection("partidosAbiertos").where("inicioMs", "<=", Date.now()).get();
  if (snap.empty) return;
  await escribirEnLotes(snap.docs.map((d) => (b) => b.delete(d.ref)));
  logger.info(`partidosAbiertosVencidos: ${snap.size} fuera de la lista`);
});


// ============================================================================
// SOCIOS Y MEMBRESÍAS (P3-16): cada club arma sus planes (clubs/{c}/planesSocio) con beneficios que aplica Padely
// (descuento en la cancha y el bar, sin seña, reservar antes) y extras de texto libre (estacionamiento, lugar en
// exhibiciones…). clubs/{c}/socios/{id}: el jugador pide, el club aprueba y cobra (a mano en esta versión).
// onSocioEscrito pone el token del QR y el número de socio, publica sociosPublicos/{token} y avisa; el barrido diario
// marca vencidas y avisa 5 días antes. Lógica en src/utils/membresias.js (copiada a functions/lib/membresias.mjs).
// ============================================================================
let membresiasUtilPromesa = null;
const membresiasUtil = () => (membresiasUtilPromesa ||= import("./lib/membresias.mjs"));
const msDe = (v) => (v == null ? null : typeof v.toMillis === "function" ? v.toMillis() : Number(v));

exports.onSocioEscrito = onDocumentWritten("clubs/{clubId}/socios/{socioId}", async (event) => {
  const { clubId, socioId } = event.params;
  const antes = event.data.before.exists ? event.data.before.data() : null;
  const despues = event.data.after.exists ? event.data.after.data() : null;
  if (!despues) {
    if (antes && antes.token) await db.collection("sociosPublicos").doc(antes.token).delete().catch(() => {});
    return;
  }
  const ref = event.data.after.ref;
  const clubRef = db.collection("clubs").doc(clubId);
  // 1) Token del QR y nombre del club (una vez) y número de socio (al activarse por primera vez). Esa escritura
  //    vuelve a disparar el trigger (sin cambio de estado: no repite avisos) y ahí se publica la verificación.
  if (!despues.token || !despues.clubNombre || (despues.estado === "activa" && !despues.numero)) {
    const clubSnap = await clubRef.get();
    await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return;
      const s = snap.data();
      const cambios = {};
      if (!s.token) cambios.token = cc.generarToken(16);
      if (!s.clubNombre) cambios.clubNombre = (clubSnap.exists && clubSnap.data().nombre) || "Club";
      let contadorRef = null;
      let n = null;
      if (s.estado === "activa" && !s.numero) {
        contadorRef = clubRef.collection("contadoresDispositivos").doc("SOCIOS");
        const cSnap = await tx.get(contadorRef);
        n = (Number(cSnap.exists ? cSnap.data().usado : 0) || 0) + 1;
        cambios.numero = n;
      }
      if (contadorRef) tx.set(contadorRef, { usado: n, actualizadoEn: FieldValue.serverTimestamp() }, { merge: true });
      if (Object.keys(cambios).length) tx.update(ref, cambios);
    });
  }
  const M = await membresiasUtil();
  const club = (await clubRef.get()).data() || {};
  // 2) Verificación pública del carnet (cuando ya hay token: si recién se creó, la escribe el próximo disparo)
  if (despues.token) await db.collection("sociosPublicos").doc(despues.token).set({ ...M.verificacionPublica(clubId, club, { ...despues, vence: msDe(despues.vence) }), actualizadoEn: FieldValue.serverTimestamp() });
  // 3) Avisos según el cambio de estado
  const estAntes = antes ? antes.estado : null;
  const estDespues = despues.estado;
  const nombreClub = club.nombre || "el club";
  if (estDespues === "pendiente" && estAntes !== "pendiente" && club.ownerUid) {
    await avisoA(club.ownerUid, { tipo: "socio_pedido", titulo: "Nuevo pedido de socio", mensaje: `${despues.nombre || "Un jugador"} quiere ser socio (${despues.planNombre || "plan"}).`, link: "/admin/socios", icono: "🪪" }).catch(() => {});
  }
  if (despues.uid) {
    const venceTxt = despues.vence ? fechaCortaArgentina(new Date(msDe(despues.vence) - 3 * 3600 * 1000).toISOString().slice(0, 10)) : "";
    if (estDespues === "activa" && estAntes !== "activa") {
      await avisoA(despues.uid, { tipo: "socio_activo", titulo: `Ya sos socio de ${nombreClub}`, mensaje: `${despues.planNombre || "Tu membresía"} activa hasta el ${venceTxt}. Tu carnet está en Mis membresías.`, link: "/membresias", icono: "🪪" }).catch(() => {});
    } else if (estDespues === "activa" && antes && msDe(despues.vence) > msDe(antes.vence)) {
      await avisoA(despues.uid, { tipo: "socio_renovado", titulo: "Membresía renovada", mensaje: `Tu membresía en ${nombreClub} sigue activa hasta el ${venceTxt}.`, link: "/membresias", icono: "🪪" }).catch(() => {});
    } else if (estDespues === "rechazada" && estAntes === "pendiente") {
      await avisoA(despues.uid, { tipo: "socio_rechazado", titulo: "Pedido de socio no aceptado", mensaje: `${nombreClub} no aceptó tu pedido${despues.motivo ? `: ${despues.motivo}` : "."}`, link: `/club/${clubId}`, icono: "🪪" }).catch(() => {});
    } else if (estDespues === "cancelada" && estAntes === "activa") {
      await avisoA(despues.uid, { tipo: "socio_baja", titulo: "Membresía dada de baja", mensaje: `${nombreClub} dio de baja tu membresía.`, link: `/club/${clubId}`, icono: "🪪" }).catch(() => {});
    }
  }
  logger.info(`socio ${clubId}/${socioId}: ${estAntes || "nuevo"} → ${estDespues}`);
});

// Todos los días: membresías vencidas → "vencida" (y aviso); las que vencen en 5 días → aviso al socio (una vez)
exports.sociosVencidos = onSchedule({ schedule: "40 4 * * *", timeZone: ZONA_HORARIA }, async () => {
  const ahora = Date.now();
  const vencidas = await db.collectionGroup("socios").where("estado", "==", "activa").where("vence", "<", Timestamp.fromMillis(ahora)).get();
  await escribirEnLotes(vencidas.docs.map((d) => (b) => b.update(d.ref, { estado: "vencida", vencidaEn: FieldValue.serverTimestamp() })));
  for (const d of vencidas.docs) {
    const s = d.data();
    if (s.uid) await avisoA(s.uid, { tipo: "socio_vencido", titulo: "Tu membresía venció", mensaje: `${s.planNombre || "Tu membresía"} venció. Renovala en el club para seguir con tus beneficios.`, link: "/membresias", icono: "🪪" }).catch(() => {});
  }
  const pronto = await db.collectionGroup("socios").where("estado", "==", "activa").where("vence", "<", Timestamp.fromMillis(ahora + 5 * 86400000)).get();
  let avisados = 0;
  for (const d of pronto.docs) {
    const s = d.data();
    const vence = msDe(s.vence);
    if (!s.uid || s.avisoVencimiento === vence) continue;
    await avisoA(s.uid, { tipo: "socio_por_vencer", titulo: "Tu membresía vence pronto", mensaje: `${s.planNombre || "Tu membresía"} vence el ${fechaCortaArgentina(new Date(vence - 3 * 3600 * 1000).toISOString().slice(0, 10))}. Renovala en el club.`, link: "/membresias", icono: "🪪" }).catch(() => {});
    await d.ref.update({ avisoVencimiento: vence });
    avisados += 1;
  }
  logger.info(`sociosVencidos: ${vencidas.size} vencidas, ${avisados} avisos de vencimiento`);
});
