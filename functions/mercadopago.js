// functions/mercadopago.js — helpers puros de la integración con Mercado Pago (Checkout Pro, modelo marketplace: la
// plata va a la cuenta de MP de cada club; Padely puede cobrar un marketplace_fee). Sin Firestore ni red: URLs,
// la firma HMAC de los webhooks, el cuerpo de la preferencia, la comisión y qué piezas de un pago siguen sin cubrir.
// Fuentes: docs de Mercado Pago "Webhooks" (x-signature ts/v1, GET /v1/payments/{id}, 22 s, reintentos cada 15 min),
// "OAuth" (authorization_code / refresh_token, códigos válidos 10 min, tokens 180 días) y la plantilla de firma de
// los SDKs oficiales: `id:<data.id>;request-id:<x-request-id>;ts:<ts>;` (solo las partes presentes; data.id en
// minúsculas si es alfanumérico).
const crypto = require("node:crypto");

const MP_API = "https://api.mercadopago.com";
const MP_AUTH = "https://auth.mercadopago.com.ar/authorization";
const PAGO_MP_VENCE_MIN = 15;
const COMISION_MAX_PCT = 10;
const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ----- OAuth -----
function urlAutorizacion({ clientId, state, redirectUri }) {
  const q = new URLSearchParams({ client_id: String(clientId), response_type: "code", platform_id: "mp", state: String(state), redirect_uri: redirectUri });
  return `${MP_AUTH}?${q.toString()}`;
}
const cuerpoTokenPorCodigo = ({ clientId, clientSecret, code, redirectUri }) => ({ client_id: String(clientId), client_secret: clientSecret, code, grant_type: "authorization_code", redirect_uri: redirectUri });
const cuerpoTokenPorRefresh = ({ clientId, clientSecret, refreshToken }) => ({ client_id: String(clientId), client_secret: clientSecret, refresh_token: refreshToken, grant_type: "refresh_token" });
// `state`: "<clubId>~<nonce>.<firma>" — el clubId para saber a qué club vuelve el callback, un nonce aleatorio y una
// firma HMAC (client secret) sobre "clubId~nonce" para que nadie invente uno. Además se guarda 10 min en el club.
function nuevoState(secreto, prefijo = "") {
  const nonce = crypto.randomBytes(16).toString("hex");
  const base = `${prefijo}~${nonce}`;
  const firma = crypto.createHmac("sha256", secreto).update(base).digest("hex").slice(0, 16);
  return `${base}.${firma}`;
}
function stateValido(state, secreto) {
  const s = String(state || "");
  const punto = s.lastIndexOf(".");
  if (punto < 0) return { ok: false, prefijo: null };
  const base = s.slice(0, punto);
  const firma = s.slice(punto + 1);
  const [prefijo, nonce] = base.split("~");
  if (nonce === undefined || !/^[0-9a-f]{32}$/.test(nonce) || firma.length !== 16) return { ok: false, prefijo: null };
  const esperada = crypto.createHmac("sha256", secreto).update(base).digest("hex").slice(0, 16);
  const ok = crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada));
  return { ok, prefijo: ok ? prefijo : null };
}
// Lo que se guarda en clubs/{c}/privado/mercadopago a partir de la respuesta de /oauth/token
function tokensDeRespuesta(r, ahoraMs = Date.now()) {
  const expiresIn = Number(r.expires_in) || 180 * 24 * 3600;
  return {
    userId: r.user_id !== undefined && r.user_id !== null ? String(r.user_id) : null,
    accessToken: r.access_token || null,
    refreshToken: r.refresh_token || null,
    publicKey: r.public_key || null,
    liveMode: r.live_mode === true,
    scope: r.scope || null,
    expiraEnMs: ahoraMs + expiresIn * 1000,
  };
}

// ----- Webhook: firma -----
// x-signature: "ts=1704908010,v1=618c85..." → { ts, v1 }
function partesDeFirma(xSignature) {
  const out = {};
  String(xSignature || "")
    .split(",")
    .forEach((par) => {
      const i = par.indexOf("=");
      if (i > 0) out[par.slice(0, i).trim()] = par.slice(i + 1).trim();
    });
  return { ts: out.ts || null, v1: out.v1 || null };
}
// Plantilla oficial: id:[data.id];request-id:[x-request-id];ts:[ts]; — solo las partes que vienen
function manifiesto({ dataId, requestId, ts }) {
  let m = "";
  if (dataId !== undefined && dataId !== null && dataId !== "") m += `id:${/^[a-zA-Z0-9]+$/.test(String(dataId)) ? String(dataId).toLowerCase() : String(dataId)};`;
  if (requestId) m += `request-id:${requestId};`;
  if (ts) m += `ts:${ts};`;
  return m;
}
function firmaValida({ xSignature, xRequestId, dataId, secreto, ahoraMs = Date.now(), toleranciaMs = 5 * 60 * 1000 }) {
  if (!secreto || !xSignature) return { ok: false, motivo: "sin firma" };
  const { ts, v1 } = partesDeFirma(xSignature);
  if (!ts || !v1) return { ok: false, motivo: "firma incompleta" };
  const esperada = crypto.createHmac("sha256", secreto).update(manifiesto({ dataId, requestId: xRequestId, ts })).digest("hex");
  if (esperada.length !== v1.length || !crypto.timingSafeEqual(Buffer.from(esperada), Buffer.from(v1))) return { ok: false, motivo: "firma distinta" };
  const tsMs = Number(ts) * (String(ts).length <= 10 ? 1000 : 1);
  if (Number.isFinite(tsMs) && toleranciaMs > 0 && Math.abs(ahoraMs - tsMs) > toleranciaMs) return { ok: false, motivo: "firma vieja" };
  return { ok: true };
}
// La notificación trae data.id en el query (?data.id=… o ?id=…) y, en el cuerpo, type/action
function datosDeNotificacion(query = {}, body = {}) {
  const dataId = query["data.id"] || query.data_id || query.id || (body && body.data && body.data.id) || null;
  const tipo = query.type || query.topic || (body && body.type) || null;
  return { dataId: dataId !== null ? String(dataId) : null, tipo, accion: (body && body.action) || null, liveMode: body && body.live_mode };
}

// ----- Cuenta conectada (M1) -----
// GET /users/me: un usuario de prueba trae tags ["test_user", …] o un nickname TEST…; live_mode del token no alcanza
function esUsuarioDePrueba(me) {
  if (!me) return false;
  const tags = Array.isArray(me.tags) ? me.tags.map((t) => String(t).toLowerCase()) : [];
  return tags.includes("test_user") || /^test/i.test(String(me.nickname || ""));
}

// ----- Notificaciones (B-P3-8-2) -----
// Qué hacer con una notificación. La firma se calcula y se registra aparte, pero NUNCA se confía en el cuerpo: todo
// pago se relee de la API con el token del club (deps.leerPago(id) → objeto, o null si no existe) y se aplica solo
// si existe y su external_reference es un pagoMp de ESTE club (lo verifica deps.aplicar, que devuelve un texto para el
// log). merchant_order → deps.leerOrden(id).payments. Otros temas (plan, subscription, …) se ignoran.
// Devuelve { resultado: "ok" | "ignorado", resumen }.
const TEMAS_PAGO = ["payment", "payments"];
const TEMAS_ORDEN = ["merchant_order", "merchant_orders", "topic_merchant_order_wh"];
async function procesarNotificacion({ tipo = null, dataId = null, deps }) {
  if (!dataId) return { resultado: "ignorado", resumen: "sin data.id" };
  let ids = [];
  if (!tipo || TEMAS_PAGO.includes(tipo)) ids = [String(dataId)];
  else if (TEMAS_ORDEN.includes(tipo)) {
    const orden = await deps.leerOrden(String(dataId));
    ids = ((orden && orden.payments) || []).map((p) => p && p.id).filter((id) => id !== null && id !== undefined).map(String);
    if (!ids.length) return { resultado: "ignorado", resumen: orden ? `orden ${dataId} sin pagos` : `orden ${dataId} desconocida` };
  } else return { resultado: "ignorado", resumen: `tema ${tipo} ignorado` };
  const partes = [];
  let aplicados = 0;
  for (const id of ids) {
    const pago = await deps.leerPago(id);
    if (!pago) {
      partes.push(`pago ${id} desconocido → ignorado`);
      continue;
    }
    const r = await deps.aplicar(pago);
    aplicados += 1;
    partes.push(typeof r === "string" ? r : `pago ${id} ${pago.status}`);
  }
  return { resultado: aplicados ? "ok" : "ignorado", resumen: partes.join(" · ") };
}

// ----- Pagos ya procesados (B-P3-8b-1) -----
// Qué hacer con un pago APROBADO leído de la API para su pagoMp. MP reintenta notificaciones viejas durante días, así
// que un pago solo crea venta una vez: si ya hay una venta con ese paymentId (aunque esté anulada) o el pagoMp ya no
// está pendiente, se ignora ("ya procesado"). Excepciones:
// - "rechazado": un intento anterior fue rechazado y la persona reintentó en el mismo checkout → se aplica.
// - "vencido" sin venta: la plata entró tarde → no se aplica a la cuenta; queda como excedente para que el club la
//   devuelva o la marque (alerta "Pago de más por Mercado Pago"), nunca en silencio.
// Devuelve { accion: "aplicar" | "tardio" | "ignorar", resultado }.
function decisionPagoAprobado(pm, paymentId, { ventaConEsePago = null } = {}) {
  const id = String(paymentId);
  if (ventaConEsePago) return { accion: "ignorar", resultado: `ya procesado (venta ${ventaConEsePago})` };
  if (!pm) return { accion: "ignorar", resultado: "sin pagoMp" };
  const conVenta = !!pm.ventaNumero;
  if (!conVenta && (pm.estado === "pendiente" || pm.estado === "rechazado")) return { accion: "aplicar", resultado: null };
  if (!conVenta && pm.estado === "vencido" && !pm.devolucion) return { accion: "tardio", resultado: "pago tardío (vencido) → excedente" };
  if (pm.estado === "aprobado" && String(pm.paymentId) === id) return { accion: "ignorar", resultado: "ya aplicado" };
  return { accion: "ignorar", resultado: `ya procesado (${pm.estado || "sin estado"})` };
}

// ----- Inscripciones a torneos (P3-14 C) -----
// external_reference de un pago de inscripción: "ins_<pagoId>" (los de clubes son el id del pagoMp, sin prefijo)
const PREFIJO_INSCRIPCION = "ins_";
const referenciaInscripcion = (pagoId) => `${PREFIJO_INSCRIPCION}${pagoId}`;
const pagoIdDeReferencia = (ref) => (typeof ref === "string" && ref.startsWith(PREFIJO_INSCRIPCION) ? ref.slice(PREFIJO_INSCRIPCION.length) || null : null);
// Qué hacer con un pago aprobado para un pago de inscripción: igual que con los clubes, se aplica una sola vez
// (pendiente → aprobado); un pago ya aprobado con el mismo paymentId es "ya aplicado"; cualquier otro estado, final.
function decisionPagoInscripcion(pago, paymentId) {
  if (!pago) return { accion: "ignorar", resultado: "sin pago de inscripción" };
  if (pago.estado === "pendiente") return { accion: "aplicar", resultado: null };
  if (pago.estado === "aprobado" && String(pago.paymentId) === String(paymentId)) return { accion: "ignorar", resultado: "ya aplicado" };
  return { accion: "ignorar", resultado: `ya procesado (${pago.estado || "sin estado"})` };
}
// Comisión de Padely sobre inscripciones: configuracionPadely/facturacion.comisionTorneosPct (0 a 10, defecto 0)
const comisionTorneos = (facturacion) => {
  const n = Number(facturacion && facturacion.comisionTorneosPct);
  return Number.isFinite(n) && n >= 0 && n <= COMISION_MAX_PCT ? n : 0;
};

// ----- Ventas online (B-P3-8-1) -----
// Una venta se anula con la callable mpAnularVenta solo si está "ok", es online (cajaId null) y se cobró por Mercado Pago
function ventaAnulableOnline(venta) {
  if (!venta) return { ok: false, motivo: "La venta no existe" };
  if (venta.estado !== "ok") return { ok: false, motivo: "La venta ya está anulada" };
  if (venta.cajaId) return { ok: false, motivo: "Esa venta es de una caja: se anula desde Vender" };
  const pagos = Array.isArray(venta.pagos) ? venta.pagos : [];
  if (!venta.mpPaymentId || !pagos.length || !pagos.every((p) => p && p.medio === "mercadopago")) return { ok: false, motivo: "Solo las ventas online de Mercado Pago se anulan desde acá" };
  return { ok: true, motivo: null };
}
// Resultado de una devolución para guardar en la venta y en el pagoMp: { ok, refundId | error, monto, manual }
function devolucionDe(r, { monto = null, manual = false, por = null } = {}) {
  const base = { ok: !!(r && r.ok), monto: monto === null ? null : Number(monto) || 0, manual: !!manual, por: por || null };
  if (base.ok) return { ...base, refundId: (r && r.refundId) || null, error: null };
  return { ...base, refundId: null, error: String((r && r.error) || "sin detalle").slice(0, 300) };
}

// ----- Preferencia (Checkout Pro) -----
const comisionDe = (monto, pct) => {
  const p = Math.min(COMISION_MAX_PCT, Math.max(0, Number(pct) || 0));
  return redondear((redondear(monto) * p) / 100);
};
// ISO con offset −03:00 (MP pide fecha con zona)
function fechaMp(ms) {
  const d = new Date(ms - 3 * 60 * 60000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.000-03:00`;
}
function cuerpoPreferencia({ titulo, monto, pagoMpId, pagador = {}, notificationUrl, backUrl, comisionPct = 0, ahoraMs = Date.now(), venceMin = PAGO_MP_VENCE_MIN, descripcion = null }) {
  const total = redondear(monto);
  const fee = comisionDe(total, comisionPct);
  const body = {
    items: [{ id: pagoMpId, title: String(titulo).slice(0, 256), description: descripcion ? String(descripcion).slice(0, 256) : undefined, quantity: 1, unit_price: total, currency_id: "ARS" }],
    external_reference: pagoMpId,
    notification_url: notificationUrl,
    back_urls: { success: `${backUrl}?mp=ok`, pending: `${backUrl}?mp=pendiente`, failure: `${backUrl}?mp=error` },
    auto_return: "approved",
    expires: true,
    expiration_date_from: fechaMp(ahoraMs),
    expiration_date_to: fechaMp(ahoraMs + venceMin * 60000),
    statement_descriptor: "PADELY",
    metadata: { pago_mp_id: pagoMpId },
  };
  if (pagador && (pagador.nombre || pagador.email)) body.payer = { name: pagador.nombre || undefined, email: pagador.email || undefined };
  if (fee > 0) body.marketplace_fee = fee;
  return { body, fee, total, venceEnMs: ahoraMs + venceMin * 60000 };
}

// ----- Qué piezas de un pago siguen sin cubrir cuando llega aprobado (carrera con el mostrador) -----
// Una pieza "consumo" de la línea L para P está cubierta si algún pago congelado ya tiene esa combinación; una de
// "cancha"/"seña" para P, si P ya tiene cancha pagada. Devuelve lo que se aplica y lo que sobra (excedente).
function aplicarPiezas(cuenta, piezas = []) {
  const pagadas = new Set();
  const canchaDe = new Set();
  for (const pg of (cuenta && cuenta.pagos) || []) {
    for (const l of pg.lineas || []) {
      if (l.tipo === "consumo" && l.lineaId && l.participanteId) pagadas.add(`${l.lineaId}|${l.participanteId}`);
      if ((l.tipo === "cancha" || l.tipo === "seña") && l.participanteId) canchaDe.add(l.participanteId);
    }
  }
  const aplicadas = [];
  const sobrantes = [];
  for (const p of piezas) {
    const cubierta = p.tipo === "consumo" ? pagadas.has(`${p.lineaId}|${p.participanteId}`) : canchaDe.has(p.participanteId);
    (cubierta ? sobrantes : aplicadas).push(p);
  }
  const suma = (lista) => redondear(lista.reduce((s, p) => s + (Number(p.monto) || 0), 0));
  return { aplicadas, sobrantes, montoAplicado: suma(aplicadas), excedente: Math.max(0, suma(sobrantes)) };
}
// Número de venta online: "MP-000123"
const numeroMp = (n) => `MP-${String(Math.max(1, Math.trunc(Number(n) || 1))).padStart(6, "0")}`;


// ---------------------------------------------------------------------------
// Pase Club con "suscripción con plan" (P3-16e). Cada club tiene UN preapproval_plan en SU cuenta de MP (lo crea
// onPaseEscrito con el token del club); el jugador se suscribe desde el init_point del plan y MP crea la preapproval.
// Sin payer_email: el webhook vincula la preapproval con el socio.
// ---------------------------------------------------------------------------
const PREFIJO_REF_PASE = "pase_";
const referenciaPase = (clubId, uid) => `${PREFIJO_REF_PASE}${clubId}_${uid}`;
// uid de una referencia "pase_<clubId>_<uid>" de ESE club; null si no es de ese club
function uidDeReferenciaPase(ref, clubId) {
  const pre = `${PREFIJO_REF_PASE}${clubId}_`;
  if (typeof ref !== "string" || !clubId || !ref.startsWith(pre)) return null;
  const uid = ref.slice(pre.length);
  return /^[A-Za-z0-9_-]{1,128}$/.test(uid) ? uid : null;
}

// Cuerpo de POST/PUT /preapproval_plan
function cuerpoPlanPase({ reason, meses, precio, backUrl }) {
  return {
    reason: String(reason || "Pase Club").slice(0, 120),
    back_url: backUrl,
    auto_recurring: { frequency: Math.max(1, Math.round(Number(meses) || 1)), frequency_type: "months", transaction_amount: Math.round(Number(precio) * 100) / 100, currency_id: "ARS" },
  };
}

// Qué hay que hacer con el plan de MP del Pase: "crear" (no hay), "actualizar" (cambió precio, meses o nombre) o null
function accionPlanPase(pase, reason) {
  if (!pase || !(Number(pase.precio) > 0)) return null;
  const m = pase.mp || {};
  if (!m.planId) return "crear";
  const meses = Math.max(1, Math.round(Number(pase.meses) || 1));
  if (Number(m.precio) !== Number(pase.precio) || Number(m.meses) !== meses || (reason && m.reason !== reason)) return "actualizar";
  return null;
}

// Link del plan con la referencia del jugador (si MP la pasa a la preapproval, el webhook la usa; si no, la ignora)
function initPointConReferencia(initPoint, ref) {
  if (!initPoint) return null;
  try {
    const u = new URL(initPoint);
    if (ref) u.searchParams.set("external_reference", ref);
    return u.toString();
  } catch {
    return initPoint;
  }
}

// P3-16g: un socio que todavía está "pendiente" y quedó vinculado a una preapproval muerta (un intento fallido del
// mismo checkout: MP la cancela al rechazar el primer cobro) se puede re-vincular a la nueva. Nunca se pisa una
// autorizada; una "pending" solo la reemplaza una autorizada (la pending podría estar autorizándose en MP).
const PREAPPROVAL_MUERTA = new Set(["cancelled", "rejected", "paused"]);
function puedeReemplazarPreapproval({ socioEstado, actual, nueva }) {
  if (socioEstado !== "pendiente") return false;
  const a = String(actual || "");
  if (a === "authorized") return false;
  if (PREAPPROVAL_MUERTA.has(a)) return true;
  return nueva === "authorized";
}

// A qué socio pertenece una preapproval nueva del plan del club. Orden: external_reference (si MP la pasa),
// payer_email = email de la cuenta de Padely, y si no, el "pendiente" más reciente del club sin otra preapproval.
// socios: [{ uid, estado, solicitadoMs, preapprovalId, susEstado }]; uidPorEmail: uid de Padely con el payer_email (o null).
function elegirSocioPreapproval({ pre, clubId, socios = [], uidPorEmail = null }) {
  const porUid = new Map(socios.map((s) => [s.uid, s]));
  const preId = String((pre && pre.id) || "");
  const libre = (s) => s && (!s.preapprovalId || s.preapprovalId === preId || puedeReemplazarPreapproval({ socioEstado: s.estado, actual: s.susEstado, nueva: pre && pre.status }));
  const deRef = uidDeReferenciaPase(pre && pre.external_reference, clubId);
  if (deRef && libre(porUid.get(deRef))) return { uid: deRef, via: "external_reference" };
  if (uidPorEmail && libre(porUid.get(uidPorEmail))) return { uid: uidPorEmail, via: "payer_email" };
  const pendientes = socios.filter((s) => s.estado === "pendiente" && libre(s)).sort((a, b) => (Number(b.solicitadoMs) || 0) - (Number(a.solicitadoMs) || 0));
  if (pendientes.length) return { uid: pendientes[0].uid, via: "pendiente_reciente" };
  return null;
}

module.exports = {
  accionPlanPase,
  cuerpoPlanPase,
  elegirSocioPreapproval,
  puedeReemplazarPreapproval,
  initPointConReferencia,
  referenciaPase,
  uidDeReferenciaPase,
  COMISION_MAX_PCT,
  MP_API,
  MP_AUTH,
  PAGO_MP_VENCE_MIN,
  aplicarPiezas,
  comisionDe,
  cuerpoPreferencia,
  cuerpoTokenPorCodigo,
  cuerpoTokenPorRefresh,
  datosDeNotificacion,
  comisionTorneos,
  decisionPagoAprobado,
  decisionPagoInscripcion,
  pagoIdDeReferencia,
  referenciaInscripcion,
  devolucionDe,
  esUsuarioDePrueba,
  fechaMp,
  firmaValida,
  manifiesto,
  nuevoState,
  numeroMp,
  partesDeFirma,
  procesarNotificacion,
  stateValido,
  tokensDeRespuesta,
  urlAutorizacion,
  ventaAnulableOnline,
};
