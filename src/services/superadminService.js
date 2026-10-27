import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  getCountFromServer,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
  where,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../lib/firebase";
import { getTodayLocal } from "../utils/formatDate";

// Panel de super-admin (Sebastián). Quién es super-admin lo dice superadmins/{uid}, que se crea a mano en la
// consola: las reglas no dejan escribirlo desde ningún cliente. Todas estas lecturas y escrituras las permiten las
// reglas solo a un super-admin (superAdmin()).

export const CAMPOS_SUSPENSION = ["suspendido", "suspendidoMotivo", "suspendidoEn", "suspendidoPor"];

// true si la cuenta tiene superadmins/{uid}; false ante cualquier error (también permission-denied)
export const esSuperAdminUid = async (uid) => {
  if (!uid) return false;
  try {
    const snap = await getDoc(doc(db, "superadmins", uid));
    return snap.exists();
  } catch {
    return false;
  }
};

const contar = async (q) => {
  try {
    return (await getCountFromServer(q)).data().count;
  } catch (err) {
    console.error("Error contando:", err);
    return null;
  }
};

// Números de la plataforma (null en un número que no se pudo contar)
export const getResumenPlataforma = async () => {
  const hoy = getTodayLocal();
  const [usuarios, clubes, clubesSuspendidos, organizadores, organizadoresSuspendidos, torneos, reservas, reservasDesdeHoy] =
    await Promise.all([
      contar(collection(db, "users")),
      contar(collection(db, "clubs")),
      contar(query(collection(db, "clubs"), where("suspendido", "==", true))),
      contar(collection(db, "organizers")),
      contar(query(collection(db, "organizers"), where("suspendido", "==", true))),
      contar(collection(db, "tournaments")),
      contar(collectionGroup(db, "reservas")),
      contar(query(collectionGroup(db, "reservas"), where("fecha", ">=", hoy))),
    ]);
  const resta = (total, susp) => (total === null || susp === null ? null : total - susp);
  return {
    usuarios,
    clubes,
    clubesActivos: resta(clubes, clubesSuspendidos),
    clubesSuspendidos,
    organizadores,
    organizadoresActivos: resta(organizadores, organizadoresSuspendidos),
    organizadoresSuspendidos,
    torneos,
    reservas,
    reservasDesdeHoy,
  };
};

const usuarioDeDoc = (d) => ({ id: d.id, uid: d.id, ...d.data() });

// Los N usuarios más nuevos (los que no tienen createdAt quedan fuera de este orden)
export const getUltimosUsuarios = async (n = 10) => {
  const snap = await getDocs(query(collection(db, "users"), orderBy("createdAt", "desc"), limit(n)));
  return snap.docs.map(usuarioDeDoc);
};

// Una página de usuarios por fecha de alta: { usuarios, cursor } (cursor = último doc, para "Cargar más")
export const getUsuariosPagina = async (cursor = null, tamaño = 25) => {
  const base = [collection(db, "users"), orderBy("createdAt", "desc")];
  const q = cursor ? query(...base, startAfter(cursor), limit(tamaño)) : query(...base, limit(tamaño));
  const snap = await getDocs(q);
  return { usuarios: snap.docs.map(usuarioDeDoc), cursor: snap.docs[snap.docs.length - 1] || null, hayMas: snap.docs.length === tamaño };
};

// Búsqueda exacta por email (el email se guarda como se tipeó al registrarse: se prueba en minúsculas y tal cual)
export const buscarUsuarioPorEmail = async (email) => {
  const tal = String(email || "").trim();
  const min = tal.toLowerCase();
  if (!min) return [];
  const valores = [...new Set([min, tal])];
  const snap = await getDocs(query(collection(db, "users"), where("email", "in", valores)));
  return snap.docs.map(usuarioDeDoc);
};

export const getUsuario = async (uid) => {
  if (!uid) return null;
  try {
    const snap = await getDoc(doc(db, "users", uid));
    return snap.exists() ? usuarioDeDoc(snap) : null;
  } catch {
    return null;
  }
};

// Cambia el rol de una cuenta (corrige registros mal hechos): un solo rol, jugador | club | organizador.
// No crea ni borra el club o la entidad organizadora.
export const cambiarRolUsuario = async (uid, rol) => {
  if (!["jugador", "club", "organizador"].includes(rol)) throw new Error("Rol inválido");
  await updateDoc(doc(db, "users", uid), { role: [rol] });
};

// Vínculos de una cuenta: dueño de club, organizador, staff (con el nombre del club)
export const getVinculosDeUsuario = async (uid) => {
  const [clubesSnap, orgSnap, staffSnap] = await Promise.all([
    getDocs(query(collection(db, "clubs"), where("ownerUid", "==", uid))).catch(() => null),
    getDocs(query(collection(db, "organizers"), where("ownerUid", "==", uid))).catch(() => null),
    getDocs(query(collectionGroup(db, "staff"), where("uid", "==", uid))).catch(() => null),
  ]);
  const staff = await Promise.all(
    (staffSnap?.docs || []).map(async (d) => {
      const clubId = d.ref.parent.parent.id;
      let clubNombre = "";
      try {
        const c = await getDoc(doc(db, "clubs", clubId));
        clubNombre = c.exists() ? c.data().nombre || "" : "";
      } catch {
        // sin nombre
      }
      return { clubId, clubNombre, rol: d.data().rol, activo: d.data().activo === true };
    }),
  );
  return {
    clubes: (clubesSnap?.docs || []).map((d) => ({ id: d.id, nombre: d.data().nombre || "" })),
    organizadores: (orgSnap?.docs || []).map((d) => ({ id: d.id, nombre: d.data().nombre || "" })),
    staff,
  };
};

// Todos los clubes con su dueño (email), canchas y staff contados
export const getClubesAdmin = async () => {
  const snap = await getDocs(collection(db, "clubs"));
  return Promise.all(
    snap.docs.map(async (d) => {
      const data = d.data();
      const [dueño, canchas, staff] = await Promise.all([
        getUsuario(data.ownerUid),
        contar(collection(db, "clubs", d.id, "canchas")),
        contar(collection(db, "clubs", d.id, "staff")),
      ]);
      return { id: d.id, ...data, dueñoEmail: dueño?.email || "", canchasCount: canchas, staffCount: staff };
    }),
  );
};

// Todas las entidades organizadoras con su dueño (email) y sus torneos contados
export const getOrganizadoresAdmin = async () => {
  const snap = await getDocs(collection(db, "organizers"));
  return Promise.all(
    snap.docs.map(async (d) => {
      const data = d.data();
      const [dueño, torneos] = await Promise.all([
        getUsuario(data.ownerUid),
        data.ownerUid ? contar(query(collection(db, "tournaments"), where("organizerId", "==", data.ownerUid))) : 0,
      ]);
      return { id: d.id, ...data, dueñoEmail: dueño?.email || "", torneosCount: torneos };
    }),
  );
};

// Suspender o reactivar un club ("clubs") o una entidad organizadora ("organizers"): solo los cuatro campos
export const suspenderEntidad = async (coleccion, id, { motivo = "", uid }) => {
  await updateDoc(doc(db, coleccion, id), {
    suspendido: true,
    suspendidoMotivo: String(motivo || "").trim(),
    suspendidoEn: serverTimestamp(),
    suspendidoPor: uid,
  });
};

export const reactivarEntidad = async (coleccion, id, { uid }) => {
  await updateDoc(doc(db, coleccion, id), {
    suspendido: false,
    suspendidoMotivo: "",
    suspendidoEn: null,
    suspendidoPor: uid,
  });
};

// P3-10: completa users/{uid}.organizerId en las cuentas de las entidades existentes (para bloquear torneos de una
// entidad suspendida) → { vinculadas }
export const vincularOrganizadores = async () => (await httpsCallable(functions, "vincularOrganizadores")({})).data;
