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
const lineaVenta = ({ productoId = null, nombre, precio, cantidad = 1, descuento = 0, subtotal, tipoLinea = "consumo", costo = null, categoriaId = null }) => ({
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

// Datos de una cuenta nueva a partir de la reserva agrupada (agruparReservas) — sin timestamps ni autor
export function cuentaDesdeReserva(reserva) {
  return {
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
  };
}
