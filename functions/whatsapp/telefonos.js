// functions/whatsapp/telefonos.js — los números de Argentina en la WhatsApp Cloud API.
//
// Meta manda el wa_id de un celular argentino con el 9 de móvil: "549" + área + número (13 dígitos, p. ej.
// 5493855877935). Pero al CONTESTAR, la API (sobre todo el número de prueba, con su lista de destinatarios
// permitidos) a menudo solo acepta "54" + área + número (sin el 9) o el formato viejo "54" + área + "15" + número, y
// rechaza el 549… con el error 131030 ("Recipient phone number not in allowed list").
//
// - canonico(waId): una sola forma por persona (la de Meta, 549…), para que el id del chat y la identidad del
//   invitado (hashTelefono) no se partan según cómo llegó el número.
// - alternativas(waId): a quién probar, en orden, si el primer envío falla con 131030.

const soloDigitos = (s) => String(s || "").replace(/\D/g, "");

// Error de Meta que dispara el reintento con otros formatos
const CODIGOS_DESTINATARIO = new Set([131030]);
const esErrorDeDestinatario = (err) => !!err && CODIGOS_DESTINATARIO.has(Number(err.code));

// "54 9 AAA XXXXXXX" (13) · "54 AAA XXXXXXX" (12) · "54 AAA 15 XXXXXXX" (14) → "549AAAXXXXXXX". Las áreas tienen 2 a 4
// dígitos y el abonado 6 a 8: en total siempre 10 dígitos después del 54 (sin el 9 ni el 15).
function canonico(waId) {
  const d = soloDigitos(waId);
  if (!d.startsWith("54")) return d;
  const resto = d.slice(2);
  if (resto.length === 11 && resto.startsWith("9")) return d; // 549 + 10
  if (resto.length === 10) return `549${resto}`; // 54 + 10, sin el 9
  if (resto.length === 12) {
    // 54 + área (2–4) + 15 + número: el "15" va después del área
    for (const area of [2, 3, 4]) {
      if (resto.slice(area, area + 2) === "15") return `549${resto.slice(0, area)}${resto.slice(area + 2)}`;
    }
  }
  return d;
}

// Formatos a probar para mandarle a un celular argentino, en orden: el que llegó, sin el 9, y con 15 (áreas de 2, 3 y
// 4 dígitos). Para cualquier otro número, solo el que llegó.
function alternativas(waId) {
  const original = soloDigitos(waId);
  const c = canonico(original);
  if (!/^549\d{10}$/.test(c)) return [original];
  const diez = c.slice(3);
  const lista = [original, c, `54${diez}`, ...[2, 3, 4].map((a) => `54${diez.slice(0, a)}15${diez.slice(a)}`)];
  return [...new Set(lista)];
}

module.exports = { soloDigitos, canonico, alternativas, esErrorDeDestinatario, CODIGOS_DESTINATARIO };
