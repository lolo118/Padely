#!/usr/bin/env node
// Simulador del bot de WhatsApp en la terminal, contra un club y una grilla EN MEMORIA (no toca Firestore ni Meta).
//   node functions/whatsapp/simular.js            (desde la raíz del repo; antes: node functions/sync-utils.mjs)
// Escribí como si fueras el cliente. Cuando el bot manda botones o una lista, respondé con el número de la opción.
// Comandos del simulador: /pagar (Mercado Pago aprueba la seña), /eco (alguien del club escribe desde la app),
//   /mas N (avanza el reloj N minutos), /reservas (la grilla del club), /estado (el chat), /salir
const readline = require("node:readline");
const { procesarEvento, notificarSeñaPagada } = require("./motor");
const { crearSenderFalso } = require("./graph");
const { crearRepoMemoria } = require("./repoMemoria");

const CLUB = "clubDemo";
const WA_ID = "5493815551234";
const CHAT = "hashdemo";
const H = (desde, hasta) => Array.from({ length: hasta - desde }, (_, i) => `${String(desde + i).padStart(2, "0")}:00`);

function datosDemo(hoy) {
  return {
    clubs: { [CLUB]: { nombre: "Club Demo Padel", diasAnticipacion: 7, maxTurnosPorReserva: 2, reservaDirecta: true, seña: { tipo: "porcentaje", valor: 30 }, politicaSeña: { reembolso: "hasta_horas", horas: 24 }, mercadoPago: { conectado: true }, ownerUid: "dueño" } },
    canchas: {
      [CLUB]: [
        { id: "c1", nombre: "Cancha 1", precioBase: 24000, horarios: { "20:00": 30000, "21:00": 30000, "22:00": 30000 }, horariosDisponibles: H(8, 24), techada: true },
        { id: "c2", nombre: "Cancha 2", precioBase: 22000, horariosDisponibles: H(14, 23) },
      ],
    },
    reservas: { [CLUB]: [{ id: `c1_${hoy}_2000`, canchaId: "c1", fecha: hoy, hora: "20:00", status: "confirmada", nombreJugador: "Gómez" }] },
    turnosFijos: { [CLUB]: [] },
  };
}

async function main() {
  let ahora = Date.now();
  const hoy = new Date(ahora - 3 * 3600000).toISOString().slice(0, 10);
  const repo = crearRepoMemoria(datosDemo(hoy));
  let opciones = [];
  const imprimir = (tipo, p) => {
    const i = p.interactive;
    if (tipo === "texto") console.log(`\n🤖 ${p.text.body}`);
    else if (tipo === "botones") {
      opciones = i.action.buttons.map((b) => ({ id: b.reply.id, titulo: b.reply.title }));
      console.log(`\n🤖 ${i.body.text}`);
      opciones.forEach((o, n) => console.log(`   [${n + 1}] ${o.titulo}`));
    } else if (tipo === "lista") {
      opciones = i.action.sections.flatMap((s) => s.rows.map((r) => ({ id: r.id, titulo: r.title, descripcion: r.description })));
      console.log(`\n🤖 ${i.body.text}   (${i.action.button})`);
      opciones.forEach((o, n) => console.log(`   [${n + 1}] ${o.titulo}${o.descripcion ? ` — ${o.descripcion}` : ""}`));
    } else if (tipo === "cta") console.log(`\n🤖 ${i.body.text}\n   🔗 ${i.action.parameters.display_text}: ${i.action.parameters.url}`);
  };
  const sender = crearSenderFalso({ imprimir });
  const enviar = (evento) => procesarEvento({ clubId: CLUB, chatId: CHAT, evento: { tipo: "mensaje", waId: WA_ID, nombrePerfil: "Sebas", ...evento }, repo, sender, ahoraMs: ahora }).catch((err) => console.error("✖", err));

  console.log("Simulador del bot de WhatsApp de Padely (club y grilla en memoria). /salir para terminar. Escribí 'hola'.");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "\n👤 " });
  rl.prompt();
  for await (const linea of rl) {
    const t = linea.trim();
    if (t === "/salir") break;
    if (t.startsWith("/mas")) ahora += (Number(t.split(" ")[1]) || 31) * 60000;
    else if (t === "/estado") console.log(JSON.stringify(await repo.getChat(CLUB, CHAT), null, 2));
    else if (t === "/reservas") console.log([...repo.st.reservas[CLUB].values()].map((r) => `${r.fecha} ${r.hora} ${r.canchaId} ${r.status}${r.señaPagada ? " seña ✓" : ""} ${r.nombreJugador || ""}`).join("\n"));
    else if (t === "/eco") console.log(await procesarEvento({ clubId: CLUB, chatId: CHAT, evento: { tipo: "eco", waId: WA_ID }, repo, sender, ahoraMs: ahora }));
    else if (t === "/pagar") {
      const chat = await repo.getChat(CLUB, CHAT);
      const gid = chat && chat.datos && chat.datos.grupoId;
      if (!gid) console.log("(no hay una seña esperando pago)");
      else console.log(await notificarSeñaPagada({ clubId: CLUB, reserva: await repo.pagarSeña(CLUB, gid), repo, sender, ahoraMs: ahora }));
    } else if (/^\d+$/.test(t) && opciones[Number(t) - 1]) {
      const o = opciones[Number(t) - 1];
      await enviar({ texto: o.titulo, opcionId: o.id, tipoMensaje: "interactive" });
    } else if (t) await enviar({ texto: t, tipoMensaje: "text" });
    rl.prompt();
  }
  rl.close();
}

main();
