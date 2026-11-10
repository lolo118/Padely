// functions/fichaje.js — cripto del fichaje de empleados (sin Firestore, para poder testearlo):
// - el PIN de 4 dígitos se guarda como scrypt(pin, salt del club) en clubs/{c}/privado/fichaje (ningún cliente lo
//   lee). La sal es por club y aleatoria; como los PINs son únicos por club, alcanza una sola sal y fichar es una
//   sola derivación + comparación.
// - el QR de la caja lleva un token corto firmado con HMAC-SHA256 (clave aleatoria por club, también en
//   privado/fichaje): "<vence en segundos, base36>.<firma base64url truncada>". Vale QR_TOKEN_SEG segundos.
// Nada de esto necesita un secreto de Secret Manager: sal y clave nacen la primera vez y viven del lado servidor.
const crypto = require("node:crypto");

const SCRYPT_LARGO = 32;
const FIRMA_LARGO = 22; // 22 caracteres base64url = 132 bits

const nuevoSecreto = () => crypto.randomBytes(32).toString("base64url");

function hashPin(pin, salt) {
  if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) throw new Error("PIN inválido");
  if (!salt) throw new Error("Falta la sal");
  return crypto.scryptSync(pin, `padely-fichaje:${salt}`, SCRYPT_LARGO).toString("base64url");
}

function mismoTexto(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// pines: { [empleadoId]: hash }; activos: Set de ids activos → ids cuyo hash coincide con el del PIN
function empleadosConPin(pines, hash, activos = null) {
  return Object.entries(pines || {})
    .filter(([id, h]) => (!activos || activos.has(id)) && typeof h === "string" && mismoTexto(h, hash))
    .map(([id]) => id);
}

const firma = (clave, clubId, venceSeg) => crypto.createHmac("sha256", String(clave)).update(`fichaje-qr|${clubId}|${venceSeg}`).digest("base64url").slice(0, FIRMA_LARGO);

function firmarTokenQr(clubId, clave, venceSeg) {
  return `${Number(venceSeg).toString(36)}.${firma(clave, clubId, venceSeg)}`;
}

// → { ok: true } | { ok: false, motivo: 'formato'|'firma'|'vencido' }
function verificarTokenQr(clubId, clave, token, ahoraMs) {
  const m = /^([0-9a-z]{1,10})\.([A-Za-z0-9_-]{22})$/.exec(String(token || ""));
  if (!m) return { ok: false, motivo: "formato" };
  const venceSeg = parseInt(m[1], 36);
  if (!Number.isFinite(venceSeg)) return { ok: false, motivo: "formato" };
  if (!mismoTexto(firma(clave, clubId, venceSeg), m[2])) return { ok: false, motivo: "firma" };
  if (venceSeg * 1000 < ahoraMs) return { ok: false, motivo: "vencido" };
  return { ok: true, venceSeg };
}

module.exports = { nuevoSecreto, hashPin, empleadosConPin, firmarTokenQr, verificarTokenQr };
