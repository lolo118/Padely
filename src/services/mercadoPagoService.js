import { collection, doc, getDocs, onSnapshot, orderBy, query, Timestamp, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../lib/firebase";

// Mercado Pago (P3-8): todo pasa por Functions (los tokens del club viven en clubs/{c}/privado/mercadopago, que ningún
// cliente lee). Acá, los wrappers de las callables y las lecturas de clubs/{c}/pagosMp que las reglas permiten
// (staff que cobra o el pagador).

const llamar = (nombre) => async (datos) => (await httpsCallable(functions, nombre)(datos)).data;

// Dueño: { clubId } → { url } (la autorización de MP; vuelve a /admin/configuracion?mp=ok|error)
export const mpConectarUrl = llamar("mpConectarUrl");
// Dueño: { clubId }
export const mpDesconectar = llamar("mpDesconectar");
// Super-admin: { clubId, pct }
export const mpSetComision = llamar("mpSetComision");
// { clubId, tipo: "parte"|"seña"|"mostrador", grupoId?, participanteId?, participanteIds?, lineaIds?, reservaId? }
//   → { pagoMpId, initPoint, monto, venceEn, reutilizado }
export const mpCrearPago = llamar("mpCrearPago");
// Staff: { clubId, pagoMpId } → devuelve el excedente de un pago aprobado de más
export const mpDevolverExcedente = llamar("mpDevolverExcedente");

export const escucharPagoMp = (clubId, pagoMpId, onDatos, onError) =>
  onSnapshot(doc(db, "clubs", clubId, "pagosMp", pagoMpId), (snap) => onDatos(snap.exists() ? { id: snap.id, ...snap.data() } : null), onError);

// Pagos MP de una cuenta (staff): los pendientes y los aprobados, el más nuevo primero
export const escucharPagosMpDeCuenta = (clubId, grupoId, onDatos, onError) =>
  onSnapshot(query(collection(db, "clubs", clubId, "pagosMp"), where("grupoId", "==", grupoId), orderBy("creadoEn", "desc")), (snap) => onDatos(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), onError);

// Ventas online (dispositivo "Online", cajaId null) entre dos instantes: la línea informativa del cierre de caja
export const getVentasMpEntre = async (clubId, desde, hasta) => {
  const a = desde instanceof Date ? Timestamp.fromDate(desde) : desde;
  const b = hasta instanceof Date ? Timestamp.fromDate(hasta) : hasta || Timestamp.now();
  const snap = await getDocs(query(collection(db, "clubs", clubId, "ventas"), where("dispositivo", "==", "Online"), where("creadoEn", ">=", a), where("creadoEn", "<=", b)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((v) => v.estado !== "anulada");
};

export const clubConectadoMp = (club) => !!club?.mercadoPago?.conectado;
export const MEDIO_MP = "mercadopago";
