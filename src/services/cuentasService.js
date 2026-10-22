import {
  arrayUnion,
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { agruparReservas, normalizarReserva } from "../utils/reservas";
import { subtotalPedido } from "../utils/pedidos";
import { getTodayLocal } from "../utils/formatDate";
import { crearVentaEsperando } from "./ventasService";
import {
  calcularTotalesCuenta,
  cuentaDesdeReserva,
  cuentaEditable,
  divisionCompleta,
  lineasDeVentaParaParte,
  lineasDeVentaParaTodo,
  nuevaLinea,
  totalDeLineas,
} from "../utils/cuentas";

// Cuenta del turno (clubs/{c}/cuentas/{grupoId}): la cancha, la seña y los consumos de una reserva. Se crea desde el
// POS al cargar el primer consumo (id = grupoId de la reserva: una reserva, a lo sumo una cuenta) y se cierra
// convirtiéndose en ventas normales (una por parte). Hasta el cierre NO hay movimientos de stock ni de caja:
// la caja la mueven las ventas por sus pagos y el stock lo mueve UNA vez la Function onCuentaUpdated.
// Las escrituras de la cuenta son transacciones (dos tablets pueden cargar la misma cuenta): necesitan conexión.

const col = (clubId, nombre) => collection(db, "clubs", clubId, nombre);
const ref = (clubId, id) => doc(db, "clubs", clubId, "cuentas", id);
const conId = (d) => ({ id: d.id, ...d.data() });

export class CuentaNoEditableError extends Error {
  constructor() {
    super("La cuenta ya tiene partes cobradas: no se puede cambiar");
    this.name = "CuentaNoEditableError";
  }
}

// ----- Lecturas -----

// Reservas confirmadas de hoy, agrupadas (una por grupoId), ordenadas por hora de inicio
export const escucharReservasDeHoy = (clubId, onDatos, onError) =>
  onSnapshot(
    query(col(clubId, "reservas"), where("status", "==", "confirmada"), where("fecha", "==", getTodayLocal())),
    (snap) => onDatos(agruparReservas(snap.docs.map((d) => normalizarReserva({ id: d.id, clubId, ...d.data() }))).filter((r) => r.tipo !== "torneo")),
    onError,
  );

export const escucharCuentasAbiertas = (clubId, onDatos, onError) =>
  onSnapshot(
    query(col(clubId, "cuentas"), where("estado", "==", "abierta"), orderBy("fecha", "asc"), orderBy("horaInicio", "asc")),
    (snap) => onDatos(snap.docs.map(conId)),
    onError,
  );

export const escucharCuenta = (clubId, id, onDatos, onError) => onSnapshot(ref(clubId, id), (snap) => onDatos(snap.exists() ? conId(snap) : null), onError);

export const getCuenta = async (clubId, id) => {
  const snap = await getDoc(ref(clubId, id));
  return snap.exists() ? conId(snap) : null;
};

export const getCuentasCerradas = async (clubId, { max = 50 } = {}) => {
  const snap = await getDocs(query(col(clubId, "cuentas"), where("estado", "in", ["cerrada", "anulada"]), orderBy("cerradaEn", "desc"), limit(max)));
  return snap.docs.map(conId);
};

// Jugador: sus cuentas abiertas en cualquier club (grupo de colecciones; la regla exige el where por jugadorUid)
export const escucharMisCuentasAbiertas = (uid, onDatos, onError) =>
  onSnapshot(
    query(collectionGroup(db, "cuentas"), where("jugadorUid", "==", uid), where("estado", "==", "abierta")),
    (snap) => onDatos(snap.docs.map((d) => ({ ...conId(d), clubId: d.ref.parent.parent.id }))),
    onError,
  );

// ----- Escrituras (transacciones) -----

const base = (cuenta) => ({ ...cuenta });

export class CuentaCerradaError extends Error {
  constructor() {
    super("La cuenta de ese turno ya está cerrada");
    this.name = "CuentaCerradaError";
  }
}

// Dentro de una transacción: la cuenta abierta del turno, lista para recibir líneas. Si no existe se crea con los
// datos de la reserva (si no vinieron, se leen de reservas/{grupoId}); si está anulada se REABRE (lo anterior queda
// en historial); si está cerrada se rechaza. Devuelve { ref, cuenta, nueva, reabierta }.
async function cuentaAbiertaEnTx(tx, clubId, grupoId, { uid, nombre, reserva = null }) {
  const r = ref(clubId, grupoId);
  const snap = await tx.get(r);
  if (snap.exists()) {
    const actual = conId(snap);
    if (actual.estado === "abierta") {
      if (!cuentaEditable(actual)) throw new CuentaNoEditableError();
      return { ref: r, cuenta: base(actual), nueva: false, reabierta: false };
    }
    if (actual.estado === "anulada") {
      const previo = { estado: "anulada", anulacion: actual.anulacion || null, items: actual.items || [], cerradaPor: actual.cerradaPor || null, cerradaEn: actual.cerradaEn || null, reabiertaPor: uid, reabiertaEn: Timestamp.now() };
      const cuenta = { ...base(actual), estado: "abierta", items: [], division: null, ventas: [], cerradaPor: null, cerradaEn: null, anulacion: null };
      cuenta.totales = calcularTotalesCuenta(cuenta);
      tx.update(r, {
        estado: "abierta",
        items: [],
        division: null,
        ventas: [],
        totales: cuenta.totales,
        cerradaPor: null,
        cerradaEn: null,
        anulacion: null,
        historial: arrayUnion(previo),
        abiertaPor: uid,
        abiertaPorNombre: nombre || null,
        abiertaEn: serverTimestamp(),
        actualizadoEn: serverTimestamp(),
      });
      return { ref: r, cuenta, nueva: false, reabierta: true };
    }
    throw new CuentaCerradaError();
  }
  let datosReserva = reserva;
  if (!datosReserva) {
    const rs = await tx.get(doc(db, "clubs", clubId, "reservas", grupoId));
    if (!rs.exists()) throw new Error("La reserva del turno no existe");
    datosReserva = normalizarReserva({ id: rs.id, ...rs.data() });
    if (datosReserva.status !== "confirmada") throw new Error("La reserva no está confirmada");
  }
  const cuenta = { ...cuentaDesdeReserva({ ...datosReserva, grupoId }), items: [] };
  cuenta.totales = calcularTotalesCuenta(cuenta);
  tx.set(r, {
    ...cuenta,
    abiertaPor: uid,
    abiertaPorNombre: nombre || null,
    abiertaEn: serverTimestamp(),
    cerradaPor: null,
    cerradaEn: null,
    actualizadoEn: serverTimestamp(),
  });
  return { ref: r, cuenta: { id: grupoId, ...cuenta }, nueva: true, reabierta: false };
}

// Suma líneas a la cuenta (ya abierta por cuentaAbiertaEnTx) y recalcula totales; una división sin cobrar se descarta
function sumarLineasEnTx(tx, r, cuenta, nuevas, { nueva }) {
  const items = [...(cuenta.items || []), ...nuevas];
  const totales = calcularTotalesCuenta({ ...cuenta, items });
  if (nueva) tx.update(r, { items, totales, actualizadoEn: serverTimestamp() });
  else tx.update(r, { items, division: null, totales, actualizadoEn: serverTimestamp() });
  return { ...cuenta, items, division: null, totales };
}

// Agrega líneas del POS a la cuenta de una reserva; si la cuenta no existe la crea con los datos de la reserva.
// Devuelve la cuenta resultante (sin timestamps del servidor resueltos).
export const agregarItemsACuenta = async (clubId, grupoId, items, { uid, nombre, reserva }) => {
  const ahora = Timestamp.now();
  const nuevas = (items || []).map((it) => nuevaLinea(it, { uid, nombre, ahora }));
  if (!nuevas.length) throw new Error("No hay líneas para agregar");
  return runTransaction(db, async (tx) => {
    const { ref: r, cuenta, nueva } = await cuentaAbiertaEnTx(tx, clubId, grupoId, { uid, nombre, reserva });
    return sumarLineasEnTx(tx, r, cuenta, nuevas, { nueva });
  });
};

// La barra acepta un pedido: sus items pasan a la cuenta del turno (que se crea o reabre si hace falta) y el pedido
// queda aceptado, con los lineaIds creados, en la misma transacción. Devuelve la cuenta resultante.
export const aceptarPedido = async (clubId, pedido, { uid, nombre }) =>
  runTransaction(db, async (tx) => {
    const pr = doc(db, "clubs", clubId, "pedidos", pedido.id);
    const ps = await tx.get(pr);
    if (!ps.exists()) throw new Error("El pedido ya no existe");
    const actual = ps.data();
    if (actual.estado !== "pendiente") throw new Error(`El pedido ya está ${actual.estado}`);
    const grupoId = actual.cuentaId || actual.reservaGrupoId;
    const { ref: r, cuenta, nueva } = await cuentaAbiertaEnTx(tx, clubId, grupoId, { uid, nombre });
    const ahora = Timestamp.now();
    const nuevas = (actual.items || []).map((it) => ({
      ...nuevaLinea({ productoId: it.productoId, nombre: it.nombre, precio: it.precio, cantidad: it.cantidad, descuento: 0, controlaStock: it.controlaStock !== false }, { uid, nombre, ahora }),
      pedidoId: pedido.id,
      pedidoPor: actual.nombre || null,
    }));
    if (!nuevas.length) throw new Error("El pedido no tiene items");
    const resultado = sumarLineasEnTx(tx, r, cuenta, nuevas, { nueva });
    tx.update(pr, {
      estado: "aceptado",
      "tiempos.aceptado": serverTimestamp(),
      atendidoPor: uid,
      atendidoPorNombre: String(nombre || "").trim() || null,
      lineaIds: nuevas.map((l) => l.lineaId),
      actualizadoEn: serverTimestamp(),
    });
    return { ...resultado, subtotalPedido: subtotalPedido(actual.items || []) };
  });

export const quitarItemDeCuenta = (clubId, grupoId, lineaId) =>
  runTransaction(db, async (tx) => {
    const r = ref(clubId, grupoId);
    const snap = await tx.get(r);
    if (!snap.exists()) throw new Error("La cuenta no existe");
    const actual = conId(snap);
    if (!cuentaEditable(actual)) throw new CuentaNoEditableError();
    const items = (actual.items || []).filter((it) => it.lineaId !== lineaId);
    const totales = calcularTotalesCuenta({ ...actual, items });
    tx.update(r, { items, division: null, totales, actualizadoEn: serverTimestamp() });
  });

export const setCobrarCancha = (clubId, grupoId, cobrar) =>
  runTransaction(db, async (tx) => {
    const r = ref(clubId, grupoId);
    const snap = await tx.get(r);
    if (!snap.exists()) throw new Error("La cuenta no existe");
    const actual = conId(snap);
    if (!cuentaEditable(actual)) throw new CuentaNoEditableError();
    const cancha = { ...(actual.cancha || {}), cobrar: !!cobrar };
    const totales = calcularTotalesCuenta({ ...actual, cancha });
    tx.update(r, { cancha, division: null, totales, actualizadoEn: serverTimestamp() });
  });

// Guarda la división (reemplaza la anterior; solo mientras ninguna parte esté cobrada)
export const guardarDivision = (clubId, grupoId, division) =>
  runTransaction(db, async (tx) => {
    const r = ref(clubId, grupoId);
    const snap = await tx.get(r);
    if (!snap.exists()) throw new Error("La cuenta no existe");
    const actual = conId(snap);
    if (!cuentaEditable(actual)) throw new CuentaNoEditableError();
    tx.update(r, { division: division || null, actualizadoEn: serverTimestamp() });
  });

// Venta que cierra (toda o en parte) una cuenta: cliente = a quién se le cobra, cuentaId = la cuenta
const ventaDeCuenta = ({ cuenta, lineas, calculo, cliente, ctx }) => ({
  numero: ctx.numero.numero,
  dispositivo: ctx.dispositivo,
  codigoDispositivo: ctx.numero.codigo,
  secuencia: ctx.numero.n,
  cajaId: ctx.cajaId,
  items: lineas,
  subtotal: totalDeLineas(lineas),
  descuento: null,
  descuentoTotal: 0,
  total: totalDeLineas(lineas),
  pagos: calculo.pagos,
  pagado: calculo.pagado,
  vuelto: calculo.vuelto,
  cuentaId: cuenta.id,
  cliente: { nombre: cliente || cuenta.nombreJugador || null },
  creadoPor: ctx.uid,
  creadoPorNombre: ctx.nombre || null,
});

// Cobra una parte: escribe la venta (y ESPERA el ack: las reglas exigen la cuenta abierta al crearla), marca la
// parte como pagada y, si era la última, cierra la cuenta en la misma transacción. ctx: { numero (de tomarNumero),
// dispositivo, cajaId, uid, nombre }. Devuelve { venta, cerrada }.
export const cobrarParte = async (clubId, cuenta, parteId, calculo, ctx) => {
  const parte = (cuenta.division?.partes || []).find((p) => p.parteId === parteId);
  if (!parte) throw new Error("La parte no existe");
  if (parte.ventaNumero) throw new Error("Esa parte ya está cobrada");
  const lineas = lineasDeVentaParaParte(cuenta, parte);
  const venta = ventaDeCuenta({ cuenta, lineas, calculo, cliente: parte.nombre, ctx });
  await crearVentaEsperando(clubId, venta);
  const cerrada = await runTransaction(db, async (tx) => {
    const r = ref(clubId, cuenta.id);
    const snap = await tx.get(r);
    if (!snap.exists()) throw new Error("La cuenta no existe");
    const actual = conId(snap);
    const partes = (actual.division?.partes || []).map((p) => (p.parteId === parteId ? { ...p, ventaNumero: venta.numero, pagadoEn: Timestamp.now() } : p));
    const division = { ...(actual.division || {}), partes };
    const completa = divisionCompleta({ division });
    const cambios = { division, ventas: arrayUnion(venta.numero), actualizadoEn: serverTimestamp() };
    if (completa && actual.estado === "abierta") {
      Object.assign(cambios, { estado: "cerrada", cerradaPor: ctx.uid, cerradaEn: serverTimestamp(), totales: calcularTotalesCuenta(actual) });
    }
    tx.update(r, cambios);
    return completa;
  });
  return { venta, cerrada };
};

// Cobra toda la cuenta en una venta y la cierra
export const cobrarTodo = async (clubId, cuenta, calculo, ctx) => {
  const lineas = lineasDeVentaParaTodo(cuenta);
  const venta = ventaDeCuenta({ cuenta, lineas, calculo, cliente: cuenta.nombreJugador, ctx });
  await crearVentaEsperando(clubId, venta);
  await runTransaction(db, async (tx) => {
    const r = ref(clubId, cuenta.id);
    const snap = await tx.get(r);
    if (!snap.exists()) throw new Error("La cuenta no existe");
    const actual = conId(snap);
    if (actual.estado !== "abierta") return;
    tx.update(r, {
      estado: "cerrada",
      cerradaPor: ctx.uid,
      cerradaEn: serverTimestamp(),
      ventas: arrayUnion(venta.numero),
      totales: calcularTotalesCuenta(actual),
      actualizadoEn: serverTimestamp(),
    });
  });
  return { venta, cerrada: true };
};

// Anula una cuenta abierta sin partes cobradas: los consumos se descartan (nunca movieron stock ni caja)
export const anularCuenta = async (clubId, cuenta, { motivo, uid, nombre }) => {
  const texto = String(motivo || "").trim();
  if (!texto) throw new Error("La anulación lleva motivo");
  await updateDoc(ref(clubId, cuenta.id), {
    estado: "anulada",
    cerradaPor: uid,
    cerradaEn: serverTimestamp(),
    anulacion: { por: uid, porNombre: String(nombre || "").trim() || null, motivo: texto },
    actualizadoEn: serverTimestamp(),
  });
};
