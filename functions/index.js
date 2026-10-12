// functions/index.js — Cloud Functions de Padely.
// Base de datos Firestore en nam5 (multi-región US) → funciones en us-central1.
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue, Timestamp } = require("firebase-admin/firestore");
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
//   fin_{uid}                        torneosJugados al finalizar (tipo "torneoJugado")
// ============================================================================
const { onDocumentWritten, onDocumentUpdated } = require("firebase-functions/v2/firestore");
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
// el uid ya haya sido contado por el marcador fin_{uid}), torneosGanados y torneosGanadosEnCategoria
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
exports.onGroupWritten = onDocumentWritten("tournaments/{tid}/groups/{gid}", async (event) => {
  const after = event.data && event.data.after;
  if (!after || !after.exists) return;
  const { tid, gid } = event.params;
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
});

// Trigger C: resultados del bracket de un cuadro (tournaments/{tid}/cuadros/{cid}.bracketJson).
// Cada partido con resultado se puntúa una sola vez (marker b_{cid}_{ri}_{pi}); la final del cuadro
// (última ronda, partido 0) otorga además el bonus de campeón/subcampeón de ese cuadro.
exports.onCuadroWritten = onDocumentWritten("tournaments/{tid}/cuadros/{cid}", async (event) => {
  const after = event.data && event.data.after;
  if (!after || !after.exists) return;
  const { tid, cid } = event.params;
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
});

// Trigger B: cierre del torneo (status → finalizado)
exports.onTournamentUpdated = onDocumentUpdated("tournaments/{tid}", async (event) => {
  if (!event.data) return;
  const after = event.data.after.data();
  if (!after) return;
  const { tid } = event.params;

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
              if (reserva.status !== "pendiente") return false;
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
      if (d.data().status === "cancelada") return;
      ops.push((b) => b.update(d.ref, { status: "cancelada", motivo: "cuenta eliminada" }));
      reservas++;
    });

    const contactosSnap = await db.collectionGroup("contactosReservas").where("jugadorUid", "==", uid).get();
    contactosSnap.docs.forEach((d) => ops.push((b) => b.delete(d.ref)));

    await escribirEnLotes(ops);
    logger.info(
      `onUserDeleted ${uid}: ${parejas.size} parejas desvinculadas, ${reservas} reservas canceladas, ` +
        `${contactosSnap.size} contactos de reservas borrados`,
    );
  });
