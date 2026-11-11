// node --test functions/whatsappWebhook.test.js — webhook de WhatsApp (firma, verificación, idempotencia, ruteo),
// los mensajes de la Graph API y el cifrado del token. Secretos FALSOS de prueba.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const seg = require("./whatsapp/seguridad");
const { eventosDePayload, crearManejadorWebhook } = require("./whatsapp/webhook");
const graph = require("./whatsapp/graph");

const APP_SECRET = "app-secret-de-prueba-no-es-real";
const VERIFY = "verify-token-de-prueba";
const CLAVE = "clave-de-prueba-no-es-real-0123456789";

const mensaje = (id, extra = {}) => ({ from: "5493815551234", id, timestamp: "1762970000", type: "text", text: { body: "hola" }, ...extra });
const payload = (changes) => ({ object: "whatsapp_business_account", entry: [{ id: "WABA1", changes }] });
const cambioMensajes = (msgs, pnid = "PN1") => ({ field: "messages", value: { messaging_product: "whatsapp", metadata: { display_phone_number: "15550001111", phone_number_id: pnid }, contacts: [{ profile: { name: "Sebas" }, wa_id: "5493815551234" }], messages: msgs } });
const firmar = (raw, secreto = APP_SECRET) => `sha256=${crypto.createHmac("sha256", secreto).update(raw).digest("hex")}`;

function req({ method = "POST", body = null, firma = undefined, query = {}, raw = undefined }) {
  const rawBody = raw !== undefined ? raw : Buffer.from(JSON.stringify(body));
  const headers = { "x-hub-signature-256": firma === undefined ? firmar(rawBody) : firma };
  return { method, body, query, rawBody, get: (h) => headers[h.toLowerCase()] };
}
function res() {
  const r = { code: null, cuerpo: null };
  r.status = (c) => {
    r.code = c;
    return r;
  };
  r.type = () => r;
  r.send = (b) => {
    r.cuerpo = b;
    return r;
  };
  return r;
}
function manejador({ rutas = { PN1: "club1" }, falla = false } = {}) {
  const guardados = new Map();
  const m = crearManejadorWebhook({
    appSecret: () => APP_SECRET,
    verifyToken: () => VERIFY,
    rutear: async (pnid) => rutas[pnid] || null,
    guardarEvento: async (ev, clubId) => {
      if (falla) throw new Error("firestore caído");
      if (guardados.has(ev.id)) return false;
      guardados.set(ev.id, { ...ev, clubId });
      return true;
    },
  });
  return { m, guardados };
}

test("firma X-Hub-Signature-256: válida, alterada, otro secreto, ausente", () => {
  const raw = Buffer.from('{"a":1}');
  assert.deepEqual(seg.firmaMetaValida(raw, firmar(raw), APP_SECRET), { ok: true, motivo: null });
  assert.equal(seg.firmaMetaValida(Buffer.from('{"a":2}'), firmar(raw), APP_SECRET).motivo, "firma distinta");
  assert.equal(seg.firmaMetaValida(raw, firmar(raw, "otro"), APP_SECRET).ok, false);
  assert.equal(seg.firmaMetaValida(raw, undefined, APP_SECRET).motivo, "sin firma");
  assert.equal(seg.firmaMetaValida(raw, "md5=abc", APP_SECRET).motivo, "formato");
  assert.equal(seg.firmaMetaValida(raw, firmar(raw), "").motivo, "sin app secret");
  assert.equal(seg.firmaMetaValida(raw, firmar(raw).toUpperCase().replace("SHA256=", "sha256="), APP_SECRET).ok, true);
});

test("GET de verificación: devuelve el challenge solo con el verify token correcto", async () => {
  const { m } = manejador();
  const ok = res();
  await m(req({ method: "GET", query: { "hub.mode": "subscribe", "hub.verify_token": VERIFY, "hub.challenge": "1158201444" } }), ok);
  assert.deepEqual([ok.code, ok.cuerpo], [200, "1158201444"]);
  const mal = res();
  await m(req({ method: "GET", query: { "hub.mode": "subscribe", "hub.verify_token": "otro", "hub.challenge": "1" } }), mal);
  assert.equal(mal.code, 403);
  assert.equal(seg.verificarSuscripcion({ "hub.mode": "unsubscribe", "hub.verify_token": VERIFY, "hub.challenge": "1" }, VERIFY), null);
});

test("eventos del payload: texto, botón, lista, ecos de la app (coexistencia); los estados se ignoran", () => {
  const p = payload([
    cambioMensajes([
      mensaje("wamid.1"),
      mensaje("wamid.2", { type: "interactive", text: undefined, interactive: { type: "button_reply", button_reply: { id: "dia:hoy", title: "Hoy" } } }),
      mensaje("wamid.3", { type: "interactive", text: undefined, interactive: { type: "list_reply", list_reply: { id: "hora:20:00", title: "20:00" } } }),
      mensaje("wamid.4", { type: "image", text: undefined, image: { id: "x" } }),
    ]),
    { field: "messages", value: { metadata: { phone_number_id: "PN1" }, statuses: [{ id: "wamid.9", status: "delivered" }] } },
    { field: "smb_message_echoes", value: { messaging_product: "whatsapp", metadata: { phone_number_id: "PN1" }, message_echoes: [{ from: "15550001111", to: "5493815551234", id: "wamid.eco1", timestamp: "1762970100", type: "text", text: { body: "Hola, soy del club" } }] } },
  ]);
  const ev = eventosDePayload(p);
  assert.equal(ev.length, 5);
  assert.deepEqual(ev[0], { tipo: "mensaje", id: "wamid.1", phoneNumberId: "PN1", waId: "5493815551234", timestamp: 1762970000, tipoMensaje: "text", texto: "hola", opcionId: null, nombrePerfil: "Sebas" });
  assert.deepEqual([ev[1].opcionId, ev[1].texto], ["dia:hoy", "Hoy"]);
  assert.equal(ev[2].opcionId, "hora:20:00");
  assert.deepEqual([ev[3].tipoMensaje, ev[3].texto], ["image", null]);
  assert.deepEqual([ev[4].tipo, ev[4].waId, ev[4].id], ["eco", "5493815551234", "wamid.eco1"]);
  assert.deepEqual(eventosDePayload({ object: "page" }), []);
});

test("POST: firma inválida → 401 sin guardar nada", async () => {
  const { m, guardados } = manejador();
  const r = res();
  await m(req({ body: payload([cambioMensajes([mensaje("wamid.1")])]), firma: "sha256=00" }), r);
  assert.equal(r.code, 401);
  assert.equal(guardados.size, 0);
});

test("POST: idempotente por id de mensaje (Meta reintenta) y rutea por phone_number_id", async () => {
  const { m, guardados } = manejador({ rutas: { PN1: "club1", PN2: "club2" } });
  const body = payload([cambioMensajes([mensaje("wamid.1"), mensaje("wamid.2")]), cambioMensajes([mensaje("wamid.3")], "PN2"), cambioMensajes([mensaje("wamid.4")], "PN_DESCONOCIDO")]);
  const r1 = res();
  assert.deepEqual(await m(req({ body }), r1), { nuevos: 3, duplicados: 0, ignorados: 1 });
  assert.equal(r1.code, 200);
  const r2 = res();
  assert.deepEqual(await m(req({ body }), r2), { nuevos: 0, duplicados: 3, ignorados: 1 });
  assert.equal(r2.code, 200);
  assert.equal(guardados.get("wamid.3").clubId, "club2");
  assert.equal(guardados.size, 3);
});

test("POST: si no se puede guardar, 500 (Meta reintenta; lo guardado no se repite)", async () => {
  const { m } = manejador({ falla: true });
  const r = res();
  await m(req({ body: payload([cambioMensajes([mensaje("wamid.1")])]) }), r);
  assert.equal(r.code, 500);
});

test("mensajes de la Graph API: botones, lista (máx. 10 filas), CTA y límites de largo", async () => {
  const b = graph.payloadBotones("549381", "¿Para qué día?", [{ id: "a", titulo: "Hoy" }, { id: "b", titulo: "Mañana" }, { id: "c", titulo: "Otro día" }, { id: "d", titulo: "Sobra" }]);
  assert.equal(b.interactive.action.buttons.length, 3);
  assert.equal(b.interactive.type, "button");
  assert.equal(graph.payloadBotones("1", "x", [{ id: "a", titulo: "Un título larguísimo de botón" }]).interactive.action.buttons[0].reply.title.length, 20);
  const filas = Array.from({ length: 14 }, (_, i) => ({ id: `f${i}`, titulo: `Fila con un título demasiado largo ${i}`, descripcion: "d".repeat(100) }));
  const l = graph.payloadLista("1", "Elegí", "Ver horarios del día", [{ filas: filas.slice(0, 7) }, { filas: filas.slice(7) }]);
  const rows = l.interactive.action.sections.flatMap((s) => s.rows);
  assert.equal(rows.length, 10);
  assert.ok(rows.every((r) => Array.from(r.title).length <= 24 && Array.from(r.description).length <= 72));
  assert.ok(l.interactive.action.sections.every((s) => s.title));
  assert.equal(l.interactive.action.button.length, 20);
  const c = graph.payloadCtaUrl("1", "Pagá la seña", "Pagar la seña", "https://mp.example/x");
  assert.deepEqual(c.interactive.action, { name: "cta_url", parameters: { display_text: "Pagar la seña", url: "https://mp.example/x" } });
  assert.equal(graph.payloadTexto("1", "hola").text.body, "hola");
  assert.match(graph.GRAPH_API_VERSION, /^v\d+\.0$/);

  // Sender real con un fetch falso: URL con versión fija, token en el header y el id del mensaje de vuelta
  const llamadas = [];
  const fetchFalso = async (url, init) => {
    llamadas.push({ url, init });
    return { ok: true, status: 200, text: async () => JSON.stringify({ messages: [{ id: "wamid.out1" }] }) };
  };
  const s = graph.crearSender({ phoneNumberId: "PN1", token: "TOKEN_FALSO", fetchImpl: fetchFalso });
  assert.deepEqual(await s.texto("549", "hola"), { id: "wamid.out1" });
  assert.equal(llamadas[0].url, `https://graph.facebook.com/${graph.GRAPH_API_VERSION}/PN1/messages`);
  assert.equal(llamadas[0].init.headers.Authorization, "Bearer TOKEN_FALSO");
  const sMal = graph.crearSender({ phoneNumberId: "PN1", token: "T", fetchImpl: async () => ({ ok: false, status: 400, text: async () => JSON.stringify({ error: { code: 131047, message: "Re-engagement message" } }) }) });
  await assert.rejects(sMal.texto("549", "x"), (err) => err.code === 131047 && err.status === 400);
});

test("token cifrado (AES-256-GCM), hash del teléfono, máscara y link firmado", () => {
  const c = seg.cifrarToken("EAAG-token-falso", CLAVE);
  assert.match(c, /^v1\./);
  assert.ok(!c.includes("EAAG"));
  assert.equal(seg.descifrarToken(c, CLAVE), "EAAG-token-falso");
  assert.throws(() => seg.descifrarToken(c, "otra-clave"));
  assert.notEqual(seg.cifrarToken("x", CLAVE), seg.cifrarToken("x", CLAVE)); // iv aleatorio

  const h = seg.hashTelefono("5493815551234", CLAVE);
  assert.match(h, /^[0-9a-f]{24}$/);
  assert.equal(seg.hashTelefono("+54 9 381 555-1234", CLAVE), h);
  assert.notEqual(seg.hashTelefono("5493815551234", "otra"), h);
  assert.equal(seg.enmascararTelefono("5493815551234"), "+549 ••• 1234");
  assert.equal(seg.enmascararTelefono("15550001111"), "+15 ••• 1111");

  const venceMs = Date.UTC(2026, 11, 12);
  const firma = seg.firmarVinculo({ clubId: "club1", hash: h, venceMs }, CLAVE);
  const ahora = Date.UTC(2026, 10, 12);
  assert.deepEqual(seg.vinculoValido({ clubId: "club1", hash: h, venceMs, firma }, CLAVE, ahora), { ok: true, motivo: null });
  assert.equal(seg.vinculoValido({ clubId: "club2", hash: h, venceMs, firma }, CLAVE, ahora).motivo, "firma");
  assert.equal(seg.vinculoValido({ clubId: "club1", hash: h, venceMs: venceMs + 1, firma }, CLAVE, ahora).motivo, "firma");
  assert.equal(seg.vinculoValido({ clubId: "club1", hash: h, venceMs, firma }, CLAVE, venceMs + 1).motivo, "vencido");
  assert.equal(seg.vinculoValido({ clubId: "club1", hash: h, venceMs }, CLAVE, ahora).motivo, "incompleto");
});
