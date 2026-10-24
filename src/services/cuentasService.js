import {
  arrayRemove,
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
  canchaPagadaEnParte,
  cobroDe,
  cobroDeLineas,
  cobroRestoAlTitular,
  cobroTodo,
  conPago,
  cuentaDesdeReserva,
  cuentaEditable,
  cuentaSaldada,
  divisionCompleta,
  esLegacyDividida,
  lineaPagada,
  lineasDeVentaParaParte,
  normalizarCuenta,
  nuevaLinea,
  nuevoPago,
  nuevoParticipante,
  participantePorUid,
  participantesDe,
  sincronizarSeña,
  titularDe,
  totalDeLineas,
  uidsDe,
} from "../utils/cuentas";

// Cuenta del turno (clubs/{c}/cuentas/{grupoId}): la cancha, la seña y los consumos de una reserva. Se crea desde el
// POS al cargar el primer consumo (id = grupoId de la reserva: una reserva, a lo sumo una cuenta) y se cierra
// convirtiéndose en ventas normales (una por parte). Hasta el cierre NO hay movimientos de stock ni de caja:
// la caja la mueven las ventas por sus pagos y el stock lo mueve UNA vez la Function onCuentaUpdated.
// Las escrituras de la cuenta son transacciones (dos tablets pueden cargar la misma cuenta): necesitan conexión.
// P3-7: la cuenta sabe QUIÉN está en el turno (participantes, el titular nace con ella) y QUÉ debe cada uno
// (items[].asignadoA, pagos congelados); se cobra por persona (cobrarSaldo) y se cierra sola cuando nadie debe.
// Sumar / quitar participantes, invitar y asignar desde el celular van por Functions (participantesService).

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
      // Legacy (dividida con partes cobradas): no se le suman consumos. Con pagos por persona sí: cada línea nueva
      // es deuda nueva de quien la pidió.
      if (esLegacyDividida(actual) && !cuentaEditable(actual)) throw new CuentaNoEditableError();
      const extra = normalizarCuenta(actual, { agregadoPor: uid });
      return { ref: r, cuenta: { ...base(actual), ...extra }, nueva: false, reabierta: false, extra };
    }
    if (actual.estado === "anulada") {
      const previo = { estado: "anulada", anulacion: actual.anulacion || null, items: actual.items || [], cerradaPor: actual.cerradaPor || null, cerradaEn: actual.cerradaEn || null, reabiertaPor: uid, reabiertaEn: Timestamp.now() };
      const participantes = [titularDe(actual, { agregadoPor: uid })];
      const cuenta = { ...base(actual), estado: "abierta", items: [], division: null, ventas: [], pagos: [], participantes, participantesUids: uidsDe(participantes), cerradaPor: null, cerradaEn: null, anulacion: null };
      cuenta.totales = calcularTotalesCuenta(cuenta);
      tx.update(r, {
        estado: "abierta",
        items: [],
        division: null,
        ventas: [],
        pagos: [],
        participantes,
        participantesUids: cuenta.participantesUids,
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
  const cuenta = { ...cuentaDesdeReserva({ ...datosReserva, grupoId }, { agregadoPor: uid }), items: [] };
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

// Suma líneas a la cuenta (ya abierta por cuentaAbiertaEnTx) y recalcula totales; una división sin cobrar se
// descarta. `extra`: lo que normalizarCuenta pide escribir (participantes del titular, pagos, división caída).
function sumarLineasEnTx(tx, r, cuenta, nuevas, { nueva, extra = {} }) {
  const items = [...(cuenta.items || []), ...nuevas];
  const totales = calcularTotalesCuenta({ ...cuenta, items });
  if (nueva) tx.update(r, { items, totales, actualizadoEn: serverTimestamp() });
  else tx.update(r, { ...extra, items, ...(esLegacyDividida(cuenta) ? {} : { division: null }), totales, actualizadoEn: serverTimestamp() });
  return { ...cuenta, items, division: esLegacyDividida(cuenta) ? cuenta.division : null, totales };
}
// Escribe campos de la cuenta abierta (participantes / asignaciones) sumando lo que normalizarCuenta pida
function actualizarCuentaEnTx(tx, r, cuenta, cambios, { uid = null } = {}) {
  tx.update(r, { ...normalizarCuenta(cuenta, { agregadoPor: uid }), ...cambios, actualizadoEn: serverTimestamp() });
}

// Agrega líneas del POS a la cuenta de una reserva; si la cuenta no existe la crea con los datos de la reserva.
// Devuelve la cuenta resultante (sin timestamps del servidor resueltos).
// Abre la cuenta del turno sin consumos (desde la ficha del turno): el titular como primer participante
export const abrirCuentaDelTurno = (clubId, grupoId, { uid, nombre, reserva = null }) =>
  runTransaction(db, async (tx) => {
    const { cuenta, nueva, extra, ref: r } = await cuentaAbiertaEnTx(tx, clubId, grupoId, { uid, nombre, reserva });
    if (!nueva && extra && Object.keys(extra).length) tx.update(r, { ...extra, actualizadoEn: serverTimestamp() });
    return cuenta;
  });

// asignadoA: participante elegido en el selector "Para:" del POS ([] = sin asignar)
export const agregarItemsACuenta = async (clubId, grupoId, items, { uid, nombre, reserva, asignadoA = [] }) => {
  const ahora = Timestamp.now();
  const nuevas = (items || []).map((it) => nuevaLinea({ ...it, asignadoA }, { uid, nombre, ahora }));
  if (!nuevas.length) throw new Error("No hay líneas para agregar");
  return runTransaction(db, async (tx) => {
    const { ref: r, cuenta, nueva, extra } = await cuentaAbiertaEnTx(tx, clubId, grupoId, { uid, nombre, reserva });
    return sumarLineasEnTx(tx, r, cuenta, nuevas, { nueva, extra });
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
    const { ref: r, cuenta, nueva, extra = {} } = await cuentaAbiertaEnTx(tx, clubId, grupoId, { uid, nombre });
    const ahora = Timestamp.now();
    // Las líneas del pedido son de quien lo pidió: si todavía no está en la cuenta, se lo suma (origen "pedido")
    let participantes = participantesDe({ ...cuenta, ...extra }, { agregadoPor: uid, ahora });
    let autor = actual.jugadorUid ? participantePorUid({ participantes }, actual.jugadorUid) : null;
    const cambiosParticipantes = {};
    if (!autor && actual.jugadorUid) {
      autor = nuevoParticipante({ uid: actual.jugadorUid, nombre: actual.nombre, tipo: actual.anonimo ? "invitado" : "jugador", anonimo: !!actual.anonimo, origen: "pedido", agregadoPor: uid, ahora });
      participantes = [...participantes, autor];
      cambiosParticipantes.participantes = participantes;
      cambiosParticipantes.participantesUids = uidsDe(participantes);
    }
    const nuevas = (actual.items || []).map((it) => ({
      ...nuevaLinea({ productoId: it.productoId, nombre: it.nombre, precio: it.precio, cantidad: it.cantidad, descuento: 0, controlaStock: it.controlaStock !== false, asignadoA: autor ? [autor.id] : [] }, { uid, nombre, ahora }),
      pedidoId: pedido.id,
      pedidoPor: actual.nombre || null,
      pedidoUid: actual.jugadorUid || null,
    }));
    if (!nuevas.length) throw new Error("El pedido no tiene items");
    const resultado = sumarLineasEnTx(tx, r, cuenta, nuevas, { nueva, extra: { ...extra, ...cambiosParticipantes } });
    if (nueva && cambiosParticipantes.participantes) tx.update(r, cambiosParticipantes);
    tx.update(pr, {
      estado: "aceptado",
      "tiempos.aceptado": serverTimestamp(),
      atendidoPor: uid,
      atendidoPorNombre: String(nombre || "").trim() || null,
      lineaIds: nuevas.map((l) => l.lineaId),
      actualizadoEn: serverTimestamp(),
    });
    return { ...resultado, ...cambiosParticipantes, subtotalPedido: subtotalPedido(actual.items || []) };
  });

export const quitarItemDeCuenta = (clubId, grupoId, lineaId) =>
  runTransaction(db, async (tx) => {
    const r = ref(clubId, grupoId);
    const snap = await tx.get(r);
    if (!snap.exists()) throw new Error("La cuenta no existe");
    const actual = conId(snap);
    if (esLegacyDividida(actual) || lineaPagada(actual, lineaId)) throw new CuentaNoEditableError();
    const items = (actual.items || []).filter((it) => it.lineaId !== lineaId);
    const totales = calcularTotalesCuenta({ ...actual, items });
    actualizarCuentaEnTx(tx, r, actual, { items, division: null, totales });
  });

export const setCobrarCancha = (clubId, grupoId, cobrar) =>
  runTransaction(db, async (tx) => {
    const r = ref(clubId, grupoId);
    const snap = await tx.get(r);
    if (!snap.exists()) throw new Error("La cuenta no existe");
    const actual = conId(snap);
    if (esLegacyDividida(actual) || canchaPagadaEnParte(actual)) throw new CuentaNoEditableError();
    const cancha = { ...(actual.cancha || {}), cobrar: !!cobrar };
    const totales = calcularTotalesCuenta({ ...actual, cancha });
    actualizarCuentaEnTx(tx, r, actual, { cancha, division: null, totales });
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
  participanteIds: [...new Set((lineas || []).map((l) => l.participanteId).filter(Boolean))],
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

// Cobra toda la cuenta (lo que resta) en una venta y la cierra. Sin pagos previos el ticket es el de siempre.
export const cobrarTodo = async (clubId, cuenta, calculo, ctx) => {
  if (esLegacyDividida(cuenta)) throw new Error("Esta cuenta está dividida: cobrá las partes que faltan");
  return cobrarSaldo(clubId, cuenta, cobroTodo(cuenta), calculo, { ...ctx, pagadorId: null, cliente: cuenta.nombreJugador });
};

// Cobra un cobro (cobroDe / cobroDeLineas / cobroRestoAlTitular / cobroTodo) en una venta: escribe la venta
// (y ESPERA el ack: la regla exige la cuenta abierta), congela las piezas en cuenta.pagos y, si ya nadie debe,
// cierra la cuenta en la misma transacción. ctx: { numero, dispositivo, cajaId, uid, nombre, pagadorId, cliente }.
// Devuelve { venta, cerrada }.
export const cobrarSaldo = async (clubId, cuenta, cobro, calculo, ctx) => {
  if (!cobro || !cobro.lineas.length) throw new Error("No hay nada para cobrar");
  const pagador = ctx.pagadorId ? participantesDe(cuenta).find((p) => p.id === ctx.pagadorId) : null;
  const venta = ventaDeCuenta({ cuenta, lineas: cobro.lineas, calculo, cliente: ctx.cliente || pagador?.nombre || cuenta.nombreJugador, ctx });
  await crearVentaEsperando(clubId, venta);
  const cerrada = await runTransaction(db, async (tx) => {
    const r = ref(clubId, cuenta.id);
    const snap = await tx.get(r);
    if (!snap.exists()) throw new Error("La cuenta no existe");
    const actual = conId(snap);
    const pago = nuevoPago({ ventaNumero: venta.numero, participanteIds: pagador ? [pagador.id] : cobro.cubreA, piezas: cobro.piezas, medios: calculo.pagos, por: ctx.uid, porNombre: ctx.nombre, ahora: Timestamp.now() });
    const normal = normalizarCuenta(actual, { agregadoPor: ctx.uid });
    const conElPago = conPago({ ...actual, ...normal }, pago);
    const saldada = cuentaSaldada(conElPago);
    const cambios = { ...normal, pagos: conElPago.pagos, ventas: arrayUnion(venta.numero), actualizadoEn: serverTimestamp() };
    if (saldada && actual.estado === "abierta") {
      Object.assign(cambios, { estado: "cerrada", cerradaPor: ctx.uid, cerradaEn: serverTimestamp(), totales: calcularTotalesCuenta(actual) });
    }
    tx.update(r, cambios);
    return saldada;
  });
  return { venta, cerrada };
};
// Atajos: a una o varias personas, líneas elegidas a un pagador, el resto al titular
export const cobrarParticipantes = (clubId, cuenta, participanteIds, calculo, ctx) => cobrarSaldo(clubId, cuenta, cobroDe(cuenta, participanteIds), calculo, { ...ctx, pagadorId: participanteIds.length === 1 ? participanteIds[0] : null });
export const cobrarLineas = (clubId, cuenta, lineaIds, pagadorId, calculo, ctx) => cobrarSaldo(clubId, cuenta, cobroDeLineas(cuenta, lineaIds, pagadorId), calculo, { ...ctx, pagadorId });
export const cobrarRestoAlTitular = (clubId, cuenta, calculo, ctx) => {
  const titular = participantesDe(cuenta).find((p) => p.tipo === "titular");
  return cobrarSaldo(clubId, cuenta, cobroRestoAlTitular(cuenta), calculo, { ...ctx, pagadorId: titular ? titular.id : null, cliente: cuenta.nombreJugador });
};

// B-P3-7b-1: la seña de la reserva cambió (marcada cobrada, monto, online) → la cuenta abierta del turno se entera.
// Devuelve "copiada" | "alerta" | "sin cambios" | "sin cuenta". Si quien escribe no puede tocar cuentas (reglas), el
// que llama ignora el error: la Function onReservaUpdated hace lo mismo del lado del servidor.
export const sincronizarSeñaDeReserva = (clubId, grupoId, reserva) =>
  runTransaction(db, async (tx) => {
    const r = ref(clubId, grupoId);
    const snap = await tx.get(r);
    if (!snap.exists()) return "sin cuenta";
    const actual = conId(snap);
    const { cambios, alerta } = sincronizarSeña(actual, reserva);
    if (cambios) {
      tx.update(r, { ...cambios, actualizadoEn: serverTimestamp() });
      return "copiada";
    }
    if (alerta && !(actual.alertas || []).includes(alerta)) {
      tx.update(r, { alertas: arrayUnion(alerta), actualizadoEn: serverTimestamp() });
      return "alerta";
    }
    return "sin cambios";
  });

// Participantes (lo que el staff escribe directo: excluir de la cancha, monto fijo). Sumar, quitar e invitar van
// por Functions (participantesService) porque también los usa el titular desde el celular.
export const actualizarParticipante = (clubId, grupoId, participanteId, cambios) =>
  runTransaction(db, async (tx) => {
    const r = ref(clubId, grupoId);
    const snap = await tx.get(r);
    if (!snap.exists()) throw new Error("La cuenta no existe");
    const actual = conId(snap);
    if (actual.estado !== "abierta") throw new CuentaCerradaError();
    const participantes = participantesDe(actual).map((p) => (p.id === participanteId ? { ...p, ...cambios } : p));
    actualizarCuentaEnTx(tx, r, actual, { participantes, participantesUids: uidsDe(participantes) });
  });
// Asignación desde el panel (el staff puede cualquier línea impaga); desde el celular va por la Function
export const asignarLineasCuenta = (clubId, grupoId, lineaIds, asignadoA) =>
  runTransaction(db, async (tx) => {
    const r = ref(clubId, grupoId);
    const snap = await tx.get(r);
    if (!snap.exists()) throw new Error("La cuenta no existe");
    const actual = conId(snap);
    if (actual.estado !== "abierta") throw new CuentaCerradaError();
    if ((lineaIds || []).some((id) => lineaPagada(actual, id))) throw new CuentaNoEditableError();
    const ids = new Set(lineaIds || []);
    const a = [...new Set((asignadoA || []).filter(Boolean))];
    const items = (actual.items || []).map((it) => (ids.has(it.lineaId) ? { ...it, asignadoA: a } : it));
    actualizarCuentaEnTx(tx, r, actual, { items });
  });
// Cuentas cerradas filtradas (desde Reportes → Consumo por cancha): por cancha y rango de fechas
export const getCuentasDeCancha = async (clubId, canchaId, desde, hasta) => {
  const snap = await getDocs(query(col(clubId, "cuentas"), where("canchaId", "==", canchaId), where("fecha", ">=", desde), where("fecha", "<=", hasta)));
  return snap.docs.map(conId).sort((a, b) => `${b.fecha}${b.horaInicio}`.localeCompare(`${a.fecha}${a.horaInicio}`));
};
// Jugador: las cuentas abiertas en las que participa (titular o sumado), en cualquier club
export const escucharCuentasDondeParticipo = (uid, onDatos, onError) =>
  onSnapshot(
    query(collectionGroup(db, "cuentas"), where("participantesUids", "array-contains", uid), where("estado", "==", "abierta")),
    (snap) => onDatos(snap.docs.map((d) => ({ ...conId(d), clubId: d.ref.parent.parent.id }))),
    onError,
  );

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

// Staff: saca una alerta de la cuenta (las reglas dejan tocar alertas en una cuenta abierta)
export const quitarAlertaCuenta = (clubId, cuentaId, alerta) => updateDoc(doc(db, "clubs", clubId, "cuentas", cuentaId), { alertas: arrayRemove(alerta), actualizadoEn: serverTimestamp() });
