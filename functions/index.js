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
      tx.set(clubRef.collection("ticketsPublicos").doc(numero), ticketPublicoDe(venta, clubSnap.exists ? clubSnap.data() : {}, clubId, numero));
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
      tx.set(clubRef.collection("ticketsPublicos").doc(numero), { estado: "anulada", anulacion: { motivo: (venta.anulacion && venta.anulacion.motivo) || null }, actualizadoEn: FieldValue.serverTimestamp() }, { merge: true });
      tx.update(refs.venta, { anulacionAplicada: true, anulacionAplicadaEn: FieldValue.serverTimestamp(), rollupAnulacionAplicado: venta.rollupAplicado === true });
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
    if (yo) yo.estado = "activo";
    else {
      if (cc.participantesActivos({ participantes }).length >= cc.PARTICIPANTES_MAX) throw new HttpsError("resource-exhausted", `El turno ya tiene ${cc.PARTICIPANTES_MAX} personas`);
      participantes.push(cc.nuevoParticipante({ uid, nombre, tipo: anonimo ? "invitado" : "jugador", anonimo, origen: "link", agregadoPor: uid, ahora: Timestamp.now() }));
    }
    tx.update(ref, { participantes, participantesUids: cc.uidsDe(participantes), actualizadoEn: FieldValue.serverTimestamp() });
    const agregado = yo || participantes[participantes.length - 1];
    return { participanteId: agregado.id, nuevo: true, titularUid: cuenta.jugadorUid, cuenta };
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
