// functions/index.js — Cloud Functions de Padely.
// Base de datos Firestore en nam5 (multi-región US) → funciones en us-central1.
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
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
      const n = await escribirMovimientosDeVenta(tx, clubId, numero, venta, { etiqueta: "venta", signo: 1 });
      tx.update(refs.venta, { aplicado: true, aplicadoEn: FieldValue.serverTimestamp() });
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
      const n = await escribirMovimientosDeVenta(tx, clubId, numero, venta, { etiqueta: "anul", signo: -1 });
      tx.update(refs.venta, { anulacionAplicada: true, anulacionAplicadaEn: FieldValue.serverTimestamp() });
      return `anulación aplicada (${n} movimientos)`;
    });
    logger.info(`onVentaUpdated ${clubId}/${numero}: ${resultado}`);
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
exports.onCuentaUpdated = onDocumentUpdated("clubs/{clubId}/cuentas/{cuentaId}", async (event) => {
  const { clubId, cuentaId } = event.params;
  const antes = event.data && event.data.before ? event.data.before.data() : null;
  const despues = event.data && event.data.after ? event.data.after.data() : null;
  if (!antes || !despues || antes.estado !== "abierta" || despues.estado === "abierta") return;
  const clubRef = db.collection("clubs").doc(clubId);
  const cuentaRef = clubRef.collection("cuentas").doc(cuentaId);
  const textoTurno = `${despues.canchaNombre || "Cancha"} ${despues.fecha || ""} ${despues.horaInicio || ""}${despues.horaFin ? `–${despues.horaFin}` : ""}`.trim();
  const total = Number(despues.totales && despues.totales.total) || 0;

  if (despues.estado === "anulada") {
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
      // 2. Los turnos de la reserva
      const reservasSnap = await tx.get(clubRef.collection("reservas").where("grupoId", "==", cuentaId));
      const existentes = pendientes.length ? await tx.getAll(...pendientes.map((p) => p.ref)) : [];
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
      tx.update(cuentaRef, { cuentaAplicada: true, cuentaAplicadaEn: FieldValue.serverTimestamp() });
      return `cerrada: ${escritos} movimientos de stock, ${reservasSnap.size} turnos${señaCobradaAca ? ", seña cobrada" : ""}`;
    });
    logger.info(`onCuentaUpdated ${clubId}/${cuentaId}: ${resultado}`);
    if (resultado === "ya aplicada" || resultado === "sin cuenta") return;
    if (despues.jugadorUid) {
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
  const snap = await db.collectionGroup("cuentas").where("estado", "==", "abierta").where("fecha", "<", hoy).get();
  if (snap.empty) {
    logger.info("cerrarCuentasVencidas: sin cuentas vencidas");
    return;
  }
  let anuladas = 0;
  let avisos = 0;
  for (const cuentaDoc of snap.docs) {
    try {
      const cuenta = cuentaDoc.data() || {};
      const items = Array.isArray(cuenta.items) ? cuenta.items : [];
      const clubRef = cuentaDoc.ref.parent.parent;
      if (!items.length) {
        await cuentaDoc.ref.update({
          estado: "anulada",
          cerradaPor: "sistema",
          cerradaEn: FieldValue.serverTimestamp(),
          cierreAutomatico: true,
          anulacion: { por: "sistema", porNombre: "Padely", motivo: "sin consumos, vencida" },
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
          mensaje: `La cuenta de ${cuenta.canchaNombre || "una cancha"} del ${cuenta.fecha || ""} (${cuenta.nombreJugador || "sin nombre"}) sigue abierta con consumos. Cobrala o anulala desde Bar → Cuentas.`,
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
  logger.info(`cerrarCuentasVencidas: ${anuladas} anuladas, ${avisos} avisos (${snap.size} vencidas)`);
});
