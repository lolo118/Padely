import { addDoc, collection, deleteDoc, doc, onSnapshot, serverTimestamp, updateDoc, writeBatch } from "firebase/firestore";
import { db } from "../lib/firebase";
import { ordenarMesas } from "../utils/mesas";

// Mesas del bar (clubs/{c}/mesas/{mesaId}): { nombre, zona, capacidad, orden, activa, cuentaAbiertaId, creadoPor,
// creadoEn, actualizadoEn }. Las configura quien edita productos (como las categorías). La ocupación se deriva de
// las cuentas abiertas (cuenta.mesaId); cuentaAbiertaId lo escriben solo las transacciones de cuentasService
// (abrir / mover una cuenta) como candado. Abrir y mover cuentas: cuentasService.abrirCuentaDeMesa / moverCuentaAMesa.

const col = (clubId) => collection(db, "clubs", clubId, "mesas");
const ref = (clubId, id) => doc(db, "clubs", clubId, "mesas", id);
const conId = (d) => ({ id: d.id, ...d.data() });

export const escucharMesas = (clubId, onDatos, onError) => onSnapshot(col(clubId), (snap) => onDatos(ordenarMesas(snap.docs.map(conId))), onError);

const nueva = (datos, { uid, orden }) => ({
  nombre: datos.nombre,
  zona: datos.zona || null,
  capacidad: datos.capacidad ?? null,
  orden: Number(orden) || 0,
  activa: true,
  cuentaAbiertaId: null,
  creadoPor: uid || null,
  creadoEn: serverTimestamp(),
  actualizadoEn: serverTimestamp(),
});

// datos: { nombre, zona, capacidad } ya validados (utils/mesas validarMesa)
export const crearMesa = async (clubId, datos, { uid, orden = 0 }) => (await addDoc(col(clubId), nueva(datos, { uid, orden }))).id;

// Varias de una vez ("Mesa 1" a "Mesa 12"), con la misma zona
export const crearMesas = async (clubId, nombres, { uid, zona = null, ordenDesde = 0 }) => {
  const batch = writeBatch(db);
  nombres.forEach((nombre, i) => batch.set(doc(col(clubId)), nueva({ nombre, zona, capacidad: null }, { uid, orden: ordenDesde + i })));
  await batch.commit();
  return nombres.length;
};

export const actualizarMesa = (clubId, id, datos) =>
  updateDoc(ref(clubId, id), {
    ...(datos.nombre !== undefined ? { nombre: datos.nombre } : {}),
    ...(datos.zona !== undefined ? { zona: datos.zona || null } : {}),
    ...(datos.capacidad !== undefined ? { capacidad: datos.capacidad ?? null } : {}),
    ...(datos.orden !== undefined ? { orden: Number(datos.orden) || 0 } : {}),
    ...(datos.activa !== undefined ? { activa: !!datos.activa } : {}),
    actualizadoEn: serverTimestamp(),
  });

// La pantalla no deja borrar una mesa ocupada; las cuentas guardan mesaNombre, así que el historial no se pierde
export const eliminarMesa = (clubId, id) => deleteDoc(ref(clubId, id));
