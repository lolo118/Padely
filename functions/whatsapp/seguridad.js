// functions/whatsapp/seguridad.js — firma del webhook de Meta, verificación GET, cifrado del token de cada club,
// hash del teléfono y el link firmado para sumar las reservas del bot a una cuenta de Padely. Puro (node:crypto).
const crypto = require("node:crypto");

const igualSeguro = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// X-Hub-Signature-256: "sha256=<hex>" = HMAC-SHA256 del cuerpo CRUDO (req.rawBody) con el app secret.
// → { ok, motivo }
function firmaMetaValida(rawBody, encabezado, appSecret) {
  if (!appSecret) return { ok: false, motivo: "sin app secret" };
  if (!encabezado || typeof encabezado !== "string") return { ok: false, motivo: "sin firma" };
  if (!encabezado.startsWith("sha256=")) return { ok: false, motivo: "formato" };
  if (rawBody === undefined || rawBody === null) return { ok: false, motivo: "sin cuerpo" };
  const esperado = crypto.createHmac("sha256", appSecret).update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), "utf8")).digest("hex");
  return igualSeguro(encabezado.slice(7).toLowerCase(), esperado) ? { ok: true, motivo: null } : { ok: false, motivo: "firma distinta" };
}

// GET de verificación de la suscripción: hub.mode=subscribe, hub.verify_token=<el nuestro>, hub.challenge=<eco>.
// → el challenge a devolver (texto) o null (403)
function verificarSuscripcion(query, verifyToken) {
  const q = query || {};
  const modo = q["hub.mode"];
  const token = q["hub.verify_token"];
  const challenge = q["hub.challenge"];
  if (modo !== "subscribe" || !verifyToken || !token || !igualSeguro(token, verifyToken) || challenge === undefined) return null;
  return String(challenge);
}

// Clave de 32 bytes derivada del secreto WA_TOKEN_KEY para un uso ("token", "telefono", "link")
const clave = (secreto, uso) => crypto.createHash("sha256").update(`padely-wa:${uso}:${secreto}`).digest();

// Token de la Cloud API cifrado con AES-256-GCM → "v1.<iv>.<tag>.<datos>" (base64url). Nunca se guarda en claro.
function cifrarToken(token, secreto) {
  if (!secreto) throw new Error("cifrarToken: falta WA_TOKEN_KEY");
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", clave(secreto, "token"), iv);
  const datos = Buffer.concat([c.update(String(token), "utf8"), c.final()]);
  return ["v1", iv.toString("base64url"), c.getAuthTag().toString("base64url"), datos.toString("base64url")].join(".");
}
function descifrarToken(cifrado, secreto) {
  const [v, iv, tag, datos] = String(cifrado || "").split(".");
  if (v !== "v1" || !iv || !tag || !datos) throw new Error("descifrarToken: formato");
  const d = crypto.createDecipheriv("aes-256-gcm", clave(secreto, "token"), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(datos, "base64url")), d.final()]).toString("utf8");
}

// Solo dígitos (el wa_id de Meta ya viene así: "5493815551234")
const soloDigitos = (s) => String(s || "").replace(/\D/g, "");

// Id del chat y de la identidad del invitado: HMAC del teléfono (los números son pocos: un SHA-256 pelado se adivina).
// 24 caracteres hex: cabe en ids de documentos y en un link.
function hashTelefono(waId, secreto) {
  // Sobre la forma canónica (549…): el mismo celular argentino escrito con o sin 9 / 15 es el mismo chat e invitado
  return crypto.createHmac("sha256", clave(secreto, "telefono")).update(require("./telefonos").canonico(waId)).digest("hex").slice(0, 24);
}

// "+54 9 381 ••• 1234" — lo que ve el club y cualquiera con sesión en la grilla (el número entero va en contactosReservas)
function enmascararTelefono(waId) {
  const d = soloDigitos(waId);
  if (d.length < 6) return "•••";
  return `+${d.slice(0, d.startsWith("549") ? 3 : 2)} ••• ${d.slice(-4)}`;
}

// Link firmado para sumar a una cuenta las reservas del bot de ESE teléfono en ESE club. Vence (por defecto 30 días).
function firmarVinculo({ clubId, hash, venceMs }, secreto) {
  const base = `${clubId}.${hash}.${venceMs}`;
  return crypto.createHmac("sha256", clave(secreto, "link")).update(base).digest("base64url").slice(0, 32);
}
function vinculoValido({ clubId, hash, venceMs, firma }, secreto, ahoraMs = Date.now()) {
  if (!clubId || !hash || !firma || !Number.isFinite(Number(venceMs))) return { ok: false, motivo: "incompleto" };
  if (!igualSeguro(firma, firmarVinculo({ clubId, hash, venceMs: Number(venceMs) }, secreto))) return { ok: false, motivo: "firma" };
  if (Number(venceMs) < ahoraMs) return { ok: false, motivo: "vencido" };
  return { ok: true, motivo: null };
}

module.exports = { firmaMetaValida, verificarSuscripcion, cifrarToken, descifrarToken, hashTelefono, enmascararTelefono, firmarVinculo, vinculoValido, soloDigitos };
