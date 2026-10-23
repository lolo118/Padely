// Cuenta del turno: helpers puros (sin Firebase ni React). Los usan el POS, la pantalla Cuentas, el ticket y los
// tests. Una cuenta junta la cancha (precio − seña pagada) y los consumos de una reserva; se cierra convirtiéndose
// en una o varias ventas normales (una por parte). Montos en pesos, redondeados a $ 10 al repartir.

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
export const redondear = (n) => Math.round(num(n) * 100) / 100;
export const redondearA10 = (n) => Math.round(num(n) / 10) * 10;

// uuid para las líneas (crypto.randomUUID en el navegador y en Node; alternativa simple si no existe)
export function nuevoId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

// Reparte un monto en n partes redondeadas a $ 10; lo que sobra (o falta) va a la parte 1, así la suma es exacta
export function repartir(monto, n) {
  const partes = Math.max(1, Math.trunc(num(n)) || 1);
  const total = redondear(monto);
  if (partes === 1) return [total];
  const base = redondearA10(total / partes);
  const resto = redondear(total - base * (partes - 1));
  return [resto, ...Array.from({ length: partes - 1 }, () => base)];
}

// ¿Se cobra la cancha en la cuenta? (por defecto sí)
export const cobraCancha = (cuenta) => cuenta?.cancha?.cobrar !== false;

// Lo que la cuenta cobra por la cancha: precio total menos la seña si ya estaba pagada; 0 si no se cobra acá
export function montoCancha(cuenta) {
  if (!cobraCancha(cuenta)) return 0;
  const c = cuenta?.cancha || {};
  return Math.max(0, redondear(num(c.precioTotal) - (c.señaPagada ? num(c.seña) : 0)));
}
export const señaDescontada = (cuenta) => (cobraCancha(cuenta) && cuenta?.cancha?.señaPagada ? redondear(num(cuenta.cancha.seña)) : 0);

// Totales de la cuenta: { consumos, cancha (precio total o 0), seña (lo descontado), total }
export function calcularTotalesCuenta(cuenta) {
  const consumos = redondear((cuenta?.items || []).reduce((s, it) => s + num(it.subtotal), 0));
  const cancha = cobraCancha(cuenta) ? redondear(num(cuenta?.cancha?.precioTotal)) : 0;
  const seña = señaDescontada(cuenta);
  return { consumos, cancha, seña, total: Math.max(0, redondear(consumos + cancha - seña)) };
}

// "Cancha 1 · 20:00–22:00 · Gómez"
export function textoTurno(c) {
  const partes = [c?.canchaNombre || c?.canchaName || "Cancha"];
  const horas = c?.horaInicio ? `${c.horaInicio}${c.horaFin && c.horaFin !== c.horaInicio ? `–${c.horaFin}` : ""}` : "";
  if (horas) partes.push(horas);
  if (c?.nombreJugador) partes.push(c.nombreJugador);
  return partes.join(" · ");
}

// Una línea nueva de consumo a partir de una línea del ticket del POS
export function nuevaLinea(item, { uid = null, nombre = null, ahora = new Date() } = {}) {
  const precio = num(item.precio);
  const cantidad = num(item.cantidad);
  const bruto = redondear(precio * cantidad);
  const descuento = Math.min(bruto, redondear(Math.max(0, num(item.descuento))));
  return {
    lineaId: nuevoId(),
    productoId: item.productoId || null,
    nombre: String(item.nombre || ""),
    precio,
    cantidad,
    descuento,
    subtotal: redondear(bruto - descuento),
    controlaStock: item.controlaStock !== false,
    costo: item.costo === null || item.costo === undefined || item.costo === "" ? null : num(item.costo),
    categoriaId: item.categoriaId || null,
    pedidoId: null,
    pedidoPor: null,
    pedidoUid: null,
    // Cuenta compartida: a quién se le cobra la línea ([] = sin asignar: se reparte entre todos al cobrar)
    asignadoA: Array.isArray(item.asignadoA) ? item.asignadoA.filter(Boolean) : [],
    agregadoPor: uid,
    agregadoPorNombre: nombre,
    agregadoEn: ahora,
    estado: "entregado",
  };
}

// ----- División -----

const nombresPorDefecto = (n, primero) => Array.from({ length: n }, (_, i) => (i === 0 && primero ? primero : `Jugador ${i + 1}`));
const parteBase = (i, nombre, uid = null) => ({
  parteId: `p${i + 1}`,
  nombre,
  uid,
  items: [],
  compartidos: [],
  consumos: 0,
  canchaBruta: 0,
  seña: 0,
  cancha: 0,
  total: 0,
  ventaNumero: null,
  pagadoEn: null,
});
const cerrarParte = (p) => ({ ...p, cancha: redondear(p.canchaBruta - p.seña), total: Math.max(0, redondear(p.consumos + p.canchaBruta - p.seña)) });

// La cancha (y la seña descontada) repartida: en partes iguales, o toda a una parte
function repartirCancha(cuenta, partes, canchaPagaIdx = null) {
  const bruta = cobraCancha(cuenta) ? redondear(num(cuenta.cancha?.precioTotal)) : 0;
  const seña = señaDescontada(cuenta);
  const n = partes.length;
  const canchas = canchaPagaIdx !== null && canchaPagaIdx >= 0 && canchaPagaIdx < n ? partes.map((_, i) => (i === canchaPagaIdx ? bruta : 0)) : repartir(bruta, n);
  const señas = canchaPagaIdx !== null && canchaPagaIdx >= 0 && canchaPagaIdx < n ? partes.map((_, i) => (i === canchaPagaIdx ? seña : 0)) : repartir(seña, n);
  partes.forEach((p, i) => {
    p.canchaBruta = canchas[i];
    p.seña = señas[i];
  });
}

// "En partes iguales": consumos y cancha divididos entre n (cada línea se comparte)
export function dividirEnPartesIguales(cuenta, n, { nombres = [], uids = [] } = {}) {
  const cantidad = Math.min(8, Math.max(2, Math.trunc(num(n)) || 2));
  const nombresFinal = nombresPorDefecto(cantidad, cuenta?.nombreJugador).map((d, i) => String(nombres[i] || "").trim() || d);
  const partes = nombresFinal.map((nom, i) => parteBase(i, nom, i === 0 ? cuenta?.jugadorUid || null : uids[i] || null));
  for (const it of cuenta?.items || []) {
    const shares = repartir(num(it.subtotal), cantidad);
    partes.forEach((p, i) => {
      p.compartidos.push({ lineaId: it.lineaId, nombre: it.nombre, fraccion: `1/${cantidad}`, monto: shares[i] });
      p.consumos = redondear(p.consumos + shares[i]);
    });
  }
  repartirCancha(cuenta, partes, null);
  return { modo: "total", n: cantidad, canchaPagaParte: null, partes: partes.map(cerrarParte) };
}

// "Cada uno lo suyo": asignaciones { [lineaId]: índice de parte | "compartido" }; la cancha se divide igual salvo
// que canchaPagaParte (índice) la pague una sola persona
export function dividirPorJugador(cuenta, asignaciones = {}, { n = 4, nombres = [], uids = [], canchaPagaParte = null } = {}) {
  const cantidad = Math.min(8, Math.max(2, Math.trunc(num(n)) || 2));
  const nombresFinal = nombresPorDefecto(cantidad, cuenta?.nombreJugador).map((d, i) => String(nombres[i] || "").trim() || d);
  const partes = nombresFinal.map((nom, i) => parteBase(i, nom, i === 0 ? cuenta?.jugadorUid || null : uids[i] || null));
  for (const it of cuenta?.items || []) {
    const a = asignaciones[it.lineaId];
    const idx = typeof a === "number" && a >= 0 && a < cantidad ? a : null;
    if (idx !== null) {
      partes[idx].items.push(it.lineaId);
      partes[idx].consumos = redondear(partes[idx].consumos + num(it.subtotal));
    } else {
      const shares = repartir(num(it.subtotal), cantidad);
      partes.forEach((p, i) => {
        p.compartidos.push({ lineaId: it.lineaId, nombre: it.nombre, fraccion: `1/${cantidad}`, monto: shares[i] });
        p.consumos = redondear(p.consumos + shares[i]);
      });
    }
  }
  const idxCancha = typeof canchaPagaParte === "number" && canchaPagaParte >= 0 && canchaPagaParte < cantidad ? canchaPagaParte : null;
  repartirCancha(cuenta, partes, idxCancha);
  return { modo: "porJugador", n: cantidad, canchaPagaParte: idxCancha, partes: partes.map(cerrarParte) };
}

export const partePagada = (p) => !!p?.ventaNumero;
export const partesPagadas = (cuenta) => (cuenta?.division?.partes || []).filter(partePagada).length;
export const divisionCompleta = (cuenta) => !!cuenta?.division?.partes?.length && cuenta.division.partes.every(partePagada);
// Mientras ninguna parte esté cobrada, la cuenta se puede editar (items, cancha, división)
export const cuentaEditable = (cuenta) => cuenta?.estado === "abierta" && partesPagadas(cuenta) === 0;

// La parte del jugador que mira su cuenta: por uid, si no por nombre; null si no se puede saber
export function parteDelJugador(cuenta, uid, nombre) {
  const partes = cuenta?.division?.partes || [];
  if (!partes.length) return null;
  const porUid = uid ? partes.find((p) => p.uid === uid) : null;
  if (porUid) return porUid;
  const n = String(nombre || "").trim().toLowerCase();
  if (!n) return null;
  return partes.find((p) => String(p.nombre || "").trim().toLowerCase() === n) || null;
}

// ----- Líneas de las ventas que cierran la cuenta (TODAS con controlaStock false: el stock lo mueve una sola vez
// la Function onCuentaUpdated al cerrar la cuenta) -----

// tipoLinea: "consumo" (producto) | "cancha" | "seña" — lo usan los reportes para separar consumos de cancha
const lineaVenta = ({ productoId = null, nombre, precio, cantidad = 1, descuento = 0, subtotal, tipoLinea = "consumo", costo = null, categoriaId = null, participanteId = null }) => ({
  productoId,
  nombre,
  precio: redondear(precio),
  cantidad,
  descuento: redondear(descuento),
  subtotal: redondear(subtotal),
  controlaStock: false,
  tipoLinea,
  costo: costo === null || costo === undefined ? null : redondear(costo),
  categoriaId: categoriaId || null,
  participanteId: participanteId || null,
});
const nombreCancha = (cuenta) => `${cuenta?.canchaNombre || cuenta?.canchaName || "Cancha"} · ${cuenta?.horaInicio || ""}${cuenta?.horaFin ? `–${cuenta.horaFin}` : ""}`.trim();

export function lineasDeVentaParaTodo(cuenta) {
  const lineas = (cuenta?.items || []).map((it) =>
    lineaVenta({ productoId: it.productoId, nombre: it.nombre, precio: it.precio, cantidad: it.cantidad, descuento: it.descuento, subtotal: it.subtotal, costo: it.costo, categoriaId: it.categoriaId }),
  );
  if (cobraCancha(cuenta)) {
    const bruta = redondear(num(cuenta.cancha?.precioTotal));
    if (bruta > 0) lineas.push(lineaVenta({ nombre: nombreCancha(cuenta), precio: bruta, subtotal: bruta, tipoLinea: "cancha" }));
    const seña = señaDescontada(cuenta);
    if (seña > 0) lineas.push(lineaVenta({ nombre: "Seña pagada", precio: -seña, subtotal: -seña, tipoLinea: "seña" }));
  }
  return lineas;
}

export function lineasDeVentaParaParte(cuenta, parte) {
  const porId = new Map((cuenta?.items || []).map((it) => [it.lineaId, it]));
  const lineas = [];
  for (const id of parte?.items || []) {
    const it = porId.get(id);
    if (it) lineas.push(lineaVenta({ productoId: it.productoId, nombre: it.nombre, precio: it.precio, cantidad: it.cantidad, descuento: it.descuento, subtotal: it.subtotal, costo: it.costo, categoriaId: it.categoriaId }));
  }
  for (const c of parte?.compartidos || []) {
    // Una parte de una línea compartida: el costo proporcional del producto (si lo tenía) y su categoría
    const it = porId.get(c.lineaId);
    const costoParte = it && it.costo !== null && it.costo !== undefined && num(it.subtotal) !== 0 ? (num(it.costo) * num(it.cantidad) * num(c.monto)) / num(it.subtotal) : null;
    if (num(c.monto) !== 0) lineas.push(lineaVenta({ productoId: it?.productoId || null, nombre: `${c.nombre} (${c.fraccion})`, precio: c.monto, subtotal: c.monto, costo: costoParte, categoriaId: it?.categoriaId || null }));
  }
  const fraccion = cuenta?.division?.n > 1 && cuenta.division.canchaPagaParte === null ? ` (1/${cuenta.division.n})` : "";
  if (num(parte?.canchaBruta) > 0) lineas.push(lineaVenta({ nombre: `${nombreCancha(cuenta)}${fraccion}`, precio: parte.canchaBruta, subtotal: parte.canchaBruta, tipoLinea: "cancha" }));
  if (num(parte?.seña) > 0) lineas.push(lineaVenta({ nombre: `Seña pagada${fraccion}`, precio: -parte.seña, subtotal: -parte.seña, tipoLinea: "seña" }));
  return lineas;
}

// Subtotal de un conjunto de líneas de venta (lo que la venta declara como subtotal y total: sin descuento general)
export const totalDeLineas = (lineas) => Math.max(0, redondear((lineas || []).reduce((s, l) => s + num(l.subtotal), 0)));

// ----- Franja de turnos -----

const minutosDe = (hora) => {
  const [h, m] = String(hora || "00:00").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};
export const fechaLocalDe = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// ¿La reserva está "en juego" ahora? Desde 30 min antes de empezar hasta 60 min después de terminar, el mismo día
export function ventanaDeTurno(reserva, ahora = new Date(), { antesMin = 30, despuesMin = 60 } = {}) {
  if (!reserva?.fecha || reserva.fecha !== fechaLocalDe(ahora)) return false;
  const inicio = minutosDe(reserva.horaInicio || reserva.hora);
  const fin = reserva.horaFin ? minutosDe(reserva.horaFin) : inicio + 60 * (Number(reserva.turnos) || 1);
  const t = ahora.getHours() * 60 + ahora.getMinutes();
  return t >= inicio - antesMin && t <= fin + despuesMin;
}

// Datos de una cuenta nueva a partir de la reserva agrupada (agruparReservas) — sin timestamps ni autor.
// El titular (quien reservó) nace como primer participante; agregadoPor: quién abre la cuenta.
export function cuentaDesdeReserva(reserva, { agregadoPor = null, ahora = new Date() } = {}) {
  const base = {
    reservaGrupoId: reserva.grupoId || reserva.id,
    canchaId: reserva.canchaId || null,
    canchaNombre: reserva.canchaName || reserva.canchaNombre || "Cancha",
    fecha: reserva.fecha,
    horaInicio: reserva.horaInicio || reserva.hora || "",
    horaFin: reserva.horaFin || "",
    turnos: Number(reserva.turnos) || 1,
    jugadorUid: reserva.jugadorUid || null,
    nombreJugador: reserva.nombreJugador || "",
    estado: "abierta",
    cancha: { precioTotal: num(reserva.precioTotal), seña: num(reserva.seña), señaPagada: !!reserva.señaPagada, cobrar: true },
    items: [],
    division: null,
    ventas: [],
    pagos: [],
    invitacion: null,
  };
  const participantes = [titularDe(base, { agregadoPor, ahora })];
  return { ...base, participantes, participantesUids: uidsDe(participantes) };
}

// ============================================================================
// CUENTA COMPARTIDA (P3-7): participantes, asignación de consumos, pagos congelados y saldos por persona.
// Reglas del dinero (binding, en el prompt P3-7):
//   1. Lo pagado está congelado: lo que cubrió cada pago (pagos[].lineas) no cambia nunca. Todo lo demás se calcula
//      sobre lo que RESTA y entre quienes todavía deben.
//   2. Cancha: resto = precioTotal (si cancha.cobrar) − cancha ya pagada. Se reparte entre los activos sin
//      excluirCancha y sin canchaFija (después de restar los montos fijos), en pasos de $ 10, resto al titular.
//      Quien ya pagó su parte de cancha queda afuera del reparto (quien se suma tarde no cambia lo que otros pagaron).
//   3. Seña pagada: crédito del titular (su parte de cancha − seña, mínimo 0); lo que sobra baja por igual las partes
//      de cancha impagas de los demás.
//   4. Línea asignada: su resto se reparte en partes iguales entre sus asignados que no pagaron su parte ($ 10,
//      resto al primero de la lista).
//   5. Línea sin asignar: igual, pero entre TODOS los activos ("sin asignar" en cada persona).
//   6. debe = total − pagado ≥ 0; pendiente = Σ debe. La cuenta se cierra cuando pendiente == 0 y todo está cubierto.
//   7. "Cobrar el resto al titular": una sola venta del titular con las deudas de los demás (cubreA; "de Martín").
// ============================================================================
export const PARTICIPANTES_MAX = 30;
export const ID_TITULAR = "titular";
export const TIPOS_PARTICIPANTE = { titular: "Titular", jugador: "Jugador", invitado: "Invitado" };
export const etiquetaTipoParticipante = (tipo) => TIPOS_PARTICIPANTE[tipo] || "Jugador";

export function nuevoParticipante({ id = null, uid = null, nombre = "", tipo = "invitado", anonimo = false, origen = "staff", agregadoPor = null, ahora = new Date(), excluirCancha = false, canchaFija = null } = {}) {
  return {
    id: id || nuevoId(),
    uid: uid || null,
    nombre: String(nombre || "").trim() || "Sin nombre",
    tipo: TIPOS_PARTICIPANTE[tipo] ? tipo : "invitado",
    anonimo: !!anonimo,
    origen,
    agregadoPor: agregadoPor || null,
    agregadoEn: ahora,
    excluirCancha: !!excluirCancha,
    canchaFija: canchaFija === null || canchaFija === undefined || canchaFija === "" ? null : Math.max(0, num(canchaFija)),
    estado: "activo",
  };
}
// El titular: quien reservó (jugadorUid / nombreJugador de la cuenta o de la reserva)
export function titularDe(cuenta, { agregadoPor = null, ahora = new Date() } = {}) {
  return nuevoParticipante({ id: ID_TITULAR, uid: cuenta?.jugadorUid || null, nombre: cuenta?.nombreJugador || "Titular", tipo: "titular", anonimo: false, origen: "titular", agregadoPor, ahora });
}
const activosDe = (lista) => (Array.isArray(lista) ? lista : []).filter((p) => p && p.estado !== "quitado");
export const uidsDe = (participantes) => [...new Set(activosDe(participantes).filter((p) => p.uid).map((p) => p.uid))];
// Participantes de una cuenta: los que tiene, o el titular armado desde la cuenta (cuentas anteriores a P3-7)
export const participantesDe = (cuenta, opts = {}) => (Array.isArray(cuenta?.participantes) && cuenta.participantes.length ? cuenta.participantes : [titularDe(cuenta, opts)]);
export const participantesActivos = (cuenta) => activosDe(participantesDe(cuenta));
export const titularDeCuenta = (cuenta) => participantesActivos(cuenta).find((p) => p.tipo === "titular") || participantesActivos(cuenta)[0] || null;
export const participantePorUid = (cuenta, uid) => (uid ? participantesActivos(cuenta).find((p) => p.uid === uid) || null : null);
export const participantePorId = (cuenta, id) => (id ? participantesActivos(cuenta).find((p) => p.id === id) || null : null);
export const iniciales = (nombre) =>
  String(nombre || "")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0] || "")
    .join("")
    .toUpperCase() || "?";

// Legacy P3-4: una cuenta dividida con alguna parte cobrada sigue con la división hasta cerrarse
export const esLegacyDividida = (cuenta) => !!cuenta?.division?.partes?.length && partesPagadas(cuenta) > 0;

// Campos para la PRÓXIMA escritura de una cuenta abierta: participantes (el titular, si no tenía), pagos, y la
// división se deja caer cuando no es legacy. Nunca una migración masiva: solo cuando la cuenta ya se está escribiendo.
export function normalizarCuenta(cuenta, { agregadoPor = null, ahora = new Date() } = {}) {
  const out = {};
  if (!Array.isArray(cuenta?.participantes) || cuenta.participantes.length === 0) {
    out.participantes = [titularDe(cuenta, { agregadoPor, ahora })];
    out.participantesUids = uidsDe(out.participantes);
  }
  if (!Array.isArray(cuenta?.pagos)) out.pagos = [];
  if (cuenta?.division && !esLegacyDividida(cuenta)) out.division = null;
  return out;
}

// ----- Asignación -----
export const asignarLineas = (items, lineaIds, asignadoA) => {
  const ids = new Set(lineaIds || []);
  const a = [...new Set((asignadoA || []).filter(Boolean))];
  return (items || []).map((it) => (ids.has(it.lineaId) ? { ...it, asignadoA: a } : it));
};
// ¿Alguien ya pagó parte de esta línea? (congelado: no se reasigna ni se quita)
export const lineaPagada = (cuenta, lineaId) => (cuenta?.pagos || []).some((pg) => (pg.lineas || []).some((l) => l.tipo === "consumo" && l.lineaId === lineaId && num(l.monto) !== 0));
export const canchaPagadaEnParte = (cuenta) => (cuenta?.pagos || []).some((pg) => (pg.lineas || []).some((l) => (l.tipo === "cancha" || l.tipo === "seña") && num(l.monto) !== 0));
// Quién puede asignar qué: el staff y el titular, cualquier línea impaga; un participante, solo las líneas que lo
// incluyen o salieron de su pedido, y solo para compartirlas o quedárselas (nunca empujarla a otro)
export function puedeAsignar({ cuenta, linea, asignadoA, participante = null, esStaff = false, esTitular = false }) {
  if (!cuenta || !linea || cuenta.estado !== "abierta") return false;
  if (lineaPagada(cuenta, linea.lineaId)) return false;
  if (esStaff || esTitular) return true;
  if (!participante) return false;
  const propia = (linea.asignadoA || []).includes(participante.id) || (!!linea.pedidoUid && linea.pedidoUid === participante.uid);
  if (!propia) return false;
  const nuevos = asignadoA || [];
  return nuevos.length === 0 || nuevos.includes(participante.id);
}

// ----- Saldos -----
// Lo ya pagado, congelado, leído de pagos[].lineas: por línea y participante, la cancha bruta y la seña aplicada
function pagosCongelados(cuenta) {
  const porLinea = new Map(); // lineaId → Map(participanteId → monto)
  const porParticipante = new Map(); // participanteId → total pagado a su nombre
  const canchaDe = new Set(); // participantes con su cancha ya pagada
  let canchaBruta = 0;
  let señaAplicada = 0;
  let total = 0;
  for (const pago of cuenta?.pagos || []) {
    total += num(pago.total);
    for (const l of pago.lineas || []) {
      const pid = l.participanteId || null;
      const monto = num(l.monto);
      if (pid) porParticipante.set(pid, redondear((porParticipante.get(pid) || 0) + monto));
      if (l.tipo === "consumo" && l.lineaId) {
        const m = porLinea.get(l.lineaId) || new Map();
        m.set(pid, redondear((m.get(pid) || 0) + monto));
        porLinea.set(l.lineaId, m);
      } else if (l.tipo === "cancha") {
        canchaBruta += monto;
        if (pid) canchaDe.add(pid);
      } else if (l.tipo === "seña") {
        señaAplicada += -monto;
        if (pid) canchaDe.add(pid);
      }
    }
  }
  return { porLinea, porParticipante, canchaDe, canchaBruta: redondear(canchaBruta), señaAplicada: redondear(señaAplicada), total: redondear(total) };
}
const sumaDe = (m) => redondear([...m.values()].reduce((s, v) => s + v, 0));
const ordenTitularPrimero = (lista, titularId) => [...lista.filter((p) => p.id === titularId), ...lista.filter((p) => p.id !== titularId)];

// Saldos de la cuenta: qué debe cada participante activo y cómo va la cuenta. Puro y determinista.
export function saldosDeCuenta(cuenta) {
  const totales = calcularTotalesCuenta(cuenta);
  const pagos = pagosCongelados(cuenta);
  if (esLegacyDividida(cuenta)) {
    const pagadoTotal = redondear((cuenta.division.partes || []).filter(partePagada).reduce((s, p) => s + num(p.total), 0));
    return { legacy: true, participantes: [], titularId: null, totalCuenta: totales.total, pagadoTotal, pendiente: Math.max(0, redondear(totales.total - pagadoTotal)), saldada: divisionCompleta(cuenta), consumosTotal: totales.consumos, canchaTotal: totales.cancha, señaCredito: totales.seña, asignadoTotal: 0, sinAsignarTotal: totales.consumos, reparto: null };
  }
  const lista = participantesActivos(cuenta);
  const titular = lista.find((p) => p.tipo === "titular") || lista[0] || null;
  const titularId = titular ? titular.id : null;
  const saldo = new Map(
    lista.map((p) => [
      p.id,
      { id: p.id, nombre: p.nombre, tipo: p.tipo, uid: p.uid || null, anonimo: !!p.anonimo, excluirCancha: !!p.excluirCancha, canchaFija: p.canchaFija === null || p.canchaFija === undefined ? null : num(p.canchaFija), canchaBruta: 0, seña: 0, cancha: 0, canchaPagada: pagos.canchaDe.has(p.id), consumos: [], sinAsignar: 0, pagado: pagos.porParticipante.get(p.id) || 0, debe: 0, total: 0 },
    ]),
  );

  // ---- Cancha: dos libros, la cancha por un lado ----
  const canchaTotal = totales.cancha;
  const señaCredito = totales.seña;
  const señaDisponible = Math.max(0, redondear(señaCredito - pagos.señaAplicada));
  let reparto = null;
  if (canchaTotal > 0) {
    const enCancha = lista.filter((p) => !p.excluirCancha && !pagos.canchaDe.has(p.id));
    const fijos = enCancha.filter((p) => p.canchaFija !== null && p.canchaFija !== undefined);
    const iguales = ordenTitularPrimero(enCancha.filter((p) => p.canchaFija === null || p.canchaFija === undefined), titularId);
    fijos.forEach((p) => (saldo.get(p.id).canchaBruta = Math.max(0, redondear(num(p.canchaFija)))));
    const fijosTotal = fijos.reduce((s, p) => s + saldo.get(p.id).canchaBruta, 0);
    let pool = Math.max(0, redondear(canchaTotal - pagos.canchaBruta - fijosTotal));
    if (iguales.length) {
      const partes = repartir(pool, iguales.length);
      iguales.forEach((p, i) => (saldo.get(p.id).canchaBruta = partes[i]));
      pool = 0;
    } else if (pool > 0) {
      // Nadie en el reparto igualitario: lo que falta va al titular si debe cancha, si no al primer fijo impago
      const destino = (titular && !titular.excluirCancha && !pagos.canchaDe.has(titularId) ? saldo.get(titularId) : null) || (fijos[0] ? saldo.get(fijos[0].id) : null);
      if (destino) destino.canchaBruta = redondear(destino.canchaBruta + pool);
      pool = 0;
    }
    // Seña: crédito del titular; el sobrante baja por igual las otras partes impagas
    if (señaDisponible > 0) {
      const impagos = ordenTitularPrimero(enCancha, titularId).map((p) => saldo.get(p.id)).filter((s) => s.canchaBruta > 0 || s.id === titularId);
      let resto = señaDisponible;
      const st = saldo.get(titularId);
      if (st && !st.canchaPagada && !st.excluirCancha) {
        st.seña = Math.min(st.canchaBruta, resto);
        resto = redondear(resto - st.seña);
      }
      const otros = impagos.filter((s) => s.id !== titularId && s.canchaBruta > 0);
      if (resto > 0 && otros.length) {
        // En pasos de $ 10 entre los demás, topado en lo que cada uno debe de cancha; lo que no entra se pierde
        const cuotas = repartir(resto, otros.length);
        otros.forEach((s, i) => {
          s.seña = Math.min(s.canchaBruta, cuotas[i]);
        });
      }
    }
    for (const s of saldo.values()) s.cancha = Math.max(0, redondear(s.canchaBruta - s.seña));
    const cabezas = lista.filter((p) => !p.excluirCancha && (p.canchaFija === null || p.canchaFija === undefined)).length;
    reparto = { entre: iguales.length, cabezas, cuota: iguales.length ? saldo.get(iguales[iguales.length - 1].id).canchaBruta : 0, fijos: fijos.length, excluidos: lista.filter((p) => p.excluirCancha).length, pagaron: lista.filter((p) => pagos.canchaDe.has(p.id)).length };
  }

  // ---- Consumos: el otro libro, línea por línea ----
  let asignadoTotal = 0;
  let sinAsignarTotal = 0;
  let cubiertas = true;
  for (const it of cuenta?.items || []) {
    const subtotal = redondear(it.subtotal);
    const pagado = pagos.porLinea.get(it.lineaId) || new Map();
    const resto = redondear(subtotal - sumaDe(pagado));
    const asignados = (it.asignadoA || []).map((id) => saldo.get(id)).filter(Boolean);
    const sinAsignar = asignados.length === 0;
    const candidatos = sinAsignar ? ordenTitularPrimero(lista, titularId).map((p) => saldo.get(p.id)) : asignados;
    if (sinAsignar) sinAsignarTotal += subtotal;
    else asignadoTotal += subtotal;
    if (resto <= 0) continue;
    cubiertas = false;
    let deudores = candidatos.filter((s) => !pagado.has(s.id) || num(pagado.get(s.id)) === 0);
    if (!deudores.length) deudores = [saldo.get(titularId) || candidatos[0]].filter(Boolean);
    if (!deudores.length) continue;
    const cuotas = repartir(resto, deudores.length);
    const costoUnit = it.costo === null || it.costo === undefined ? null : num(it.costo) * num(it.cantidad);
    deudores.forEach((s, i) => {
      if (cuotas[i] === 0) return;
      s.consumos.push({
        lineaId: it.lineaId,
        nombre: it.nombre,
        productoId: it.productoId || null,
        categoriaId: it.categoriaId || null,
        pedidoId: it.pedidoId || null,
        monto: cuotas[i],
        compartidoCon: candidatos.length,
        sinAsignar,
        costo: costoUnit === null || subtotal === 0 ? null : redondear((costoUnit * cuotas[i]) / subtotal),
      });
      if (sinAsignar) s.sinAsignar = redondear(s.sinAsignar + cuotas[i]);
    });
  }

  for (const s of saldo.values()) {
    s.debe = Math.max(0, redondear(s.cancha + s.consumos.reduce((a, c) => a + c.monto, 0)));
    s.total = redondear(s.pagado + s.debe);
  }
  const participantes = [...saldo.values()];
  const pendiente = redondear(participantes.reduce((a, s) => a + s.debe, 0));
  const canchaCubierta = canchaTotal <= 0 || redondear(pagos.canchaBruta) >= canchaTotal - 0.005;
  return {
    legacy: false,
    participantes,
    titularId,
    totalCuenta: totales.total,
    pagadoTotal: pagos.total,
    pendiente,
    saldada: pendiente === 0 && cubiertas && canchaCubierta,
    consumosTotal: totales.consumos,
    canchaTotal,
    canchaPagada: pagos.canchaBruta,
    señaCredito,
    señaDisponible,
    asignadoTotal: redondear(asignadoTotal),
    sinAsignarTotal: redondear(sinAsignarTotal),
    reparto,
  };
}

// ----- Cobro -----
// Líneas de venta y piezas congeladas (pagos[].lineas) para cobrar lo que deben estos participantes ahora.
// etiquetar(id) → true agrega " · de <nombre>" a sus líneas (cobrar el resto al titular).
export function cobroDe(cuenta, participanteIds, { saldos = null, etiquetar = null } = {}) {
  const s = saldos || saldosDeCuenta(cuenta);
  const lineas = [];
  const piezas = [];
  const cubreA = [];
  const fraccion = (n) => (n > 1 ? ` (1/${n})` : "");
  for (const id of participanteIds || []) {
    const p = s.participantes.find((x) => x.id === id);
    if (!p || p.debe <= 0) continue;
    cubreA.push(id);
    const sufijo = etiquetar && etiquetar(id) ? ` · de ${p.nombre}` : "";
    for (const c of p.consumos) {
      lineas.push(lineaVenta({ productoId: c.productoId, nombre: `${c.nombre}${fraccion(c.compartidoCon)}${sufijo}`, precio: c.monto, subtotal: c.monto, costo: c.costo, categoriaId: c.categoriaId, participanteId: id }));
      piezas.push({ lineaId: c.lineaId, tipo: "consumo", monto: c.monto, participanteId: id });
    }
    if (p.canchaBruta > 0) {
      const n = s.reparto && p.canchaFija === null ? s.reparto.cabezas : 1;
      lineas.push(lineaVenta({ nombre: `${nombreCancha(cuenta)}${fraccion(n)}${sufijo}`, precio: p.canchaBruta, subtotal: p.canchaBruta, tipoLinea: "cancha", participanteId: id }));
      piezas.push({ lineaId: null, tipo: "cancha", monto: p.canchaBruta, participanteId: id });
    }
    if (p.seña > 0) {
      lineas.push(lineaVenta({ nombre: `Seña pagada${sufijo}`, precio: -p.seña, subtotal: -p.seña, tipoLinea: "seña", participanteId: id }));
      piezas.push({ lineaId: null, tipo: "seña", monto: -p.seña, participanteId: id });
    }
  }
  return { lineas, piezas, total: totalDeLineas(lineas), cubreA };
}
// Cobrar líneas elegidas (lo que resta de cada una, de todos sus deudores) a un pagador
export function cobroDeLineas(cuenta, lineaIds, pagadorId, { saldos = null } = {}) {
  const s = saldos || saldosDeCuenta(cuenta);
  const ids = new Set(lineaIds || []);
  const lineas = [];
  const piezas = [];
  const cubre = new Set();
  const pagador = s.participantes.find((x) => x.id === pagadorId);
  for (const p of s.participantes) {
    for (const c of p.consumos) {
      if (!ids.has(c.lineaId)) continue;
      const deOtro = pagador && p.id !== pagador.id ? ` · de ${p.nombre}` : "";
      lineas.push(lineaVenta({ productoId: c.productoId, nombre: `${c.nombre}${c.compartidoCon > 1 ? ` (1/${c.compartidoCon})` : ""}${deOtro}`, precio: c.monto, subtotal: c.monto, costo: c.costo, categoriaId: c.categoriaId, participanteId: p.id }));
      piezas.push({ lineaId: c.lineaId, tipo: "consumo", monto: c.monto, participanteId: p.id });
      cubre.add(p.id);
    }
  }
  return { lineas, piezas, total: totalDeLineas(lineas), cubreA: [...cubre] };
}
// "Cobrar todo": lo que resta de toda la cuenta en una venta. Sin pagos previos el ticket es el de siempre
// (lineasDeVentaParaTodo); las piezas congeladas igual quedan por persona.
export function cobroTodo(cuenta, { saldos = null } = {}) {
  const s = saldos || saldosDeCuenta(cuenta);
  const ids = s.participantes.filter((p) => p.debe > 0).map((p) => p.id);
  const todos = cobroDe(cuenta, ids, { saldos: s, etiquetar: (id) => s.participantes.length > 1 && id !== s.titularId });
  if (!(cuenta?.pagos || []).length) return { ...todos, lineas: lineasDeVentaParaTodo(cuenta).map((l) => ({ ...l, participanteId: s.participantes.length === 1 ? s.titularId : null })) };
  return todos;
}
// "Cobrar el resto al titular": las deudas de todos en una venta del titular; sus líneas dicen de quién eran
export function cobroRestoAlTitular(cuenta, { saldos = null } = {}) {
  const s = saldos || saldosDeCuenta(cuenta);
  const ids = s.participantes.filter((p) => p.debe > 0).map((p) => p.id);
  return cobroDe(cuenta, ids, { saldos: s, etiquetar: (id) => id !== s.titularId });
}
// El pago congelado que se guarda en cuenta.pagos
export function nuevoPago({ ventaNumero, participanteIds = [], piezas = [], medios = [], por = null, porNombre = null, ahora = new Date() }) {
  return {
    id: nuevoId(),
    ventaNumero,
    participanteIds: [...new Set(participanteIds.filter(Boolean))],
    lineas: piezas.map((p) => ({ lineaId: p.lineaId || null, tipo: p.tipo, monto: redondear(p.monto), participanteId: p.participanteId || null })),
    total: redondear(piezas.reduce((s, p) => s + num(p.monto), 0)),
    medios: (medios || []).map((m) => ({ medio: m.medio, monto: redondear(m.monto) })),
    en: ahora,
    por,
    porNombre: porNombre || null,
    cubreA: [...new Set(piezas.map((p) => p.participanteId).filter(Boolean))],
  };
}
export const conPago = (cuenta, pago) => ({ ...cuenta, pagos: [...(cuenta?.pagos || []), pago] });
export const cuentaSaldada = (cuenta) => saldosDeCuenta(cuenta).saldada;

// ----- Textos -----
// "Entre 6 · $ 2.500 c/u" (+ excepciones)
export function textoReparto(saldos) {
  const r = saldos?.reparto;
  if (!r) return "";
  const partes = [];
  if (r.entre > 0) partes.push(`Entre ${r.entre} · ${formatearPesos(r.cuota)} c/u`);
  if (r.fijos) partes.push(`${r.fijos} con monto fijo`);
  if (r.excluidos) partes.push(`${r.excluidos} sin cancha`);
  if (r.pagaron) partes.push(`${r.pagaron} ya pagaron`);
  return partes.join(" · ");
}
const formatearPesos = (n) => "$ " + Math.round(num(n)).toLocaleString("es-AR", { maximumFractionDigits: 0 });
// Teléfono argentino → "549" + área + número (solo dígitos); "" si no da
export function telefonoWa(telefono) {
  let d = String(telefono || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("549")) return d.length >= 12 && d.length <= 13 ? d : "";
  if (d.startsWith("54")) d = d.slice(2);
  if (d.startsWith("0")) d = d.slice(1);
  if (d.startsWith("15")) d = d.slice(2);
  // "área + 15 + número" (12 dígitos): el 15 va después del área (2 a 4 dígitos)
  if (d.length === 12) {
    const i = [2, 3, 4].find((k) => d.slice(k, k + 2) === "15");
    if (i !== undefined) d = d.slice(0, i) + d.slice(i + 2);
  }
  // área (2 a 4) + número (6 a 8) = 10 dígitos
  if (d.length !== 10) return "";
  return "549" + d;
}
export const mensajeInvitacion = ({ fechaTexto, hora, clubNombre, canchaNombre, url }) =>
  `Sumate al turno del ${fechaTexto} · ${hora} en ${clubNombre}${canchaNombre ? ` (${canchaNombre})` : ""}. Entrá acá para ver lo que te toca pagar y pedir a la barra: ${url}`;
export const urlUnirse = (clubId, token, origen = typeof window !== "undefined" ? window.location.origin : "https://padely.netlify.app") => `${origen}/t/unirse/${clubId}/${token}`;
export const linkWhatsApp = (numero, texto) => `https://wa.me/${numero || ""}?text=${encodeURIComponent(texto)}`;
