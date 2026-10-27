// netlify/edge-functions/og.js — Open Graph por página (P3-12). La app es una SPA: WhatsApp, Facebook, Telegram y
// compañía no ejecutan JS y ven siempre el index.html genérico. Para /club/:id y /torneos/:id, SOLO cuando quien pide
// es un bot de vista previa, se lee el club o el torneo de Firestore (lectura pública por REST) y se reemplazan
// título, descripción e imagen en el HTML. A las personas (y ante cualquier error) se les sirve la página tal cual.
const BOTS = /facebookexternalhit|facebot|whatsapp|twitterbot|telegrambot|slackbot|discordbot|linkedinbot|skypeuripreview|pinterest|embedly|vkshare|redditbot|applebot|googlebot|bingbot/i;
const PROYECTO = "padely-dev";

const escapar = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const valor = (campo) => {
  if (!campo) return null;
  if ("stringValue" in campo) return campo.stringValue;
  if ("mapValue" in campo) return Object.fromEntries(Object.entries(campo.mapValue.fields || {}).map(([k, v]) => [k, valor(v)]));
  if ("integerValue" in campo) return Number(campo.integerValue);
  if ("booleanValue" in campo) return campo.booleanValue;
  return null;
};

async function leer(ruta) {
  const r = await fetch(`https://firestore.googleapis.com/v1/projects/${PROYECTO}/databases/(default)/documents/${ruta}`, { signal: AbortSignal.timeout(2500) });
  if (!r.ok) return null;
  const doc = await r.json();
  return Object.fromEntries(Object.entries(doc.fields || {}).map(([k, v]) => [k, valor(v)]));
}

const fechaCorta = (f) => {
  const [y, m, d] = String(f || "").split("-").map(Number);
  if (!y || !m || !d) return "";
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("es-AR", { day: "numeric", month: "long", timeZone: "UTC" });
};

function metaDe(url, datos) {
  const [, tipo] = url.pathname.split("/");
  if (tipo === "club") {
    const lugar = [datos.ciudad, datos.provincia].filter(Boolean).join(", ");
    return {
      titulo: `${datos.nombre || "Club"} · Reservá tu cancha en Padely`,
      descripcion: `${lugar ? `${lugar}. ` : ""}Mirá los turnos libres y reservá tu cancha de pádel en ${datos.nombre || "el club"}.`,
      imagen: datos.logoUrl || null,
    };
  }
  const lugar = datos.club && datos.club.estado === "aceptado" ? datos.club.nombre : datos.sede || datos.ciudad || null;
  const fechas = datos.fechaInicio ? (datos.fechaFin && datos.fechaFin !== datos.fechaInicio ? `del ${fechaCorta(datos.fechaInicio)} al ${fechaCorta(datos.fechaFin)}` : `el ${fechaCorta(datos.fechaInicio)}`) : "";
  return {
    titulo: `${datos.nombre || "Torneo"} · Padely`,
    descripcion: `Torneo de pádel${fechas ? ` ${fechas}` : ""}${lugar ? ` en ${lugar}` : ""}.${datos.inscripcionAbierta ? " Inscripción abierta." : ""}`,
    imagen: null,
  };
}

export default async (request, context) => {
  let respuesta = null;
  try {
    if (!BOTS.test(request.headers.get("user-agent") || "")) return context.next();
    const url = new URL(request.url);
    const [, tipo, id] = url.pathname.split("/");
    if (!id || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) return context.next();
    let datos;
    [respuesta, datos] = await Promise.all([context.next(), leer(`${tipo === "club" ? "clubs" : "tournaments"}/${id}`).catch(() => null)]);
    if (!datos) return respuesta;
    const html = await respuesta.text();
    const m = metaDe(url, datos);
    const titulo = escapar(m.titulo);
    const descripcion = escapar(m.descripcion);
    let salida = html
      .replace(/<title>[^<]*<\/title>/, `<title>${titulo}</title>`)
      .replace(/(<meta name="description" content=")[^"]*(")/, `$1${descripcion}$2`)
      .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${titulo}$2`)
      .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${descripcion}$2`)
      .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${titulo}$2`)
      .replace(/(<meta name="twitter:description" content=")[^"]*(")/, `$1${descripcion}$2`)
      .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${escapar(url.href)}$2`);
    if (m.imagen && /^https:\/\//.test(m.imagen)) {
      salida = salida
        .replace(/(<meta property="og:image" content=")[^"]*(")/, `$1${escapar(m.imagen)}$2`)
        .replace(/(<meta name="twitter:image" content=")[^"]*(")/, `$1${escapar(m.imagen)}$2`)
        .replace(/\s*<meta property="og:image:width"[^>]*>\s*<meta property="og:image:height"[^>]*>/, "");
    }
    const headers = new Headers(respuesta.headers);
    headers.delete("content-length");
    return new Response(salida, { status: respuesta.status, headers });
  } catch {
    return respuesta && !respuesta.bodyUsed ? respuesta : context.next();
  }
};

export const config = { path: ["/club/*", "/torneos/*"] };
