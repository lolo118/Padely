// Caja del bar: helpers puros (sin Firebase ni React). Los usan la pantalla de Caja, el ticket de cierre y los tests.
//
// LA CAJA ES UN REGISTRO, NO UN CONTADOR: `cajas.totales` lo deriva la Cloud Function onMovimientoCajaCreated
// (functions/index.js) a partir de movimientosCaja. La aritmética de `aplicarMovimiento` es LA MISMA que la de la
// Function: si cambia una, cambia la otra. El cliente la usa solo para mostrar (nunca escribe totales).

export const MEDIOS_CAJA = ["efectivo", "transferencia", "tarjeta", "qr"];

// Tipos que el cliente puede crear hoy; "venta", "anulacion", "cobroCuenta" y "seña" los escriben Functions (P3-3/P3-4)
export const TIPOS_MOVIMIENTO_CAJA = ["retiro", "ingreso", "gasto"];
export const TIPOS_RESERVADOS_CAJA = ["venta", "anulacion", "cobroCuenta", "seña"];

// "mercadopago" (pagos online, P3-8) no es un medio de caja: su plata va a la cuenta de MP del club, nunca a una caja
export const ETIQUETA_MEDIO = { efectivo: "Efectivo", transferencia: "Transferencia", tarjeta: "Tarjeta", qr: "QR", mercadopago: "Mercado Pago" };
export const ETIQUETA_TIPO = {
  retiro: "Retiro",
  ingreso: "Ingreso",
  gasto: "Gasto",
  venta: "Venta",
  anulacion: "Anulación",
  cobroCuenta: "Cobro de cuenta",
  "seña": "Seña",
};

// Totales con los que nace una caja (solo la Function los cambia después)
export const TOTALES_CERO = Object.freeze({
  efectivo: 0,
  transferencia: 0,
  tarjeta: 0,
  qr: 0,
  ventas: 0,
  anulaciones: 0,
  retiros: 0,
  ingresos: 0,
  gastos: 0,
  movimientos: 0,
});

// Clave de totales que acumula el monto (positivo) de cada tipo; null para los que no tienen una propia
const CLAVE_POR_TIPO = {
  retiro: "retiros",
  ingreso: "ingresos",
  gasto: "gastos",
  venta: "ventas",
  anulacion: "anulaciones",
  cobroCuenta: null,
  seña: null,
};

// Signo con el que un tipo mueve el dinero del medio: entra (+1) o sale (−1); 0 si el tipo no existe
export function signoDe(tipo) {
  switch (tipo) {
    case "ingreso":
    case "venta":
    case "cobroCuenta":
    case "seña":
      return 1;
    case "retiro":
    case "gasto":
    case "anulacion":
      return -1;
    default:
      return 0;
  }
}

export const claveTotalDe = (tipo) => CLAVE_POR_TIPO[tipo] ?? null;

// Totales después de aplicar un movimiento { tipo, medio, monto } (devuelve un objeto nuevo). Un movimiento con
// tipo o medio desconocido, o monto no positivo, solo suma al contador `movimientos` (igual que la Function).
export function aplicarMovimiento(totales, mov) {
  const t = { ...TOTALES_CERO, ...(totales || {}) };
  const monto = Number(mov?.monto);
  const signo = signoDe(mov?.tipo);
  if (signo !== 0 && Number.isFinite(monto) && monto > 0) {
    if (MEDIOS_CAJA.includes(mov.medio)) t[mov.medio] = (Number(t[mov.medio]) || 0) + signo * monto;
    const clave = claveTotalDe(mov.tipo);
    if (clave) t[clave] = (Number(t[clave]) || 0) + monto;
  }
  t.movimientos = (Number(t.movimientos) || 0) + 1;
  return t;
}

// Efectivo que debería haber en la caja: fondo inicial + lo que entró y salió en efectivo
export function efectivoEsperado(caja) {
  return (Number(caja?.fondoInicial) || 0) + (Number(caja?.totales?.efectivo) || 0);
}

// Tono de la diferencia del arqueo: exacta → success; un sobrante chico → warning; cualquier faltante → danger
export function tonoDiferencia(diferencia, { tolerancia = 100 } = {}) {
  const d = Number(diferencia);
  if (!Number.isFinite(d) || d === 0) return "success";
  if (d < 0) return "danger";
  return d <= tolerancia ? "warning" : "danger";
}

// Monto con el signo del tipo (para listas): retiro 500 → −500
export const montoConSigno = (mov) => signoDe(mov?.tipo) * (Number(mov?.monto) || 0);
