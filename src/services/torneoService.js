import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  setDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { parejaPublica, partidoPublico } from "../utils/torneo";

// pairs, groups y el bracket del torneo son de lectura pública, y las inscripciones las lee cualquier jugador
// con sesión: los contactos de una pareja se guardan aparte en tournaments/{tid}/contactos/{pairId} y los de
// una inscripción en tournaments/{tid}/contactosInscripciones/{inscId} (solo organizador), nunca en esos documentos.
const CAMPOS_CONTACTO = ["whatsapp1", "whatsapp2", "email1", "email2"];

function separarContactos(pareja) {
  const publica = { ...pareja };
  const contactos = {};
  CAMPOS_CONTACTO.forEach((k) => {
    if (publica[k] !== undefined) {
      if (publica[k]) contactos[k] = publica[k];
      delete publica[k];
    }
  });
  return { publica, contactos };
}

function grupoPublico(grupo) {
  const publico = { ...grupo };
  if (Array.isArray(publico.parejas)) publico.parejas = publico.parejas.map(parejaPublica);
  if (Array.isArray(publico.partidos)) publico.partidos = publico.partidos.map(partidoPublico);
  return publico;
}

export const crearTorneo = async (datos, userId) => {
  const ref = await addDoc(collection(db, "tournaments"), {
    ...datos,
    organizerId: userId,
    status: "inscripcion",
    createdAt: serverTimestamp(),
  });
  return ref.id;
};

export const getTorneosByOrganizer = async (userId) => {
  const q = query(
    collection(db, "tournaments"),
    where("organizerId", "==", userId),
    orderBy("createdAt", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const getTorneoById = async (id) => {
  const snap = await getDoc(doc(db, "tournaments", id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
};

export const actualizarTorneo = async (id, datos) => {
  await updateDoc(doc(db, "tournaments", id), datos);
};

export const agregarPareja = async (torneoId, pareja) => {
  const { publica, contactos } = separarContactos(pareja);
  const ref = await addDoc(collection(db, "tournaments", torneoId, "pairs"), {
    ...publica,
    createdAt: serverTimestamp(),
  });
  if (Object.keys(contactos).length > 0) {
    await setDoc(doc(db, "tournaments", torneoId, "contactos", ref.id), {
      ...contactos,
      actualizadoEn: serverTimestamp(),
    });
  }
  return ref.id;
};

// Contactos de las parejas del torneo ({ [pairId]: { whatsapp1, whatsapp2, email1, email2 } }), solo organizador
export const getContactosParejas = async (torneoId) => {
  const snap = await getDocs(collection(db, "tournaments", torneoId, "contactos"));
  const contactos = {};
  snap.docs.forEach((d) => {
    contactos[d.id] = d.data();
  });
  return contactos;
};

export const getParejas = async (torneoId) => {
  const snap = await getDocs(collection(db, "tournaments", torneoId, "pairs"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const eliminarPareja = async (torneoId, parejaId) => {
  await deleteDoc(doc(db, "tournaments", torneoId, "pairs", parejaId));
  try {
    await deleteDoc(doc(db, "tournaments", torneoId, "contactos", parejaId));
  } catch (err) {
    console.error("Error al borrar los contactos de la pareja:", err);
  }
};

export const guardarGrupos = async (torneoId, grupos) => {
  const snap = await getDocs(collection(db, "tournaments", torneoId, "groups"));
  const deletePromises = snap.docs.map((d) =>
    deleteDoc(doc(db, "tournaments", torneoId, "groups", d.id)),
  );
  await Promise.all(deletePromises);

  const createPromises = grupos.map((grupo) =>
    addDoc(collection(db, "tournaments", torneoId, "groups"), {
      ...grupoPublico(grupo),
      createdAt: serverTimestamp(),
    }),
  );
  const refs = await Promise.all(createPromises);
  return refs.map((r) => r.id);
};

export const getGrupos = async (torneoId) => {
  const snap = await getDocs(collection(db, "tournaments", torneoId, "groups"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const actualizarGrupo = async (torneoId, grupoId, datos) => {
  await updateDoc(doc(db, "tournaments", torneoId, "groups", grupoId), grupoPublico(datos));
};

// ✅ Modificadas: almacenan el bracket como JSON string
export const guardarBracket = async (torneoId, bracket) => {
  const ref = doc(db, "tournaments", torneoId);
  // El bracket vive en el documento del torneo (lectura pública): solo la proyección pública de cada pareja
  const rondas = Array.isArray(bracket?.rondas)
    ? bracket.rondas.map((ronda) => (Array.isArray(ronda) ? ronda.map(partidoPublico) : ronda))
    : bracket?.rondas;
  await updateDoc(ref, { bracketJson: JSON.stringify({ ...bracket, rondas }) });
};

export const getBracket = async (torneoId) => {
  const snap = await getDoc(doc(db, "tournaments", torneoId));
  if (!snap.exists()) return null;
  const data = snap.data();
  if (data.bracketJson) return JSON.parse(data.bracketJson);
  return null;
};
// La inscripción y sus contactos se escriben en el mismo batch: las reglas aceptan el contacto solo si la
// inscripción que queda es del jugador que lo escribe.
export const crearSolicitudInscripcion = async (torneoId, solicitud) => {
  const { publica, contactos } = separarContactos(solicitud);
  const ref = doc(collection(db, "tournaments", torneoId, "inscripciones"));
  const batch = writeBatch(db);
  batch.set(ref, {
    ...publica,
    status: "esperando_companero",
    createdAt: serverTimestamp(),
  });
  batch.set(doc(db, "tournaments", torneoId, "contactosInscripciones", ref.id), {
    ...contactos,
    jugador1Uid: publica.jugador1Uid || null,
    createdAt: serverTimestamp(),
  });
  await batch.commit();
  return ref.id;
};

// Contactos de las inscripciones ({ [inscId]: { whatsapp1, whatsapp2, email1, email2 } }), solo organizador
export const getContactosInscripciones = async (torneoId) => {
  const snap = await getDocs(collection(db, "tournaments", torneoId, "contactosInscripciones"));
  const contactos = {};
  snap.docs.forEach((d) => {
    const data = d.data();
    const c = {};
    CAMPOS_CONTACTO.forEach((k) => {
      if (data[k]) c[k] = data[k];
    });
    contactos[d.id] = c;
  });
  return contactos;
};

export const getInscripciones = async (torneoId) => {
  const snap = await getDocs(
    collection(db, "tournaments", torneoId, "inscripciones"),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const actualizarInscripcion = async (torneoId, inscripcionId, datos) => {
  await updateDoc(
    doc(db, "tournaments", torneoId, "inscripciones", inscripcionId),
    datos,
  );
};

export const getInscripcionesByJugador = async (userId) => {
  const q = query(
    collection(db, "tournaments"),
    where("inscripcionAbierta", "==", true),
  );
  const snap = await getDocs(q);
  const resultados = [];

  for (const torneoDoc of snap.docs) {
    const inscSnap = await getDocs(
      collection(db, "tournaments", torneoDoc.id, "inscripciones"),
    );
    inscSnap.docs.forEach((d) => {
      const data = d.data();
      if (data.jugador1Uid === userId || data.jugador2Uid === userId) {
        resultados.push({
          id: d.id,
          torneoId: torneoDoc.id,
          torneoNombre: torneoDoc.data().nombre,
          ...data,
        });
      }
    });
  }

  return resultados;
};

export const getTorneosPublicos = async () => {
  const q = query(
    collection(db, "tournaments"),
    where("inscripcionAbierta", "==", true),
    orderBy("createdAt", "desc"),
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const getTodosLosTorneos = async () => {
  const q = query(collection(db, "tournaments"), orderBy("createdAt", "desc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};
// ========== RECLAMOS ==========

export const crearReclamo = async (torneoId, reclamo) => {
  const ref = await addDoc(
    collection(db, "tournaments", torneoId, "reclamos"),
    {
      ...reclamo,
      estado: "abierto",
      adheridos: [],
      descargo: null,
      decision: null,
      motivoDecision: null,
      creadoEn: new Date().toISOString(),
    },
  );
  return ref.id;
};

export const getReclamos = async (torneoId) => {
  const snap = await getDocs(
    collection(db, "tournaments", torneoId, "reclamos"),
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
};

export const adherirseAReclamo = async (torneoId, reclamoId, pareja) => {
  const ref = doc(db, "tournaments", torneoId, "reclamos", reclamoId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const data = snap.data();
  const yaAdherido = (data.adheridos || []).some((a) => a.id === pareja.id);
  if (yaAdherido) return;
  await updateDoc(ref, {
    adheridos: [...(data.adheridos || []), pareja],
  });
};

export const dejarDescargo = async (torneoId, reclamoId, descargo) => {
  await updateDoc(doc(db, "tournaments", torneoId, "reclamos", reclamoId), {
    descargo,
  });
};

export const resolverReclamo = async (
  torneoId,
  reclamoId,
  decision,
  motivoDecision,
) => {
  await updateDoc(doc(db, "tournaments", torneoId, "reclamos", reclamoId), {
    estado: "resuelto",
    decision,
    motivoDecision,
    resueltaEn: new Date().toISOString(),
  });
};

// ========== CATEGORÍAS ==========
// Los puntos, bonus y ascensos los otorgan las Cloud Functions (functions/puntos.js) al cargar
// resultados; el cliente solo valida en qué categoría puede inscribirse un jugador.

const CATEGORIAS_ORDEN = ["8va", "7ma", "6ta", "5ta", "4ta", "3era", "2da", "1era", "Libre"];

export function puedeInscribirse(categoriaJugador, categoriaTorneo) {
  const idxJugador = CATEGORIAS_ORDEN.indexOf(categoriaJugador);
  const idxTorneo = CATEGORIAS_ORDEN.indexOf(categoriaTorneo);
  if (idxJugador === -1 || idxTorneo === -1) return true;
  // No puede inscribirse en categoría menor
  return idxTorneo >= idxJugador;
}

// ========== VINCULACIÓN DE JUGADORES ==========

// Devuelve "ok" (vinculado), "ya_vinculado" (ese lugar ya es de este uid),
// "ocupado" (otra cuenta ya ocupó el lugar) o "no_existe".
export const vincularJugadorAPareja = async (torneoId, parejaId, posicion, uid) => {
  const ref = doc(db, "tournaments", torneoId, "pairs", parejaId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return "no_existe";
  const campo = Number(posicion) === 2 ? "jugador2Uid" : "jugador1Uid";
  const actual = snap.data()[campo] || null;
  if (actual && actual !== uid) return "ocupado";
  if (actual === uid) return "ya_vinculado";
  await updateDoc(ref, { [campo]: uid });
  return "ok";
};

export const getParejaById = async (torneoId, parejaId) => {
  const snap = await getDoc(doc(db, "tournaments", torneoId, "pairs", parejaId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
};

// ========== HISTORIAL DE PARTIDOS ==========

export const getHistorialPartidos = async (jugadorUid) => {
  const torneosSnap = await getDocs(collection(db, "tournaments"));
  const historial = [];

  for (const torneoDoc of torneosSnap.docs) {
    const torneoData = { id: torneoDoc.id, ...torneoDoc.data() };

    const parejasSnap = await getDocs(collection(db, "tournaments", torneoDoc.id, "pairs"));
    const miPareja = parejasSnap.docs.find((p) => {
      const d = p.data();
      return d.jugador1Uid === jugadorUid || d.jugador2Uid === jugadorUid;
    });

    if (!miPareja) continue;
    const parejaData = { id: miPareja.id, ...miPareja.data() };

    const gruposSnap = await getDocs(collection(db, "tournaments", torneoDoc.id, "groups"));
    for (const grupoDoc of gruposSnap.docs) {
      const grupo = grupoDoc.data();
      (grupo.partidos || []).forEach((partido) => {
        if (partido.pareja1?.id === parejaData.id || partido.pareja2?.id === parejaData.id) {
          if (partido.resultado) {
            const esPar1 = partido.pareja1?.id === parejaData.id;
            let setsGanados = 0, setsPerdidos = 0;
            partido.resultado.sets.forEach((s) => {
              let g1 = s.g1, g2 = s.g2;
              if (s.tb1 !== undefined || s.tb2 !== undefined) {
                if ((s.tb1 ?? 0) > (s.tb2 ?? 0)) g1++;
                else if ((s.tb2 ?? 0) > (s.tb1 ?? 0)) g2++;
              }
              if (esPar1) { if (g1 > g2) setsGanados++; else setsPerdidos++; }
              else { if (g2 > g1) setsGanados++; else setsPerdidos++; }
            });
            historial.push({
              torneoNombre: torneoData.nombre,
              torneoId: torneoData.id,
              fase: grupo.nombre || "Grupos",
              miPareja: parejaData.nombrePareja || `${parejaData.jugador1} / ${parejaData.jugador2}`,
              rival: esPar1
                ? (partido.pareja2?.nombrePareja || `${partido.pareja2?.jugador1} / ${partido.pareja2?.jugador2}`)
                : (partido.pareja1?.nombrePareja || `${partido.pareja1?.jugador1} / ${partido.pareja1?.jugador2}`),
              resultado: partido.resultado,
              gane: setsGanados > setsPerdidos,
              setsGanados,
              setsPerdidos,
              fecha: torneoData.fechaInicio || "",
            });
          }
        }
      });
    }
  }

  historial.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
  return historial;
};
