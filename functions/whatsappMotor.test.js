// node --test functions/whatsappMotor.test.js — la conversación del bot de WhatsApp con un sender falso y un club en
// memoria (functions/whatsapp/repoMemoria.js). Reloj fijo: jueves 12/11/2026 15:00 en Argentina.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { procesarEvento, notificarSeñaPagada, notificarRetencionVencida, comandoDe, reservasProximas } = require("./whatsapp/motor");
const { crearSenderFalso } = require("./whatsapp/graph");
const { crearRepoMemoria } = require("./whatsapp/repoMemoria");

const AHORA = Date.UTC(2026, 10, 12, 18, 0, 0); // 15:00 ART
const HOY = "2026-11-12";
const MANANA = "2026-11-13";
const CLUB = "club1";
const WA = "5493815551234";
const CHAT = "h1";
const MIN = 60000;
const H = (desde, hasta) => Array.from({ length: hasta - desde }, (_, i) => `${String(desde + i).padStart(2, "0")}:00`);

function escenario({ club = {}, canchas = null, reservas = [], turnosFijos = [], mpFalla = false } = {}) {
  const repo = crearRepoMemoria(
    {
      clubs: { [CLUB]: { nombre: "Club Norte", diasAnticipacion: 7, maxTurnosPorReserva: 2, seña: { tipo: "porcentaje", valor: 30 }, mercadoPago: { conectado: true }, ownerUid: "dueño", ...club } },
      canchas: { [CLUB]: canchas || [{ id: "c1", nombre: "Cancha 1", precioBase: 30000, horariosDisponibles: H(8, 24) }, { id: "c2", nombre: "Cancha 2", precioBase: 22000, horariosDisponibles: H(14, 23) }] },
      reservas: { [CLUB]: reservas },
      turnosFijos: { [CLUB]: turnosFijos },
    },
    { mpFalla },
  );
  const sender = crearSenderFalso();
  let ahora = AHORA;
  const enviar = (evento, extra = {}) => procesarEvento({ clubId: CLUB, chatId: CHAT, evento: { tipo: "mensaje", waId: WA, nombrePerfil: "Sebas Goita", ...evento }, repo, sender, ahoraMs: ahora, ...extra });
  const op = (opcionId) => enviar({ opcionId, texto: opcionId });
  const txt = (texto) => enviar({ texto });
  const ultimo = () => sender.enviados[sender.enviados.length - 1];
  const cuerpo = (m = ultimo()) => (m.tipo === "texto" ? m.payload.text.body : m.payload.interactive.body.text);
  const ids = (m = ultimo()) => (m.tipo === "botones" ? m.payload.interactive.action.buttons.map((b) => b.reply.id) : m.tipo === "lista" ? m.payload.interactive.action.sections.flatMap((s) => s.rows.map((r) => r.id)) : []);
  const avanzar = (ms) => {
    ahora += ms;
  };
  const chat = () => repo.getChat(CLUB, CHAT);
  return { repo, sender, enviar, op, txt, ultimo, cuerpo, ids, avanzar, chat, get ahora() { return ahora; } };
}

test("comandos: cancelar, mis reservas, hablar con el club, saludo", () => {
  assert.equal(comandoDe({ texto: "Cancelar" }), "cancelar");
  assert.equal(comandoDe({ texto: "cancelar la reserva" }), "cancelar");
  assert.equal(comandoDe({ texto: "Mis reservas" }), "mis_reservas");
  assert.equal(comandoDe({ texto: "Hablar con el club!" }), "humano");
  assert.equal(comandoDe({ texto: "Buenas" }), "inicio");
  assert.equal(comandoDe({ texto: "quiero reservar" }), "inicio");
  assert.equal(comandoDe({ opcionId: "cmd:cancelar", texto: "Cancelar" }), "cancelar");
  assert.equal(comandoDe({ texto: "20" }), null);
});

test("reserva completa con seña por Mercado Pago: saludo → día → hora → duración → nombre → resumen → pago → confirmación", async () => {
  const e = escenario({ reservas: [{ id: `c1_${HOY}_2000`, canchaId: "c1", fecha: HOY, hora: "20:00", status: "confirmada" }] });
  await e.txt("hola");
  assert.match(e.cuerpo(), /Bienvenido a Club Norte/);
  assert.match(e.cuerpo(), /cancelar.*mis reservas.*hablar con el club/s);
  assert.deepEqual(e.ids(), ["dia:hoy", "dia:manana", "dia:otro"]);

  await e.op("dia:hoy");
  assert.equal(e.ultimo().tipo, "lista");
  const filas = e.ultimo().payload.interactive.action.sections[0].rows;
  assert.equal(filas[0].title, "16:00"); // hoy: la hora en curso (15:00) y las anteriores no se ofrecen
  assert.ok(filas.length <= 10);
  const veinte = filas.find((f) => f.title === "20:00");
  assert.equal(veinte.description, "1 cancha · $ 22.000"); // la cancha 1 está reservada a las 20
  assert.deepEqual(filas.slice(-2).map((f) => f.id), ["hora:23:00", "dia:cambiar"]); // 16 a 23: entran justo 8

  await e.op("hora:20:00"); // una sola cancha libre → directo a la duración
  assert.deepEqual(e.ids(), ["dur:1", "dur:2"]);
  await e.op("dur:1");
  assert.match(e.cuerpo(), /A nombre de quién/);
  assert.deepEqual(e.ids(), ["nombre:perfil"]);
  await e.op("nombre:perfil");
  assert.match(e.cuerpo(), /Cancha 2 · jue 12 nov · 20:00 – 21:00/);
  assert.match(e.cuerpo(), /Precio: \$ 22\.000/);
  assert.match(e.cuerpo(), /Seña: \$ 6\.600/);
  assert.deepEqual(e.ids(), ["ok:confirmar", "ok:cambiar", "cmd:cancelar"]);

  await e.op("ok:confirmar");
  const r = (await e.repo.reservasDelTelefono(CLUB, CHAT))[0];
  assert.equal(r.status, "pendiente");
  assert.equal(r.origen, "whatsapp");
  assert.equal(r.jugadorUid, null);
  assert.equal(r.nombreJugador, "Sebas Goita");
  assert.equal(r.seña, 6600);
  assert.equal(r.precioTotal, 22000);
  assert.equal(r.telefonoMascara, "+549 ••• 1234");
  assert.ok(!JSON.stringify(r).includes(WA), "la reserva (que leen todos) no lleva el teléfono entero");
  assert.equal(r.waRetencionHasta, AHORA + 20 * MIN);
  assert.equal(e.repo.st.contactos[`${CLUB}/c2_${HOY}_2000`].telefono, `+${WA}`);
  assert.equal(e.ultimo().tipo, "cta");
  assert.equal(e.ultimo().payload.interactive.action.parameters.url, "https://mp.example/checkout/pago1");
  assert.equal(e.repo.st.avisos[0].tipo, "nueva_reserva");
  assert.equal((await e.chat()).paso, "pago");

  // Escribe algo mientras tanto: le reenvía el link
  await e.txt("ya pago");
  assert.equal(e.ultimo().tipo, "cta");

  // Mercado Pago aprueba (mpWebhook → aplicarPagoAprobado → notificarSeñaPagada)
  const cabeza = await e.repo.pagarSeña(CLUB, r.id);
  assert.equal(cabeza.status, "confirmada");
  const antes = e.sender.enviados.length;
  assert.equal(await notificarSeñaPagada({ clubId: CLUB, reserva: cabeza, repo: e.repo, sender: e.sender, ahoraMs: e.ahora + MIN }), "confirmación enviada");
  const nuevos = e.sender.enviados.slice(antes);
  assert.match(nuevos[0].payload.text.body, /Reserva confirmada/);
  assert.match(nuevos[0].payload.text.body, /Seña pagada: \$ 6\.600/);
  assert.equal(nuevos[1].tipo, "cta");
  assert.match(nuevos[1].payload.interactive.action.parameters.url, /\/whatsapp\/vincular\?c=club1&h=h1&v=\d+&s=/);
  assert.equal((await e.chat()).paso, "inicio");
});

test("más de una cancha libre a esa hora → lista de canchas; sin seña → confirmada al toque", async () => {
  const e = escenario({ club: { seña: { tipo: "ninguna" } } });
  await e.txt("hola");
  await e.op("dia:manana");
  await e.op("hora:18:00");
  assert.deepEqual(e.ids(), ["cancha:c1", "cancha:c2"]);
  await e.op("cancha:c1");
  await e.op("dur:2");
  await e.txt("Juan Pérez");
  assert.match(e.cuerpo(), /18:00 – 20:00/);
  assert.match(e.cuerpo(), /Precio: \$ 60\.000/);
  assert.doesNotMatch(e.cuerpo(), /Seña/);
  await e.op("ok:confirmar");
  const slots = await e.repo.reservasDelTelefono(CLUB, CHAT);
  assert.equal(slots.length, 2);
  assert.ok(slots.every((s) => s.status === "confirmada" && s.grupoId === `c1_${MANANA}_1800`));
  const textos = e.sender.enviados.slice(-2);
  assert.match(textos[0].payload.text.body, /Reserva confirmada/);
  assert.equal(textos[1].tipo, "cta");
  // El nombre queda para la próxima
  await e.txt("hola");
  assert.match(e.cuerpo(), /¡Hola, Juan!/);
});

test("el club confirma a mano (reservaDirecta false) y no tiene Mercado Pago: pendiente, la seña en el club", async () => {
  const e = escenario({ club: { reservaDirecta: false, mercadoPago: null } });
  await e.txt("hola");
  await e.op("dia:hoy");
  await e.op("hora:16:00");
  await e.op("cancha:c2");
  await e.op("dur:1");
  await e.txt("Ana");
  assert.match(e.cuerpo(), /La pagás en el club/);
  await e.op("ok:confirmar");
  assert.match(e.cuerpo(), /El club tiene que confirmarlo/);
  const r = (await e.repo.reservasDelTelefono(CLUB, CHAT))[0];
  assert.equal(r.status, "pendiente");
  assert.equal(r.waRetencionHasta, null);
});

test("Otro día → lista de los días reservables; un día fuera de la anticipación no se puede", async () => {
  const e = escenario({ club: { diasAnticipacion: 3 } });
  await e.txt("hola");
  await e.op("dia:otro");
  assert.deepEqual(e.ids(), ["dia:2026-11-12", "dia:2026-11-13", "dia:2026-11-14", "dia:2026-11-15"]);
  await e.txt("20/11");
  assert.match(e.sender.enviados[e.sender.enviados.length - 2].payload.text.body, /no se puede reservar/);
  await e.op("dia:2026-11-15");
  assert.equal(e.ultimo().tipo, "lista");
  assert.match(e.cuerpo(), /dom 15 nov/);
});

test("horarios paginados: 8 por página + Ver más + Cambiar día (máx. 10 filas)", async () => {
  const e = escenario({ canchas: [{ id: "c1", nombre: "Cancha 1", precioBase: 1000, horariosDisponibles: H(8, 24) }] });
  await e.txt("hola");
  await e.op("dia:manana");
  let ids = e.ids();
  assert.equal(ids.length, 10);
  assert.deepEqual(ids.slice(0, 2), ["hora:08:00", "hora:09:00"]);
  assert.equal(ids[8], "hora:mas:1");
  await e.op("hora:mas:1");
  ids = e.ids();
  assert.deepEqual(ids.slice(0, 1), ["hora:16:00"]);
  assert.equal(ids[ids.length - 2], "hora:mas:0");
  assert.equal(ids.length, 10);
});

test("sin turnos libres → vuelve a preguntar el día; turno fijo y reservas de clase/torneo cuentan como ocupados", async () => {
  const canchas = [{ id: "c1", nombre: "Cancha 1", precioBase: 1000, horariosDisponibles: ["18:00", "19:00", "20:00"] }];
  const reservas = [
    { id: `c1_${HOY}_1800`, canchaId: "c1", fecha: HOY, hora: "18:00", status: "confirmada", tipo: "clase" },
    { id: `c1_${HOY}_1900`, canchaId: "c1", fecha: HOY, hora: "19:00", status: "confirmada", tipo: "torneo" },
  ];
  const e = escenario({ canchas, reservas, turnosFijos: [{ canchaId: "c1", dia: "Jueves", horas: ["20:00"], status: "activo" }] });
  await e.txt("hola");
  await e.op("dia:hoy");
  assert.match(e.cuerpo(), /No quedan turnos libres para hoy/);
  assert.deepEqual(e.ids(), ["dia:hoy", "dia:manana", "dia:otro"]);
});

test("carrera: otro reserva el turno entre el resumen y Confirmar → avisa y vuelve a la lista", async () => {
  const e = escenario({ club: { seña: { tipo: "ninguna" } } });
  await e.txt("hola");
  await e.op("dia:hoy");
  await e.op("hora:22:00");
  await e.op("cancha:c2");
  await e.txt("Ana");
  e.repo.st.reservas[CLUB].set(`c2_${HOY}_2200`, { canchaId: "c2", fecha: HOY, hora: "22:00", status: "confirmada" });
  await e.op("ok:confirmar");
  const msjs = e.sender.enviados.slice(-2);
  assert.match(msjs[0].payload.text.body, /alguien acaba de reservar/);
  assert.equal(msjs[1].tipo, "lista");
  assert.equal((await e.repo.reservasDelTelefono(CLUB, CHAT)).length, 0);
});

test("si Mercado Pago no da el link, la reserva se libera", async () => {
  const e = escenario({ mpFalla: true });
  await e.txt("hola");
  await e.op("dia:hoy");
  await e.op("hora:22:00");
  await e.op("cancha:c2");
  await e.txt("Ana");
  await e.op("ok:confirmar");
  assert.match(e.cuerpo(), /No pude generar el link/);
  const r = (await e.repo.reservasDelTelefono(CLUB, CHAT))[0];
  assert.equal(r.status, "cancelada");
});

test("cancelar: en medio del flujo, la reserva sin pagar, y una reserva hecha (con la política de seña)", async () => {
  const e = escenario();
  await e.txt("hola");
  await e.op("dia:hoy");
  await e.txt("cancelar");
  assert.match(e.cuerpo(), /cancelé la reserva que estábamos armando/);
  assert.equal((await e.chat()).paso, "inicio");

  // Reserva retenida esperando la seña → "cancelar" la libera
  await e.txt("hola");
  await e.op("dia:hoy");
  await e.op("hora:22:00");
  await e.op("cancha:c2");
  await e.txt("Ana");
  await e.op("ok:confirmar");
  await e.txt("cancelar");
  assert.match(e.cuerpo(), /liberé el turno/);
  assert.equal((await e.repo.reservasDelTelefono(CLUB, CHAT))[0].status, "cancelada");

  // Una reserva confirmada con seña pagada, dentro de las 24 h → la seña queda para el club (política)
  e.repo.st.reservas[CLUB].set(`c1_${HOY}_2300`, { canchaId: "c1", canchaName: "Cancha 1", fecha: HOY, hora: "23:00", horaInicio: "23:00", horaFin: "24:00", grupoId: `c1_${HOY}_2300`, status: "confirmada", seña: 9000, señaPagada: true, señaMedio: "mercadopago", origen: "whatsapp", waHash: CHAT, nombreJugador: "Ana" });
  await e.txt("cancelar");
  assert.match(e.cuerpo(), /Cancelás Cancha 1 · jue 12 nov · 23:00 – 24:00/);
  assert.match(e.cuerpo(), /la seña \(\$ 9\.000\) no se devuelve/);
  await e.op("anular:no");
  assert.match(e.cuerpo(), /sigue en pie/);
  await e.txt("cancelar");
  await e.op("anular:si");
  assert.match(e.cuerpo(), /cancelé tu reserva/);
  const r = e.repo.st.reservas[CLUB].get(`c1_${HOY}_2300`);
  assert.equal(r.status, "cancelada");
  assert.equal(r.canceladaPor, "jugador");
  assert.ok(e.repo.st.avisos.some((a) => a.tipo === "reserva_cancelada"));
});

test("cancelar con más de una reserva → lista para elegir; con 48 h de anticipación se devuelve por MP", async () => {
  const base = { canchaId: "c1", canchaName: "Cancha 1", status: "confirmada", origen: "whatsapp", waHash: CHAT, seña: 9000, señaPagada: true, señaMedio: "mercadopago" };
  const e = escenario({
    reservas: [
      { ...base, id: "c1_2026-11-14_2000", grupoId: "c1_2026-11-14_2000", fecha: "2026-11-14", hora: "20:00", horaInicio: "20:00" },
      { ...base, id: "c1_2026-11-15_2000", grupoId: "c1_2026-11-15_2000", fecha: "2026-11-15", hora: "20:00", horaInicio: "20:00" },
      { ...base, id: "c1_2026-11-10_2000", grupoId: "c1_2026-11-10_2000", fecha: "2026-11-10", hora: "20:00", horaInicio: "20:00" },
    ],
  });
  await e.txt("cancelar");
  assert.deepEqual(e.ids(), ["anular:c1_2026-11-14_2000", "anular:c1_2026-11-15_2000"]);
  await e.op("anular:c1_2026-11-14_2000");
  assert.match(e.cuerpo(), /Te devolvemos la seña \(\$ 9\.000\) por Mercado Pago/);
});

test("mis reservas: solo las próximas del teléfono", async () => {
  const e = escenario({
    reservas: [
      { id: "a", grupoId: "a", canchaId: "c1", canchaName: "Cancha 1", fecha: MANANA, hora: "19:00", horaInicio: "19:00", horaFin: "20:00", status: "pendiente", seña: 5000, señaPagada: false, origen: "whatsapp", waHash: CHAT },
      { id: "b", grupoId: "b", canchaId: "c1", canchaName: "Cancha 1", fecha: HOY, hora: "10:00", horaInicio: "10:00", status: "confirmada", origen: "whatsapp", waHash: CHAT },
      { id: "c", grupoId: "c", canchaId: "c1", fecha: MANANA, hora: "21:00", status: "confirmada", origen: "whatsapp", waHash: "otro" },
    ],
  });
  await e.txt("mis reservas");
  assert.match(e.cuerpo(), /Cancha 1 · vie 13 nov · 19:00 – 20:00 \(falta la seña\)/);
  assert.doesNotMatch(e.cuerpo(), /10:00|21:00/);
  assert.equal(reservasProximas([{ id: "x", fecha: HOY, hora: "15:00", status: "confirmada" }], HOY, "15:00").length, 0);
});

test("hablar con el club: aviso al dueño y el bot se calla N horas", async () => {
  const e = escenario({ club: { whatsappBot: { horasPausa: 2 } } });
  await e.txt("hola");
  await e.txt("hablar con el club");
  assert.match(e.cuerpo(), /le aviso a Club Norte/);
  const aviso = e.repo.st.avisos.find((a) => a.tipo === "whatsapp_humano");
  assert.match(aviso.mensaje, /2 h/);
  const n = e.sender.enviados.length;
  e.avanzar(60 * MIN);
  assert.equal(await e.txt("hola?"), "en pausa");
  assert.equal(e.sender.enviados.length, n);
  e.avanzar(61 * MIN);
  await e.txt("hola");
  assert.match(e.cuerpo(), /Bienvenido/);
});

test("coexistencia: un eco (el club escribió desde la app) pausa el chat 12 h por defecto", async () => {
  const e = escenario();
  await e.txt("hola");
  assert.equal(await e.enviar({ tipo: "eco" }), "eco: chat en pausa");
  const c = await e.chat();
  assert.equal(c.pausadoHasta, AHORA + 12 * 3600 * 1000);
  const n = e.sender.enviados.length;
  await e.op("dia:hoy");
  assert.equal(e.sender.enviados.length, n);
});

test("30 min sin actividad → la conversación vuelve a empezar", async () => {
  const e = escenario();
  await e.txt("hola");
  await e.op("dia:hoy");
  e.avanzar(31 * MIN);
  await e.op("hora:16:00");
  assert.match(e.cuerpo(), /Bienvenido/);
  assert.equal((await e.chat()).paso, "dia");
});

test("límites: máximo de reservas próximas por teléfono y 5 reservas cada 10 minutos", async () => {
  const prox = Array.from({ length: 4 }, (_, i) => ({ id: `r${i}`, grupoId: `r${i}`, canchaId: "c1", fecha: MANANA, hora: `0${i + 1}:00`, status: "confirmada", origen: "whatsapp", waHash: CHAT }));
  const e = escenario({ club: { seña: { tipo: "ninguna" } }, reservas: prox });
  await e.txt("hola");
  await e.op("dia:hoy");
  await e.op("hora:22:00");
  await e.op("cancha:c2");
  await e.txt("Ana");
  await e.op("ok:confirmar");
  assert.match(e.cuerpo(), /Ya tenés 4 reservas próximas/);

  const f = escenario({ club: { seña: { tipo: "ninguna" } } });
  await f.repo.setChat(CLUB, CHAT, { paso: "inicio", datos: {}, nombre: "Ana", waId: WA, limite: { ventanaInicio: AHORA - MIN, cuenta: 5 }, actualizadoEn: AHORA - MIN });
  await f.txt("hola");
  await f.op("dia:hoy");
  await f.op("hora:22:00");
  await f.op("cancha:c2");
  await f.op("ok:confirmar");
  assert.match(f.cuerpo(), /muchas reservas seguidas/);
});

test("club suspendido: no toma reservas", async () => {
  const e = escenario({ club: { suspendido: true } });
  assert.equal(await e.txt("hola"), "club suspendido");
  assert.match(e.cuerpo(), /no está tomando reservas/);
});

test("avisos fuera de la conversación: seña pagada fuera de la ventana de 24 h y retención vencida", async () => {
  const e = escenario();
  await e.txt("hola");
  const reserva = { id: "g", grupoId: "g", origen: "whatsapp", waHash: CHAT, status: "confirmada", seña: 1000, canchaName: "Cancha 1", fecha: MANANA, hora: "19:00", horaInicio: "19:00", horaFin: "20:00" };
  assert.match(await notificarSeñaPagada({ clubId: CLUB, reserva, repo: e.repo, sender: e.sender, ahoraMs: AHORA + 25 * 3600 * 1000 }), /fuera de la ventana/);
  assert.equal(await notificarSeñaPagada({ clubId: CLUB, reserva: { ...reserva, origen: "web" }, repo: e.repo, sender: e.sender, ahoraMs: AHORA }), "no es del bot");
  assert.equal(await notificarRetencionVencida({ clubId: CLUB, reserva, repo: e.repo, sender: e.sender, ahoraMs: AHORA + MIN }), "aviso enviado");
  assert.match(e.cuerpo(), /liberé el turno/);
});
