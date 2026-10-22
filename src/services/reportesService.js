import { collection, doc, getDoc, getDocs, limit, onSnapshot, orderBy, query, Timestamp, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../lib/firebase";

// Reportes del bar: rollups diarios (clubs/{c}/reportesDiarios/{fecha}, que escriben las Functions), alertas de
// stock, y el callable que reconstruye un día. Nada de esto se escribe desde el cliente.

const col = (clubId, nombre) => collection(db, "clubs", clubId, nombre);
const conId = (d) => ({ id: d.id, ...d.data() });

// Rollups de un rango de fechas (inclusive), ordenados por fecha
export const getReportesDiarios = async (clubId, desde, hasta) => {
  const snap = await getDocs(query(col(clubId, "reportesDiarios"), where("fecha", ">=", desde), where("fecha", "<=", hasta), orderBy("fecha", "asc")));
  return snap.docs.map(conId);
};

export const escucharReporteDelDia = (clubId, fecha, onDatos, onError) =>
  onSnapshot(doc(db, "clubs", clubId, "reportesDiarios", fecha), (snap) => onDatos(snap.exists() ? conId(snap) : null), onError);

// Alertas de stock (productos en o bajo el mínimo)
export const escucharAlertasStock = (clubId, onDatos, onError) => onSnapshot(col(clubId, "alertasStock"), (snap) => onDatos(snap.docs.map(conId)), onError);
export const getAlertasStock = async (clubId) => (await getDocs(col(clubId, "alertasStock"))).docs.map(conId);

// Reconstruye el reporte de un día desde ventas y cajas (dueño o verReportes; lo verifica la Function)
export const recalcularReporte = async (clubId, fecha) => {
  const fn = httpsCallable(functions, "recalcularReporte");
  const res = await fn({ clubId, fecha });
  return res.data;
};

// Reconstruye el catálogo público y las alertas de stock de todos los productos (dueño o editarProductos)
export const reconstruirCatalogo = async (clubId) => {
  const fn = httpsCallable(functions, "reconstruirCatalogo");
  const res = await fn({ clubId });
  return res.data;
};

// Ventas de un rango de fechas locales (para la exportación), con tope
export const getVentasEntre = async (clubId, desde, hasta, { max = 5000 } = {}) => {
  const [y1, m1, d1] = desde.split("-").map(Number);
  const [y2, m2, d2] = hasta.split("-").map(Number);
  const inicio = Timestamp.fromDate(new Date(y1, m1 - 1, d1, 0, 0, 0));
  const fin = Timestamp.fromDate(new Date(y2, m2 - 1, d2 + 1, 0, 0, 0));
  const snap = await getDocs(query(col(clubId, "ventas"), where("creadoEn", ">=", inicio), where("creadoEn", "<", fin), orderBy("creadoEn", "asc"), limit(max)));
  return { ventas: snap.docs.map(conId), truncado: snap.size >= max };
};

export const getCaja = async (clubId, cajaId) => {
  const snap = await getDoc(doc(db, "clubs", clubId, "cajas", cajaId));
  return snap.exists() ? conId(snap) : null;
};

// Catálogo público (sin costos ni cantidades): lo leen jugadores y sesiones anónimas
export const escucharCatalogo = (clubId, onDatos, onError) =>
  onSnapshot(
    col(clubId, "catalogo"),
    (snap) => {
      const productos = [];
      let categorias = [];
      snap.docs.forEach((d) => {
        if (d.id === "_categorias") categorias = d.data().lista || [];
        else productos.push(conId(d));
      });
      onDatos({ productos, categorias });
    },
    onError,
  );

// Ticket digital público
export const getTicketPublico = async (clubId, numero) => {
  const snap = await getDoc(doc(db, "clubs", clubId, "ticketsPublicos", numero));
  return snap.exists() ? conId(snap) : null;
};
