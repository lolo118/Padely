// node --test functions/mercadopago.test.js — firma del webhook, preferencia, comisión, piezas (secreto FALSO de prueba)
const { test } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const mp = require("./mercadopago");

const SECRETO_PRUEBA = "secreto-de-prueba-no-es-real-0123456789";

test("firma del webhook: plantilla oficial, válida, alterada, vieja", () => {
  const ts = String(Math.floor(Date.now() / 1000));
  const manif = mp.manifiesto({ dataId: "123456789", requestId: "req-abc", ts });
  assert.equal(manif, `id:123456789;request-id:req-abc;ts:${ts};`);
  // data.id alfanumérico va en minúsculas; sin request-id se omite esa parte
  assert.equal(mp.manifiesto({ dataId: "ABC123", requestId: null, ts: "1" }), "id:abc123;ts:1;");
  const v1 = crypto.createHmac("sha256", SECRETO_PRUEBA).update(manif).digest("hex");
  const xSignature = `ts=${ts},v1=${v1}`;
  assert.deepEqual(mp.firmaValida({ xSignature, xRequestId: "req-abc", dataId: "123456789", secreto: SECRETO_PRUEBA }), { ok: true });
  assert.equal(mp.firmaValida({ xSignature, xRequestId: "req-abc", dataId: "999", secreto: SECRETO_PRUEBA }).ok, false);
  assert.equal(mp.firmaValida({ xSignature, xRequestId: "otro", dataId: "123456789", secreto: SECRETO_PRUEBA }).ok, false);
  assert.equal(mp.firmaValida({ xSignature, xRequestId: "req-abc", dataId: "123456789", secreto: "otro-secreto" }).motivo, "firma distinta");
  assert.equal(mp.firmaValida({ xSignature: "", secreto: SECRETO_PRUEBA }).motivo, "sin firma");
  assert.equal(mp.firmaValida({ xSignature: "v1=abc", secreto: SECRETO_PRUEBA }).motivo, "firma incompleta");
  // Firma correcta pero de hace una hora
  const tsViejo = String(Math.floor(Date.now() / 1000) - 3600);
  const v1Viejo = crypto.createHmac("sha256", SECRETO_PRUEBA).update(mp.manifiesto({ dataId: "1", requestId: "r", ts: tsViejo })).digest("hex");
  assert.equal(mp.firmaValida({ xSignature: `ts=${tsViejo},v1=${v1Viejo}`, xRequestId: "r", dataId: "1", secreto: SECRETO_PRUEBA }).motivo, "firma vieja");
  assert.deepEqual(mp.partesDeFirma("ts=10, v1=ab"), { ts: "10", v1: "ab" });
});

test("datos de la notificación: query y cuerpo", () => {
  assert.deepEqual(mp.datosDeNotificacion({ "data.id": "55", type: "payment" }, { action: "payment.updated", live_mode: false }), { dataId: "55", tipo: "payment", accion: "payment.updated", liveMode: false });
  assert.equal(mp.datosDeNotificacion({ id: "77", topic: "payment" }, {}).dataId, "77");
  assert.equal(mp.datosDeNotificacion({}, { data: { id: 88 }, type: "payment" }).dataId, "88");
  assert.equal(mp.datosDeNotificacion({}, {}).dataId, null);
});

test("OAuth: URL de autorización, state firmado y tokens", () => {
  const url = mp.urlAutorizacion({ clientId: "3092201399296696", state: "abc.def", redirectUri: "https://us-central1-padely-dev.cloudfunctions.net/mpOAuthCallback" });
  assert.ok(url.startsWith("https://auth.mercadopago.com.ar/authorization?"));
  assert.match(url, /client_id=3092201399296696/);
  assert.match(url, /response_type=code/);
  assert.match(url, /platform_id=mp/);
  assert.match(url, /state=abc\.def/);
  assert.match(url, /redirect_uri=https%3A%2F%2Fus-central1-padely-dev\.cloudfunctions\.net%2FmpOAuthCallback/);
  const state = mp.nuevoState(SECRETO_PRUEBA, "club1");
  assert.match(state, /^club1~[0-9a-f]{32}\.[0-9a-f]{16}$/);
  assert.deepEqual(mp.stateValido(state, SECRETO_PRUEBA), { ok: true, prefijo: "club1" });
  assert.equal(mp.stateValido(state, "otro").ok, false);
  assert.equal(mp.stateValido(`club2~${state.slice(6)}`, SECRETO_PRUEBA).ok, false); // otro club con la misma firma: no
  assert.equal(mp.stateValido(`${state.slice(0, state.lastIndexOf("."))}.0000000000000000`, SECRETO_PRUEBA).ok, false);
  assert.deepEqual(mp.stateValido("basura", SECRETO_PRUEBA), { ok: false, prefijo: null });
  const t = mp.tokensDeRespuesta({ access_token: "a", refresh_token: "r", public_key: "pk", user_id: 123, live_mode: false, expires_in: 15552000, scope: "offline_access read write" }, 1000);
  assert.deepEqual(t, { userId: "123", accessToken: "a", refreshToken: "r", publicKey: "pk", liveMode: false, scope: "offline_access read write", expiraEnMs: 1000 + 15552000 * 1000 });
  assert.deepEqual(mp.cuerpoTokenPorRefresh({ clientId: 1, clientSecret: "s", refreshToken: "r" }), { client_id: "1", client_secret: "s", refresh_token: "r", grant_type: "refresh_token" });
  assert.equal(mp.cuerpoTokenPorCodigo({ clientId: 1, clientSecret: "s", code: "c", redirectUri: "u" }).grant_type, "authorization_code");
});

test("preferencia: un ítem, referencia externa, vencimiento a 15 min, comisión", () => {
  const ahora = Date.UTC(2026, 9, 24, 15, 0, 0); // 12:00 ART
  const { body, fee, total, venceEnMs } = mp.cuerpoPreferencia({ titulo: "Club Padely Central · Cancha 1 · vie 24 oct 20:00 · Tu parte", monto: 3130, pagoMpId: "pago1", pagador: { nombre: "Juan" }, notificationUrl: "https://x/mpWebhook?club=c1", backUrl: "https://padely.netlify.app/turno/c1/g1", comisionPct: 2.5, ahoraMs: ahora });
  assert.equal(total, 3130);
  assert.equal(fee, 78.25);
  assert.equal(body.marketplace_fee, 78.25);
  assert.equal(body.items.length, 1);
  assert.equal(body.items[0].unit_price, 3130);
  assert.equal(body.items[0].currency_id, "ARS");
  assert.equal(body.external_reference, "pago1");
  assert.equal(body.auto_return, "approved");
  assert.deepEqual(body.back_urls, { success: "https://padely.netlify.app/turno/c1/g1?mp=ok", pending: "https://padely.netlify.app/turno/c1/g1?mp=pendiente", failure: "https://padely.netlify.app/turno/c1/g1?mp=error" });
  assert.equal(body.expiration_date_from, "2026-10-24T12:00:00.000-03:00");
  assert.equal(body.expiration_date_to, "2026-10-24T12:15:00.000-03:00");
  assert.equal(venceEnMs, ahora + 15 * 60000);
  assert.equal(body.payer.name, "Juan");
  // Sin comisión no se manda marketplace_fee; la comisión se topa en 10 %
  assert.equal(mp.cuerpoPreferencia({ titulo: "t", monto: 100, pagoMpId: "p", notificationUrl: "n", backUrl: "b" }).body.marketplace_fee, undefined);
  assert.equal(mp.comisionDe(1000, 50), 100);
  assert.equal(mp.comisionDe(1000, -3), 0);
  assert.equal(mp.numeroMp(7), "MP-000007");
});

test("piezas al aprobar: lo que el mostrador ya cobró queda como excedente", () => {
  const piezas = [
    { lineaId: "a1", tipo: "consumo", monto: 1040, participanteId: "p2" },
    { lineaId: null, tipo: "cancha", monto: 2500, participanteId: "p2" },
    { lineaId: null, tipo: "seña", monto: -400, participanteId: "p2" },
  ];
  const libre = mp.aplicarPiezas({ pagos: [] }, piezas);
  assert.equal(libre.aplicadas.length, 3);
  assert.equal(libre.montoAplicado, 3140);
  assert.equal(libre.excedente, 0);
  // Mientras pagaba online, el mostrador le cobró la cancha (y la seña) en efectivo
  const conCancha = { pagos: [{ participanteIds: ["p2"], lineas: [{ lineaId: null, tipo: "cancha", monto: 2500, participanteId: "p2" }, { lineaId: null, tipo: "seña", monto: -400, participanteId: "p2" }] }] };
  const r = mp.aplicarPiezas(conCancha, piezas);
  assert.equal(r.aplicadas.length, 1);
  assert.equal(r.montoAplicado, 1040);
  assert.equal(r.excedente, 2100); // 2.500 − 400 ya cobrados: hay que devolverlos
  // Todo ya cobrado
  const todo = mp.aplicarPiezas({ pagos: [{ participanteIds: ["p2"], lineas: piezas }] }, piezas);
  assert.equal(todo.montoAplicado, 0);
  assert.equal(todo.excedente, 3140);
});

test("B-P3-8-1: qué ventas se anulan con mpAnularVenta y cómo se guarda la devolución", () => {
  const online = { estado: "ok", cajaId: null, mpPaymentId: "185", pagos: [{ medio: "mercadopago", monto: 5000 }] };
  assert.deepEqual(mp.ventaAnulableOnline(online), { ok: true, motivo: null });
  assert.equal(mp.ventaAnulableOnline({ ...online, estado: "anulada" }).ok, false);
  assert.match(mp.ventaAnulableOnline({ ...online, cajaId: "caja1" }).motivo, /caja/);
  assert.equal(mp.ventaAnulableOnline({ ...online, pagos: [{ medio: "efectivo", monto: 5000 }] }).ok, false);
  assert.equal(mp.ventaAnulableOnline({ ...online, mpPaymentId: null }).ok, false);
  assert.equal(mp.ventaAnulableOnline(null).ok, false);
  assert.deepEqual(mp.devolucionDe({ ok: true, refundId: "r1" }, { monto: 5000 }), { ok: true, monto: 5000, manual: false, por: null, refundId: "r1", error: null });
  const fallo = mp.devolucionDe({ ok: false, error: "401 Unauthorized use of live credentials" }, { monto: 5000 });
  assert.equal(fallo.ok, false);
  assert.equal(fallo.refundId, null);
  assert.match(fallo.error, /live credentials/);
  // Marcada a mano desde la cuenta de MP del club
  assert.deepEqual(mp.devolucionDe({ ok: true }, { monto: 5000, manual: true, por: "u1" }), { ok: true, monto: 5000, manual: true, por: "u1", refundId: null, error: null });
});

// Fakes de la API: pagos conocidos por id; aplicar() anota lo que recibe
const apiFalsa = (pagos, ordenes = {}) => {
  const aplicados = [];
  const deps = {
    leerPago: async (id) => pagos[id] || null,
    leerOrden: async (id) => ordenes[id] || null,
    aplicar: async (pago) => {
      aplicados.push(pago.id);
      return `pago ${pago.id} ${pago.status} → aplicado`;
    },
  };
  return { deps, aplicados };
};

test("B-P3-8-2: firma inválida + pago aprobado real → se aplica igual (la verdad está en la API, no en el cuerpo)", async () => {
  const xSignature = "ts=1,v1=deadbeef"; // firma que no cierra
  assert.equal(mp.firmaValida({ xSignature, xRequestId: "r", dataId: "185", secreto: SECRETO_PRUEBA }).ok, false);
  const { deps, aplicados } = apiFalsa({ 185: { id: 185, status: "approved", external_reference: "pm1" } });
  const r = await mp.procesarNotificacion({ ...mp.datosDeNotificacion({ "data.id": "185", type: "payment" }, { action: "payment.updated" }), deps });
  assert.deepEqual(aplicados, [185]);
  assert.equal(r.resultado, "ok");
  assert.match(r.resumen, /185 approved/);
});

test("B-P3-8-2: firma inválida + pago desconocido → ignorado (200 sin aplicar nada)", async () => {
  const { deps, aplicados } = apiFalsa({});
  const r = await mp.procesarNotificacion({ tipo: "payment", dataId: "999", deps });
  assert.deepEqual(aplicados, []);
  assert.deepEqual(r, { resultado: "ignorado", resumen: "pago 999 desconocido → ignorado" });
  // Sin data.id o con un tema que no es de pagos: ignorado
  assert.equal((await mp.procesarNotificacion({ tipo: "payment", dataId: null, deps })).resultado, "ignorado");
  assert.match((await mp.procesarNotificacion({ tipo: "subscription_preapproval", dataId: "5", deps })).resumen, /tema .* ignorado/);
});

test("B-P3-8-2: feed sin firma (?id=…&topic=…) → se procesa; merchant_order → sus pagos", async () => {
  const datos = mp.datosDeNotificacion({ id: "77", topic: "payment" }, {});
  assert.deepEqual([datos.dataId, datos.tipo], ["77", "payment"]);
  const { deps, aplicados } = apiFalsa({ 77: { id: 77, status: "approved", external_reference: "pm7" }, 78: { id: 78, status: "rejected", external_reference: "pm8" } }, { 500: { id: 500, payments: [{ id: 77 }, { id: 78 }, { id: 79 }] } });
  const r1 = await mp.procesarNotificacion({ ...datos, deps });
  assert.equal(r1.resultado, "ok");
  assert.deepEqual(aplicados, [77]);
  const r2 = await mp.procesarNotificacion({ ...mp.datosDeNotificacion({ id: "500", topic: "merchant_order" }, {}), deps });
  assert.equal(r2.resultado, "ok");
  assert.deepEqual(aplicados, [77, 77, 78]);
  assert.match(r2.resumen, /79 desconocido/);
  assert.equal((await mp.procesarNotificacion({ tipo: "merchant_order", dataId: "501", deps })).resumen, "orden 501 desconocida");
});

test("M1: usuario de prueba por tags o nickname", () => {
  assert.equal(mp.esUsuarioDePrueba({ nickname: "TESTUSER1376", tags: ["normal", "test_user"] }), true);
  assert.equal(mp.esUsuarioDePrueba({ nickname: "TESTUSER1376" }), true);
  assert.equal(mp.esUsuarioDePrueba({ nickname: "CLUBPADEL", tags: ["normal", "test_user"] }), true);
  assert.equal(mp.esUsuarioDePrueba({ nickname: "CLUBPADEL", tags: ["normal"] }), false);
  assert.equal(mp.esUsuarioDePrueba(null), false);
});

test("B-P3-8b-1: un pago aprobado solo crea venta una vez (reintentos de MP días después)", () => {
  const d = (pm, id = "185063480463", opts) => mp.decisionPagoAprobado(pm, id, opts);
  // Caso real C-P3-8b: devuelto a mano (la API no aceptó) y MP reintenta la notificación con el pago aún "approved"
  assert.deepEqual(d({ estado: "devuelto", paymentId: "185063480463", ventaNumero: "MP-000002", devolucion: { manual: true } }), { accion: "ignorar", resultado: "ya procesado (devuelto)" });
  assert.equal(d({ estado: "anulado", ventaNumero: "MP-000002" }).accion, "ignorar");
  // Una venta con ese paymentId (aunque esté anulada) corta todo, aunque el pagoMp se haya pisado
  assert.deepEqual(d({ estado: "pendiente" }, "185063480463", { ventaConEsePago: "MP-000002" }), { accion: "ignorar", resultado: "ya procesado (venta MP-000002)" });
  // Idempotente: mismo pago otra vez
  assert.deepEqual(d({ estado: "aprobado", paymentId: "185063480463", ventaNumero: "MP-000002" }), { accion: "ignorar", resultado: "ya aplicado" });
  // Otro pago para un pagoMp ya aprobado → no se aplica dos veces
  assert.deepEqual(d({ estado: "aprobado", paymentId: "1", ventaNumero: "MP-000009" }, "2"), { accion: "ignorar", resultado: "ya procesado (aprobado)" });
  // Pendiente (con o sin paymentId de un "in_process") → se aplica
  assert.equal(d({ estado: "pendiente" }).accion, "aplicar");
  assert.equal(d({ estado: "pendiente", paymentId: "185063480463" }).accion, "aplicar");
  // Rechazado y reintento aprobado en el mismo checkout → se aplica
  assert.equal(d({ estado: "rechazado", paymentId: "1" }, "2").accion, "aplicar");
  // Vencido sin venta: la plata entró tarde → excedente para devolver, no se aplica en silencio
  assert.deepEqual(d({ estado: "vencido" }), { accion: "tardio", resultado: "pago tardío (vencido) → excedente" });
  assert.equal(d({ estado: "vencido", devolucion: { ok: true } }).accion, "ignorar");
  assert.equal(d(null).accion, "ignorar");
});

test("P3-14 C: pagos de inscripción (referencia, decisión, comisión de torneos)", () => {
  assert.equal(mp.referenciaInscripcion("abc"), "ins_abc");
  assert.equal(mp.pagoIdDeReferencia("ins_abc"), "abc");
  assert.equal(mp.pagoIdDeReferencia("CZls8Cpo642axm6Cq7Kk"), null, "los pagos de clubes no llevan prefijo");
  assert.equal(mp.pagoIdDeReferencia("ins_"), null);
  assert.equal(mp.decisionPagoInscripcion({ estado: "pendiente" }, "1").accion, "aplicar");
  assert.deepEqual(mp.decisionPagoInscripcion({ estado: "aprobado", paymentId: "1" }, "1"), { accion: "ignorar", resultado: "ya aplicado" });
  assert.deepEqual(mp.decisionPagoInscripcion({ estado: "devuelto", paymentId: "1" }, "1"), { accion: "ignorar", resultado: "ya procesado (devuelto)" });
  assert.equal(mp.decisionPagoInscripcion(null, "1").accion, "ignorar");
  assert.equal(mp.comisionTorneos({}), 0);
  assert.equal(mp.comisionTorneos({ comisionTorneosPct: 3 }), 3);
  assert.equal(mp.comisionTorneos({ comisionTorneosPct: 50 }), 0);
  // La preferencia de una inscripción lleva la comisión como marketplace_fee
  const pref = mp.cuerpoPreferencia({ titulo: "Inscripción", monto: 20000, pagoMpId: mp.referenciaInscripcion("p1"), notificationUrl: "https://x/mpWebhook?org=o1", backUrl: "https://app/torneos/t1", comisionPct: 3 });
  assert.equal(pref.body.external_reference, "ins_p1");
  assert.equal(pref.body.marketplace_fee, 600);
});

test("Pase con plan (P3-16e): cuerpo del plan, cuándo crear/actualizar, link con referencia", () => {
  assert.deepEqual(mp.cuerpoPlanPase({ reason: "Pase Club Central", meses: 3, precio: 15000, backUrl: "https://padely.netlify.app/membresias?club=c1" }), {
    reason: "Pase Club Central",
    back_url: "https://padely.netlify.app/membresias?club=c1",
    auto_recurring: { frequency: 3, frequency_type: "months", transaction_amount: 15000, currency_id: "ARS" },
  });
  assert.equal(mp.accionPlanPase({ precio: 0 }, "X"), null);
  assert.equal(mp.accionPlanPase({ precio: 1000, meses: 1 }, "X"), "crear");
  const mpOk = { planId: "p1", precio: 1000, meses: 1, reason: "X" };
  assert.equal(mp.accionPlanPase({ precio: 1000, meses: 1, mp: mpOk }, "X"), null);
  assert.equal(mp.accionPlanPase({ precio: 1200, meses: 1, mp: mpOk }, "X"), "actualizar");
  assert.equal(mp.accionPlanPase({ precio: 1000, meses: 3, mp: mpOk }, "X"), "actualizar");
  assert.equal(mp.accionPlanPase({ precio: 1000, meses: 1, mp: mpOk }, "Y"), "actualizar");
  assert.equal(mp.referenciaPase("c1", "u1"), "pase_c1_u1");
  assert.equal(mp.uidDeReferenciaPase("pase_c1_u1", "c1"), "u1");
  assert.equal(mp.uidDeReferenciaPase("pase_c2_u1", "c1"), null);
  assert.equal(mp.uidDeReferenciaPase(null, "c1"), null);
  const link = mp.initPointConReferencia("https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=abc", "pase_c1_u1");
  assert.match(link, /preapproval_plan_id=abc/);
  assert.match(link, /external_reference=pase_c1_u1/);
  assert.equal(mp.initPointConReferencia(null, "x"), null);
});

test("Pase con plan (P3-16e): a qué socio va una preapproval nueva", () => {
  const socios = [
    { uid: "viejo", estado: "pendiente", solicitadoMs: 1000, preapprovalId: null },
    { uid: "nuevo", estado: "pendiente", solicitadoMs: 5000, preapprovalId: null },
    { uid: "ocupado", estado: "pendiente", solicitadoMs: 9000, preapprovalId: "otra" },
    { uid: "mail", estado: "cancelada", solicitadoMs: 100, preapprovalId: null },
  ];
  // 1) external_reference de este club
  assert.deepEqual(mp.elegirSocioPreapproval({ pre: { id: "p", external_reference: "pase_c1_viejo" }, clubId: "c1", socios }), { uid: "viejo", via: "external_reference" });
  // referencia de otro club → no cuenta
  assert.equal(mp.elegirSocioPreapproval({ pre: { id: "p", external_reference: "pase_c2_viejo" }, clubId: "c1", socios }).via, "pendiente_reciente");
  // 2) payer_email = cuenta de Padely
  assert.deepEqual(mp.elegirSocioPreapproval({ pre: { id: "p" }, clubId: "c1", socios, uidPorEmail: "mail" }), { uid: "mail", via: "payer_email" });
  // 3) el pendiente más reciente sin otra preapproval
  assert.deepEqual(mp.elegirSocioPreapproval({ pre: { id: "p" }, clubId: "c1", socios }), { uid: "nuevo", via: "pendiente_reciente" });
  // un socio ya vinculado a OTRA preapproval no se pisa; a la misma, sí
  assert.equal(mp.elegirSocioPreapproval({ pre: { id: "p", external_reference: "pase_c1_ocupado" }, clubId: "c1", socios }).uid, "nuevo");
  assert.equal(mp.elegirSocioPreapproval({ pre: { id: "otra", external_reference: "pase_c1_ocupado" }, clubId: "c1", socios }).uid, "ocupado");
  assert.equal(mp.elegirSocioPreapproval({ pre: { id: "p" }, clubId: "c1", socios: [] }), null);
});

test("Pase con plan (P3-16g): re-vincular un socio pendiente que quedó en una preapproval fallida", () => {
  const R = mp.puedeReemplazarPreapproval;
  // preapproval muerta → la reemplaza cualquiera
  for (const actual of ["cancelled", "rejected", "paused"]) {
    assert.equal(R({ socioEstado: "pendiente", actual, nueva: "pending" }), true, actual);
    assert.equal(R({ socioEstado: "pendiente", actual, nueva: "authorized" }), true, actual);
  }
  // pending: solo la reemplaza una autorizada
  assert.equal(R({ socioEstado: "pendiente", actual: "pending", nueva: "authorized" }), true);
  assert.equal(R({ socioEstado: "pendiente", actual: "pending", nueva: "pending" }), false);
  assert.equal(R({ socioEstado: "pendiente", actual: null, nueva: "pending" }), false);
  // una autorizada nunca se pisa
  assert.equal(R({ socioEstado: "pendiente", actual: "authorized", nueva: "authorized" }), false);
  assert.equal(R({ socioEstado: "pendiente", actual: "authorized", nueva: "pending" }), false);
  // socio activo o dado de baja: no se toca
  assert.equal(R({ socioEstado: "activa", actual: "cancelled", nueva: "authorized" }), false);
  assert.equal(R({ socioEstado: "cancelada", actual: "cancelled", nueva: "authorized" }), false);

  // El caso real (2026-11-10): el intento rechazado "bacbca24" se vinculó 9 s antes; llega la autorizada "39af"
  const socios = [{ uid: "jug", estado: "pendiente", solicitadoMs: 5000, preapprovalId: "bacbca24", susEstado: "cancelled" }];
  assert.deepEqual(mp.elegirSocioPreapproval({ pre: { id: "39af", status: "authorized" }, clubId: "c1", socios }), { uid: "jug", via: "pendiente_reciente" });
  assert.deepEqual(mp.elegirSocioPreapproval({ pre: { id: "39af", status: "pending", external_reference: "pase_c1_jug" }, clubId: "c1", socios }), { uid: "jug", via: "external_reference" });
  // al revés: vinculado a una autorizada, llega otra (fallida o pendiente) → no se pisa
  const conAutorizada = [{ uid: "jug", estado: "pendiente", solicitadoMs: 5000, preapprovalId: "39af", susEstado: "authorized" }];
  assert.equal(mp.elegirSocioPreapproval({ pre: { id: "otra", status: "cancelled" }, clubId: "c1", socios: conAutorizada }), null);
  assert.equal(mp.elegirSocioPreapproval({ pre: { id: "otra", status: "authorized" }, clubId: "c1", socios: conAutorizada }), null);
  // pending vs pending: no hay flip-flop
  const conPending = [{ uid: "jug", estado: "pendiente", solicitadoMs: 5000, preapprovalId: "a", susEstado: "pending" }];
  assert.equal(mp.elegirSocioPreapproval({ pre: { id: "b", status: "pending" }, clubId: "c1", socios: conPending }), null);
});
