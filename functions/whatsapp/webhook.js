// functions/whatsapp/webhook.js — el webhook de la WhatsApp Cloud API, sin Firestore (todo entra por `deps`).
//
// GET: verificación de la suscripción (hub.*). POST: firma X-Hub-Signature-256 sobre req.rawBody; si no es válida, 401
// y no se mira nada más. Cada mensaje entrante (campo "messages") y cada eco de lo que el club escribió desde la app
// WhatsApp Business (campo "smb_message_echoes", coexistencia) se rutea por metadata.phone_number_id → clubId y se
// GUARDA una sola vez por id de mensaje (deps.guardarEvento crea el documento solo si no existe: idempotencia ante los
// reintentos de Meta). Se responde 200 enseguida; el trabajo pesado (la conversación) lo hace un trigger aparte sobre
// ese documento, con los errores registrados. Los estados (sent/delivered/read) se ignoran.

// Extrae los eventos que nos interesan de un POST de Meta → [{ tipo: "mensaje" | "eco", id, phoneNumberId, waId, ... }]
function eventosDePayload(body) {
  const eventos = [];
  if (!body || body.object !== "whatsapp_business_account" || !Array.isArray(body.entry)) return eventos;
  for (const entry of body.entry) {
    for (const change of (entry && entry.changes) || []) {
      const v = (change && change.value) || {};
      const phoneNumberId = v.metadata && v.metadata.phone_number_id ? String(v.metadata.phone_number_id) : null;
      if (!phoneNumberId) continue;
      if (change.field === "messages") {
        const nombres = {};
        (v.contacts || []).forEach((c) => {
          if (c && c.wa_id) nombres[String(c.wa_id)] = (c.profile && c.profile.name) || null;
        });
        for (const m of v.messages || []) {
          if (!m || !m.id || !m.from) continue;
          let texto = null;
          let opcionId = null;
          if (m.type === "text") texto = (m.text && m.text.body) || "";
          else if (m.type === "interactive" && m.interactive) {
            const r = m.interactive.button_reply || m.interactive.list_reply || null;
            if (r) {
              opcionId = r.id || null;
              texto = r.title || null;
            }
          } else if (m.type === "button" && m.button) {
            // Botón de una plantilla (cuando haya plantillas)
            opcionId = m.button.payload || null;
            texto = m.button.text || null;
          }
          eventos.push({ tipo: "mensaje", id: String(m.id), phoneNumberId, waId: String(m.from), timestamp: Number(m.timestamp) || null, tipoMensaje: m.type || null, texto, opcionId, nombrePerfil: nombres[String(m.from)] || null });
        }
      } else if (change.field === "smb_message_echoes") {
        for (const m of v.message_echoes || []) {
          if (!m || !m.id || !m.to) continue;
          eventos.push({ tipo: "eco", id: String(m.id), phoneNumberId, waId: String(m.to), timestamp: Number(m.timestamp) || null, tipoMensaje: m.type || null });
        }
      }
    }
  }
  return eventos;
}

// deps: { appSecret(), verifyToken(), rutear(phoneNumberId) → Promise<clubId|null>, guardarEvento(evento, clubId) →
// Promise<boolean (true = nuevo)>, logger }
function crearManejadorWebhook(deps) {
  const log = deps.logger || { info() {}, warn() {}, error() {} };
  return async function manejar(req, res) {
    if (req.method === "GET") {
      const challenge = require("./seguridad").verificarSuscripcion(req.query, deps.verifyToken());
      if (challenge === null) {
        res.status(403).send("forbidden");
        return;
      }
      res.status(200).type("text/plain").send(challenge);
      return;
    }
    if (req.method !== "POST") {
      res.status(405).send("method not allowed");
      return;
    }
    const firma = require("./seguridad").firmaMetaValida(req.rawBody, req.get ? req.get("x-hub-signature-256") : req.headers && req.headers["x-hub-signature-256"], deps.appSecret());
    if (!firma.ok) {
      log.warn(`waWebhook: firma ${firma.motivo}`);
      res.status(401).send("firma inválida");
      return;
    }
    let resumen = { nuevos: 0, duplicados: 0, ignorados: 0 };
    try {
      const eventos = eventosDePayload(req.body);
      const rutas = new Map();
      for (const ev of eventos) {
        if (!rutas.has(ev.phoneNumberId)) rutas.set(ev.phoneNumberId, await deps.rutear(ev.phoneNumberId));
        const clubId = rutas.get(ev.phoneNumberId);
        if (!clubId) {
          resumen.ignorados += 1;
          continue;
        }
        if (await deps.guardarEvento(ev, clubId)) resumen.nuevos += 1;
        else resumen.duplicados += 1;
      }
    } catch (err) {
      // No se pudo GUARDAR (Firestore caído): 500 para que Meta reintente el lote; lo ya guardado no se repite
      // (idempotente por id). Los errores de la conversación nunca llegan acá: corren después, en el trigger.
      log.error(`waWebhook: no se pudo guardar el lote: ${err && err.message ? err.message : err}`);
      res.status(500).send("error");
      return { ...resumen, error: true };
    }
    if (resumen.nuevos || resumen.duplicados || resumen.ignorados) log.info(`waWebhook: ${JSON.stringify(resumen)}`);
    res.status(200).send("ok");
    return resumen;
  };
}

module.exports = { eventosDePayload, crearManejadorWebhook };
