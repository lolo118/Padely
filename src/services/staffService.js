import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  addDoc,
  updateDoc,
  deleteDoc,
  writeBatch,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { INVITACION_DIAS, descuentoMaxDeRol, permisosDeRol } from "../utils/staff";

// Staff de un club (clubs/{c}/staff/{uid}) e invitaciones (clubs/{c}/invitaciones/{id}).
// La pertenencia se busca al entrar con una consulta de grupo por uid (sin espejo en users/{uid}: ese documento lo
// edita el propio usuario y sería falsificable). La consulta SIEMPRE lleva where("uid", "==", uid): es lo que la
// regla de lectura del grupo exige.

const staffRef = (clubId, uid) => doc(db, "clubs", clubId, "staff", uid);
const invitacionRef = (clubId, invId) => doc(db, "clubs", clubId, "invitaciones", invId);

// Clubes donde el usuario es staff ACTIVO: [{ clubId, uid, rol, permisos, descuentoMax, nombre, activo }]
export const getStaffDe = async (uid) => {
  if (!uid) return [];
  const snap = await getDocs(query(collectionGroup(db, "staff"), where("uid", "==", uid)));
  return snap.docs
    .map((d) => ({ id: d.id, clubId: d.ref.parent.parent.id, ...d.data() }))
    .filter((s) => s.activo === true)
    .map((s) => ({
      clubId: s.clubId,
      uid: s.uid,
      rol: s.rol,
      permisos: Array.isArray(s.permisos) ? s.permisos : [],
      descuentoMax: Number(s.descuentoMax) || 0,
      nombre: s.nombre || "",
      activo: true,
    }));
};

// Todo el equipo del club (activos e inactivos), por nombre
export const getStaffDelClub = async (clubId) => {
  const snap = await getDocs(collection(db, "clubs", clubId, "staff"));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es"));
};

// Cambios que el club puede hacer sobre un miembro (las reglas solo dejan estas claves)
export const actualizarStaff = async (clubId, uid, datos) => {
  const permitidos = {};
  ["rol", "permisos", "descuentoMax", "activo", "nombre"].forEach((k) => {
    if (datos[k] !== undefined) permitidos[k] = datos[k];
  });
  await updateDoc(staffRef(clubId, uid), { ...permitidos, actualizadoEn: serverTimestamp() });
};

// Cambiar el rol vuelve los permisos y el descuento al preset del rol
export const cambiarRolStaff = (clubId, uid, rol) =>
  actualizarStaff(clubId, uid, { rol, permisos: permisosDeRol(rol), descuentoMax: descuentoMaxDeRol(rol) });

export const quitarStaff = async (clubId, uid) => {
  await deleteDoc(staffRef(clubId, uid));
};

// ----- Invitaciones -----

export const getInvitacionesPendientes = async (clubId) => {
  const snap = await getDocs(query(collection(db, "clubs", clubId, "invitaciones"), where("estado", "==", "pendiente")));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.creadoEn?.toMillis?.() || 0) - (a.creadoEn?.toMillis?.() || 0));
};

export const getInvitacion = async (clubId, invId) => {
  const snap = await getDoc(invitacionRef(clubId, invId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
};

// Crea la invitación con el preset del rol; vence a los INVITACION_DIAS días. Devuelve el id.
export const crearInvitacion = async (clubId, { email, nombre, rol, creadoPor }) => {
  const ref = await addDoc(collection(db, "clubs", clubId, "invitaciones"), {
    email: String(email || "").trim().toLowerCase(),
    nombre: String(nombre || "").trim(),
    rol,
    permisos: permisosDeRol(rol),
    descuentoMax: descuentoMaxDeRol(rol),
    estado: "pendiente",
    creadoPor,
    creadoEn: serverTimestamp(),
    vence: Timestamp.fromMillis(Date.now() + INVITACION_DIAS * 24 * 60 * 60 * 1000),
  });
  return ref.id;
};

export const cancelarInvitacion = async (clubId, invId) => {
  await updateDoc(invitacionRef(clubId, invId), { estado: "cancelada" });
};

// "vencida" cuando pasó `vence`; el estado guardado manda en los demás casos
export const estadoDeInvitacion = (inv) => {
  if (!inv) return "no_existe";
  if (inv.estado !== "pendiente") return inv.estado;
  const vence = inv.vence?.toMillis ? inv.vence.toMillis() : inv.vence?.seconds ? inv.vence.seconds * 1000 : null;
  if (vence !== null && vence <= Date.now()) return "vencida";
  return "pendiente";
};

// El invitado acepta: en un solo batch crea su documento de staff (con los datos de la invitación) y marca la
// invitación como aceptada. Las reglas comprueban que la invitación esté pendiente, no vencida y sea para su email.
export const aceptarInvitacion = async (clubId, inv, { uid, nombre, email }) => {
  const batch = writeBatch(db);
  batch.set(staffRef(clubId, uid), {
    uid,
    nombre: nombre || inv.nombre || "",
    email: String(email || inv.email || "").trim().toLowerCase(),
    rol: inv.rol,
    permisos: Array.isArray(inv.permisos) ? inv.permisos : permisosDeRol(inv.rol),
    descuentoMax: Number.isFinite(Number(inv.descuentoMax)) ? Number(inv.descuentoMax) : descuentoMaxDeRol(inv.rol),
    activo: true,
    invitacionId: inv.id,
    invitadoPor: inv.creadoPor || null,
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  });
  batch.update(invitacionRef(clubId, inv.id), { estado: "aceptada", uid, aceptadaEn: serverTimestamp() });
  await batch.commit();
};
