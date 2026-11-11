// Celulares argentinos en la WhatsApp Cloud API: forma canónica, formatos alternativos y reintento ante 131030
const test = require("node:test");
const assert = require("node:assert/strict");
const tel = require("./whatsapp/telefonos");
const { crearSender } = require("./whatsapp/graph");
const seg = require("./whatsapp/seguridad");

test("canonico: el mismo celular argentino con 9, sin 9 o con 15 es una sola forma (549…)", () => {
  assert.equal(tel.canonico("5493855877935"), "5493855877935");
  assert.equal(tel.canonico("543855877935"), "5493855877935");
  assert.equal(tel.canonico("+54 385 15 5877935"), "5493855877935");
  assert.equal(tel.canonico("54111555551234"), "5491155551234"); // área de 2 dígitos con 15
  assert.equal(tel.canonico("5492944123456"), "5492944123456"); // área de 4 dígitos
  // Otros países, intactos
  assert.equal(tel.canonico("15551580703"), "15551580703");
  assert.equal(tel.canonico("5215512345678"), "5215512345678");
});

test("alternativas: primero el que llegó, después sin el 9 y con 15", () => {
  const a = tel.alternativas("5493855877935");
  assert.equal(a[0], "5493855877935");
  assert.ok(a.includes("543855877935"));
  assert.ok(a.includes("54385155877935"));
  assert.equal(new Set(a).size, a.length);
  assert.deepEqual(tel.alternativas("15551580703"), ["15551580703"]);
});

test("hashTelefono: el chat y el invitado no se parten según el formato", () => {
  const k = "clave-de-prueba-larga-de-32-caracteres!!";
  const h = seg.hashTelefono("5493855877935", k);
  assert.equal(seg.hashTelefono("543855877935", k), h);
  assert.equal(seg.hashTelefono("+54 385 15 587-7935", k), h);
  assert.notEqual(seg.hashTelefono("5493855877936", k), h);
});

// fetch falso: rechaza con 131030 todo destinatario que no esté en `permitidos`
function fetchFalso(permitidos, llamadas) {
  return async (_url, opts) => {
    const body = JSON.parse(opts.body);
    llamadas.push(body.to);
    const ok = permitidos.includes(body.to);
    const json = ok ? { messages: [{ id: `wamid.${llamadas.length}` }] } : { error: { code: 131030, message: "Recipient phone number not in allowed list" } };
    return { ok, status: ok ? 200 : 400, text: async () => JSON.stringify(json) };
  };
}

test("sender: ante 131030 prueba sin el 9, recuerda el formato y no reintenta en el próximo envío", async () => {
  const llamadas = [];
  const guardados = {};
  const formatos = { conocido: async (to) => guardados[to] || null, recordar: async (to, usado) => { guardados[to] = usado; } };
  const s = crearSender({ phoneNumberId: "1", token: "t", fetchImpl: fetchFalso(["543855877935"], llamadas), formatos });
  const r = await s.texto("5493855877935", "hola");
  assert.ok(r.id);
  assert.deepEqual(llamadas, ["5493855877935", "543855877935"]);
  assert.equal(guardados["5493855877935"], "543855877935");
  await s.texto("5493855877935", "segundo");
  assert.deepEqual(llamadas.slice(2), ["543855877935"]); // directo con el formato que anduvo
  // Un sender nuevo (otra invocación) usa el formato guardado
  const llamadas2 = [];
  const s2 = crearSender({ phoneNumberId: "1", token: "t", fetchImpl: fetchFalso(["543855877935"], llamadas2), formatos });
  await s2.botones("5493855877935", "¿Para cuándo?", [{ id: "hoy", titulo: "Hoy" }]);
  assert.deepEqual(llamadas2, ["543855877935"]);
});

test("sender: el formato con 15 también se prueba; si ninguno anda, tira el error de Meta", async () => {
  const llamadas = [];
  const s = crearSender({ phoneNumberId: "1", token: "t", fetchImpl: fetchFalso(["54385155877935"], llamadas) });
  await s.texto("5493855877935", "hola");
  assert.equal(llamadas[llamadas.length - 1], "54385155877935");
  const s2 = crearSender({ phoneNumberId: "1", token: "t", fetchImpl: fetchFalso([], []) });
  await assert.rejects(() => s2.texto("5493855877935", "hola"), (err) => err.code === 131030);
});

test("sender: otros errores no reintentan con otros formatos", async () => {
  const llamadas = [];
  const fetchImpl = async (_u, opts) => {
    llamadas.push(JSON.parse(opts.body).to);
    return { ok: false, status: 400, text: async () => JSON.stringify({ error: { code: 131047, message: "Re-engagement message" } }) };
  };
  const s = crearSender({ phoneNumberId: "1", token: "t", fetchImpl });
  await assert.rejects(() => s.texto("5493855877935", "hola"), (err) => err.code === 131047);
  assert.equal(llamadas.length, 1);
});
