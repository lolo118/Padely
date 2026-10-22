import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { registrarEscrituraPendiente } from "../utils/conexion";
import { TAMANO_BLOQUE, bloqueAgotado, bloqueNecesitaReserva, siguienteNumero, unirBloques } from "../utils/ventas";

// Ventas del bar (clubs/{c}/ventas/{numero}). Una venta es inmutable: se crea con estado "ok" y a lo sumo pasa a
// "anulada" (con motivo). El stock y la caja los mueven las Cloud Functions (onVentaCreated / onVentaUpdated)
// escribiendo movimientos "venta" / "anulacion"; el cliente nunca los escribe ni toca `aplicado`.
//
// NUMERACIÓN POR DISPOSITIVO (funciona sin internet): cada navegador recibe una vez un código ("D1", "D2"…) desde
// clubs/{c}/contadoresDispositivos/_asignacion y reserva bloques de TAMANO_BLOQUE números en
// clubs/{c}/contadoresDispositivos/{codigo}. El bloque vive en localStorage; el número de ticket ES el id del
// documento de la venta ("D1-000123"), así una escritura reintentada nunca duplica una venta.

const col = (clubId, nombre) => collection(db, "clubs", clubId, nombre);
const ref = (clubId, nombre, id) => doc(db, "clubs", clubId, nombre, id);
const contadorRef = (clubId, codigo) => ref(clubId, "contadoresDispositivos", codigo);
const conId = (d) => ({ id: d.id, ...d.data() });

const CLAVE_CODIGO = (clubId) => `padely-codigo-dispositivo-${clubId}`;
const CLAVE_BLOQUE = (clubId) => `padely-bloque-${clubId}`;

const leer = (clave) => {
  try {
    const v = localStorage.getItem(clave);
    return v ? JSON.parse(v) : null;
  } catch {
    return null;
  }
};
const escribir = (clave, valor) => {
  try {
    if (valor === null || valor === undefined) localStorage.removeItem(clave);
    else localStorage.setItem(clave, JSON.stringify(valor));
  } catch {
    /* sin localStorage */
  }
};

export class SinNumerosError extends Error {
  constructor() {
    super("Sin números de ticket: conectate a internet un momento");
    this.name = "SinNumerosError";
  }
}

// ----- Código de dispositivo y bloques -----

export const codigoDispositivoGuardado = (clubId) => {
  const v = leer(CLAVE_CODIGO(clubId));
  return typeof v === "string" && v ? v : null;
};
export const bloqueGuardado = (clubId) => {
  const b = leer(CLAVE_BLOQUE(clubId));
  return b && typeof b === "object" && b.codigo ? b : null;
};
export const guardarBloque = (clubId, bloque) => escribir(CLAVE_BLOQUE(clubId), bloque);

// El código de este navegador para este club; si no tiene, pide el siguiente ("D" + n) en una transacción
export const asegurarCodigoDispositivo = async (clubId, dispositivo, uid = null) => {
  const guardado = codigoDispositivoGuardado(clubId);
  if (guardado) return guardado;
  const asignacionRef = contadorRef(clubId, "_asignacion");
  const codigo = await runTransaction(db, async (tx) => {
    const snap = await tx.get(asignacionRef);
    const ultimo = Number(snap.exists() ? snap.data().ultimo : 0) || 0;
    const nuevo = `D${ultimo + 1}`;
    tx.set(asignacionRef, { ultimo: ultimo + 1, actualizadoEn: serverTimestamp() }, { merge: true });
    tx.set(contadorRef(clubId, nuevo), {
      codigo: nuevo,
      dispositivo: String(dispositivo || "").trim() || nuevo,
      desde: 0,
      hasta: 0,
      usado: 0,
      reservadoEn: serverTimestamp(),
      reservadoPor: uid,
      creadoEn: serverTimestamp(),
    });
    return nuevo;
  });
  escribir(CLAVE_CODIGO(clubId), codigo);
  return codigo;
};

// Reserva el próximo bloque de TAMANO_BLOQUE números del código y lo suma al bloque local. Devuelve el bloque local.
export const reservarBloque = async (clubId, codigo, dispositivo, uid = null) => {
  const nuevo = await runTransaction(db, async (tx) => {
    const r = contadorRef(clubId, codigo);
    const snap = await tx.get(r);
    const hasta = Number(snap.exists() ? snap.data().hasta : 0) || 0;
    const bloque = { codigo, desde: hasta + 1, hasta: hasta + TAMANO_BLOQUE };
    tx.set(
      r,
      {
        codigo,
        dispositivo: String(dispositivo || "").trim() || codigo,
        desde: bloque.desde,
        hasta: bloque.hasta,
        usado: Number(snap.exists() ? snap.data().usado : 0) || 0,
        reservadoEn: serverTimestamp(),
        reservadoPor: uid,
      },
      { merge: true },
    );
    return bloque;
  });
  const unido = unirBloques(bloqueGuardado(clubId), nuevo);
  guardarBloque(clubId, unido);
  return unido;
};

// Deja la numeración lista: código asignado y bloque con números. Con internet pide lo que falte; sin internet
// devuelve lo que haya (puede ser null). Nunca lanza: los errores se registran y se sigue con lo local.
export const prepararNumeracion = async (clubId, { dispositivo, uid, online = true } = {}) => {
  let bloque = bloqueGuardado(clubId);
  if (!online) return bloque;
  try {
    const codigo = await asegurarCodigoDispositivo(clubId, dispositivo, uid);
    if (bloqueNecesitaReserva(bloque) || bloque.codigo !== codigo) bloque = await reservarBloque(clubId, codigo, dispositivo, uid);
  } catch (err) {
    console.error("No se pudo preparar la numeración de tickets:", err);
  }
  return bloque;
};

// Toma el siguiente número del bloque local (y lo avanza). Sin números → SinNumerosError.
export const tomarNumero = (clubId) => {
  const bloque = bloqueGuardado(clubId);
  if (bloqueAgotado(bloque)) throw new SinNumerosError();
  const s = siguienteNumero(bloque);
  guardarBloque(clubId, s.bloque);
  return { numero: s.numero, n: s.n, codigo: bloque.codigo, bloque: s.bloque };
};

// Vista del estado de la numeración para la pantalla
export const estadoNumeracion = (clubId) => {
  const bloque = bloqueGuardado(clubId);
  const s = bloque ? siguienteNumero(bloque) : null;
  return { codigo: codigoDispositivoGuardado(clubId), bloque, proximo: s ? s.numero : null, agotado: bloqueAgotado(bloque) };
};

// ----- Ventas -----

// Crea la venta con el número como id. NO espera la confirmación del servidor: con la persistencia local la
// escritura queda en cola y Firestore la sube cuando puede. Devuelve el número; la promesa del ack se registra
// como pendiente de sincronizar (pill "Sin conexión · N por sincronizar").
export const crearVenta = (clubId, venta) => {
  const numero = venta.numero;
  const datos = {
    ...venta,
    cuentaId: venta.cuentaId ?? null,
    cliente: venta.cliente ?? null,
    estado: "ok",
    anulacion: null,
    aplicado: false,
    fiscal: null,
    creadoEn: serverTimestamp(),
    actualizadoEn: serverTimestamp(),
  };
  const ack = setDoc(ref(clubId, "ventas", numero), datos);
  registrarEscrituraPendiente(numero, ack);
  // "usado" del contador: el último número emitido por este dispositivo (informativo; también queda en cola sin red)
  if (venta.codigoDispositivo && Number.isFinite(venta.secuencia)) {
    setDoc(contadorRef(clubId, venta.codigoDispositivo), { usado: venta.secuencia, dispositivo: venta.dispositivo || venta.codigoDispositivo }, { merge: true }).catch(
      (err) => console.error("No se pudo actualizar el contador del dispositivo:", err),
    );
  }
  return numero;
};

export const escucharVentasDeCaja = (clubId, cajaId, onDatos, onError) =>
  onSnapshot(
    query(col(clubId, "ventas"), where("cajaId", "==", cajaId), orderBy("creadoEn", "desc")),
    (snap) => onDatos(snap.docs.map((d) => ({ ...conId(d), pendienteDeSync: d.metadata.hasPendingWrites }))),
    onError,
  );

export const getVenta = async (clubId, numero) => {
  const snap = await getDoc(ref(clubId, "ventas", numero));
  return snap.exists() ? conId(snap) : null;
};

// Anula una venta (una sola vez; la caja tiene que seguir abierta: lo exigen las reglas)
export const anularVenta = async (clubId, numero, { motivo, uid, nombre }) => {
  const texto = String(motivo || "").trim();
  if (!texto) throw new Error("La anulación lleva motivo");
  await updateDoc(ref(clubId, "ventas", numero), {
    estado: "anulada",
    anulacion: { por: uid, porNombre: String(nombre || "").trim() || null, motivo: texto, en: serverTimestamp() },
    actualizadoEn: serverTimestamp(),
  });
};

// Ventas de un día local ("YYYY-MM-DD"), la más reciente primero (para reportes; P3-6 lo amplía)
export const getVentasDelDia = async (clubId, fechaStr, { max = 500 } = {}) => {
  const [y, m, d] = String(fechaStr).split("-").map(Number);
  const desde = Timestamp.fromDate(new Date(y, m - 1, d, 0, 0, 0));
  const hasta = Timestamp.fromDate(new Date(y, m - 1, d + 1, 0, 0, 0));
  const snap = await getDocs(
    query(col(clubId, "ventas"), where("creadoEn", ">=", desde), where("creadoEn", "<", hasta), orderBy("creadoEn", "desc"), limit(max)),
  );
  return snap.docs.map(conId);
};

export { serverTimestamp };
