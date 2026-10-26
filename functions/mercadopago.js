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

module.exports = {
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
  devolucionDe,
  fechaMp,
  firmaValida,
  manifiesto,
  nuevoState,
  numeroMp,
  partesDeFirma,
  stateValido,
  tokensDeRespuesta,
  urlAutorizacion,
  ventaAnulableOnline,
};
