// functions/whatsapp/graph.js — envío de mensajes por la WhatsApp Cloud API (Graph API de Meta).
// POST https://graph.facebook.com/{GRAPH_API_VERSION}/{phoneNumberId}/messages con el token del número del club.
// Solo mensajes libres e interactivos (texto, botones de respuesta, lista, botón con link): se mandan dentro de la
// ventana de atención de 24 h que abre el mensaje del cliente. Las plantillas quedan para más adelante (docs/WHATSAPP.md).
//
// Los "payload" son puros (los tests los revisan) y respetan los límites de Meta (leídos el 2026-11-11):
//   botones: hasta 3, título ≤ 20, cuerpo ≤ 1024 · lista: hasta 10 filas en total, título de fila ≤ 24, descripción ≤ 72,
//   botón ≤ 20, título de sección ≤ 24, cuerpo ≤ 4096 · cta_url: display_text ≤ 20, cuerpo ≤ 1024 · texto ≤ 4096.
// crearSender() es inyectable: los tests y el simulador usan un sender falso con la misma interfaz.

// Versión fija de la Graph API (v26.0 salió el 2026-07-29; ver docs/WHATSAPP.md). Cambiarla es una decisión explícita.
const GRAPH_API_VERSION = "v26.0";
const GRAPH_URL = "https://graph.facebook.com";

const LIM = { boton: 20, botones: 3, cuerpoInteractivo: 1024, cuerpoLista: 4096, texto: 4096, fila: 24, descripcion: 72, filas: 10, botonLista: 20, seccion: 24, cta: 20, idFila: 200 };

// Corta a n caracteres (contando caracteres, no bytes) con "…" si sobra
function cortar(s, n) {
  const arr = Array.from(String(s == null ? "" : s));
  return arr.length <= n ? arr.join("") : `${arr.slice(0, n - 1).join("")}…`;
}

const base = (to) => ({ messaging_product: "whatsapp", recipient_type: "individual", to: String(to) });

function payloadTexto(to, body) {
  return { ...base(to), type: "text", text: { preview_url: false, body: cortar(body, LIM.texto) } };
}

// botones: [{ id, titulo }] (máx. 3)
function payloadBotones(to, body, botones) {
  const lista = (botones || []).slice(0, LIM.botones);
  if (!lista.length) throw new Error("payloadBotones: al menos un botón");
  return {
    ...base(to),
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: cortar(body, LIM.cuerpoInteractivo) },
      action: { buttons: lista.map((b) => ({ type: "reply", reply: { id: cortar(b.id, 256), title: cortar(b.titulo, LIM.boton) } })) },
    },
  };
}

// secciones: [{ titulo?, filas: [{ id, titulo, descripcion? }] }] — hasta 10 filas sumando todas las secciones
function payloadLista(to, body, textoBoton, secciones) {
  let restantes = LIM.filas;
  const sections = [];
  for (const s of secciones || []) {
    const filas = (s.filas || []).slice(0, restantes);
    restantes -= filas.length;
    if (!filas.length) continue;
    sections.push({
      ...(s.titulo ? { title: cortar(s.titulo, LIM.seccion) } : {}),
      rows: filas.map((f) => ({ id: cortar(f.id, LIM.idFila), title: cortar(f.titulo, LIM.fila), ...(f.descripcion ? { description: cortar(f.descripcion, LIM.descripcion) } : {}) })),
    });
    if (restantes <= 0) break;
  }
  if (!sections.length) throw new Error("payloadLista: al menos una fila");
  // Con más de una sección, Meta exige título en todas
  if (sections.length > 1) sections.forEach((s, i) => { if (!s.title) s.title = `Opciones ${i + 1}`; });
  return {
    ...base(to),
    type: "interactive",
    interactive: { type: "list", body: { text: cortar(body, LIM.cuerpoLista) }, action: { button: cortar(textoBoton, LIM.botonLista), sections } },
  };
}

function payloadCtaUrl(to, body, textoBoton, url) {
  return {
    ...base(to),
    type: "interactive",
    interactive: { type: "cta_url", body: { text: cortar(body, LIM.cuerpoInteractivo) }, action: { name: "cta_url", parameters: { display_text: cortar(textoBoton, LIM.cta), url: String(url) } } },
  };
}

// Sender real. fetchImpl se inyecta en los tests; nunca registra el token.
function crearSender({ phoneNumberId, token, fetchImpl = globalThis.fetch, version = GRAPH_API_VERSION, logger = null }) {
  if (!phoneNumberId || !token) throw new Error("crearSender: phoneNumberId y token");
  const url = `${GRAPH_URL}/${version}/${encodeURIComponent(phoneNumberId)}/messages`;
  async function enviar(payload) {
    const res = await fetchImpl(url, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
    const txt = await res.text();
    let json = null;
    try {
      json = txt ? JSON.parse(txt) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const e = json && json.error ? json.error : {};
      const err = new Error(`WhatsApp ${res.status}${e.code ? ` (${e.code})` : ""}: ${e.message || "error"}`);
      err.status = res.status;
      err.code = e.code || null;
      if (logger) logger.error(`whatsapp: envío rechazado ${res.status} ${e.code || ""}`);
      throw err;
    }
    return { id: json && json.messages && json.messages[0] ? json.messages[0].id : null };
  }
  return {
    texto: (to, body) => enviar(payloadTexto(to, body)),
    botones: (to, body, botones) => enviar(payloadBotones(to, body, botones)),
    lista: (to, body, textoBoton, secciones) => enviar(payloadLista(to, body, textoBoton, secciones)),
    ctaUrl: (to, body, textoBoton, link) => enviar(payloadCtaUrl(to, body, textoBoton, link)),
    // Marca como leído el mensaje entrante (los dos tildes azules)
    leido: (messageId) => enviar({ messaging_product: "whatsapp", status: "read", message_id: String(messageId) }),
  };
}

// Sender falso para tests y simulador: guarda lo que se mandó (y lo imprime si se pasa `imprimir`)
function crearSenderFalso({ imprimir = null } = {}) {
  const enviados = [];
  const reg = (tipo, payload) => {
    enviados.push({ tipo, payload });
    if (imprimir) imprimir(tipo, payload);
    return Promise.resolve({ id: `wamid.falso.${enviados.length}` });
  };
  return {
    enviados,
    texto: (to, body) => reg("texto", payloadTexto(to, body)),
    botones: (to, body, botones) => reg("botones", payloadBotones(to, body, botones)),
    lista: (to, body, textoBoton, secciones) => reg("lista", payloadLista(to, body, textoBoton, secciones)),
    ctaUrl: (to, body, textoBoton, link) => reg("cta", payloadCtaUrl(to, body, textoBoton, link)),
    leido: () => Promise.resolve({ id: null }),
  };
}

module.exports = { GRAPH_API_VERSION, GRAPH_URL, LIM, cortar, payloadTexto, payloadBotones, payloadLista, payloadCtaUrl, crearSender, crearSenderFalso };
