// functions/whatsapp/motor.js — la conversación del bot de reservas por WhatsApp, una por (club, teléfono).
//
// Sin Firestore ni red: todo entra por `repo` (datos del club y escrituras) y `sender` (mensajes). En producción los
// arma functions/whatsapp/repoFirestore.js + graph.crearSender; en los tests y en `node functions/whatsapp/simular.js`,
// whatsapp/repoMemoria.js + graph.crearSenderFalso. La disponibilidad, el precio, la seña, la política de seña y el
// límite de frecuencia salen de los MISMOS utils que la web (functions/lib/*.mjs, copias de src/utils/*.js).
//
// Pasos (chat.paso): inicio → dia → hora → cancha (si hay más de una libre) → duracion (si el club deja más de 1 h y
// entran) → nombre (si no lo sabemos) → confirmar → pago (seña por Mercado Pago) | listo.
// Comandos en cualquier momento: "cancelar", "mis reservas", "hablar con el club". Un chat sin actividad por
// CHAT_EXPIRA_MIN vuelve a empezar. Un chat en pausa (handover o el club escribió desde la app) no recibe respuestas.

const CHAT_EXPIRA_MIN = 30;
const HORAS_PAUSA_DEFECTO = 12;
const RETENCION_MIN = 20; // el turno sin seña pagada se libera solo (el link de MP vence a los 15 min)
const MAX_RESERVAS_PROXIMAS = 4; // reservas futuras por teléfono hechas por el bot en el club
const HORAS_POR_PAGINA = 8;
const VINCULO_DIAS = 30;

let utilsPromesa = null;
const utils = () =>
  (utilsPromesa ||= Promise.all([import("../lib/disponibilidad.mjs"), import("../lib/tarifas.mjs"), import("../lib/senas.mjs"), import("../lib/limites.mjs")]).then(([disp, tarifas, senas, limites]) => ({ disp, tarifas, senas, limites })));

// ----- Fechas y textos (hora argentina, UTC−3 fija) -----
const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
function ahoraArgentina(ms) {
  const d = new Date(ms - 3 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return { fecha: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`, hora: `${p(d.getUTCHours())}:00`, horaMin: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` };
}
function diaCorto(fecha) {
  const [y, m, d] = String(fecha).split("-").map(Number);
  return `${DIAS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${d} ${MESES[m - 1]}`;
}
function etiquetaDia(fecha, hoy, disp) {
  if (fecha === hoy) return "Hoy";
  if (fecha === disp.sumarDias(hoy, 1)) return "Mañana";
  return diaCorto(fecha);
}
const precioTxt = (n) => `$ ${String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
const rango = (desde, hasta) => (hasta && hasta !== desde ? `${desde} – ${hasta}` : desde);
// minúsculas, sin acentos ni signos, espacios simples
const normalizar = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9: ]+/g, " ").replace(/\s+/g, " ").trim();

function comandoDe(evento) {
  const id = evento.opcionId || "";
  if (id.startsWith("cmd:")) return id.slice(4);
  const t = normalizar(evento.texto);
  if (!t) return null;
  if (/^(cancelar|cancela|cancelo|anular|baja)( (la )?reserva)?$/.test(t)) return "cancelar";
  if (/^(mis reservas|mis turnos|mi reserva|mis reserva|reservas)$/.test(t)) return "mis_reservas";
  if (/^(hablar con (el )?club|hablar con alguien|humano|persona|atencion|operador|hablar)$/.test(t)) return "humano";
  if (/^(hola|buenas|buen dia|buenas tardes|buenas noches|menu|inicio|empezar|reservar|quiero reservar|turno|cancha)$/.test(t)) return "inicio";
  return null;
}

const chatNuevo = (previo = {}) => ({ paso: "inicio", datos: {}, nombre: previo.nombre || null, waId: previo.waId || null, nombrePerfil: previo.nombrePerfil || null, pausadoHasta: previo.pausadoHasta || null, limite: previo.limite || null, creadoEn: previo.creadoEn || null });

// Agrupa los slots de las reservas del teléfono: una por grupo, futuras y no canceladas, ordenadas
function reservasProximas(slots, hoy, horaAhora) {
  const cabezas = (slots || []).filter((r) => r && r.status !== "cancelada" && (!r.grupoId || r.grupoId === r.id));
  return cabezas
    .filter((r) => r.fecha > hoy || (r.fecha === hoy && (r.horaInicio || r.hora) > horaAhora))
    .sort((a, b) => `${a.fecha}${a.horaInicio || a.hora}`.localeCompare(`${b.fecha}${b.horaInicio || b.hora}`));
}
const describirReserva = (r) => `${r.canchaName || "Cancha"} · ${diaCorto(r.fecha)} · ${rango(r.horaInicio || r.hora, r.horaFin)}`;

// ============================================================================
// Entrada: un evento ya guardado (webhook) → respuestas. Devuelve un resumen corto para el log.
// { clubId, chatId (hash del teléfono), evento: { tipo: "mensaje" | "eco", waId, texto, opcionId, nombrePerfil },
//   repo, sender, ahoraMs, config: { linkBase } }
// ============================================================================
async function procesarEvento({ clubId, chatId, evento, repo, sender, ahoraMs = Date.now(), config = {} }) {
  const U = await utils();
  const club = await repo.club(clubId);
  if (!club) return "club inexistente";
  const horasPausa = Number.isFinite(Number(club.whatsappBot && club.whatsappBot.horasPausa)) && Number(club.whatsappBot.horasPausa) > 0 ? Number(club.whatsappBot.horasPausa) : HORAS_PAUSA_DEFECTO;
  const previo = await repo.getChat(clubId, chatId);
  let chat = previo ? { ...chatNuevo(previo), ...previo } : chatNuevo({ creadoEn: ahoraMs });

  // Coexistencia: alguien del club escribió desde la app WhatsApp Business → el bot se calla en ese chat
  if (evento.tipo === "eco") {
    chat.pausadoHasta = ahoraMs + horasPausa * 3600 * 1000;
    chat.pausaMotivo = "club";
    chat.actualizadoEn = ahoraMs;
    await repo.setChat(clubId, chatId, chat);
    return "eco: chat en pausa";
  }
  if (evento.waId) chat.waId = evento.waId;
  if (evento.nombrePerfil) chat.nombrePerfil = evento.nombrePerfil;
  chat.ultimoMensajeEn = ahoraMs; // abre la ventana de atención de 24 h
  if (chat.pausadoHasta && chat.pausadoHasta > ahoraMs) {
    await repo.setChat(clubId, chatId, chat);
    return "en pausa";
  }
  // Vencido por inactividad: vuelve a empezar (conserva el nombre y el límite)
  if (chat.actualizadoEn && ahoraMs - chat.actualizadoEn > CHAT_EXPIRA_MIN * 60000 && chat.paso !== "inicio") {
    chat = chatNuevo(chat);
  }

  const ctx = { U, club, clubId, chatId, chat, repo, sender, ahoraMs, to: chat.waId, config, horasPausa, ...ahoraArgentina(ahoraMs) };
  let resultado;
  if (club.suspendido === true) {
    await sender.texto(ctx.to, `Hola. ${club.nombre || "El club"} no está tomando reservas por WhatsApp en este momento.`);
    resultado = "club suspendido";
  } else {
    const cmd = comandoDe(evento);
    if (cmd === "cancelar") resultado = await comandoCancelar(ctx, evento);
    else if (cmd === "mis_reservas") resultado = await comandoMisReservas(ctx);
    else if (cmd === "humano") resultado = await comandoHumano(ctx);
    else if (cmd === "inicio" && !["nombre"].includes(chat.paso)) resultado = await saludar(ctx);
    else resultado = await seguirPaso(ctx, evento);
  }
  ctx.chat.actualizadoEn = ahoraMs;
  ctx.chat.expiraEn = ahoraMs + CHAT_EXPIRA_MIN * 60000;
  await repo.setChat(clubId, chatId, ctx.chat);
  return resultado;
}

// ----- Paso 1-2: saludo + día -----
async function saludar(ctx) {
  const nombre = ctx.chat.nombre ? `, ${ctx.chat.nombre.split(" ")[0]}` : "";
  const intro = `¡Hola${nombre}! Bienvenido a ${ctx.club.nombre || "el club"}. Te ayudo a reservar una cancha.\n\nEn cualquier momento podés escribir *cancelar*, *mis reservas* o *hablar con el club*.`;
  return preguntarDia(ctx, `${intro}\n\n¿Para qué día?`);
}

async function preguntarDia(ctx, cuerpo = "¿Para qué día querés reservar?") {
  const dias = ctx.U.disp.diasReservables(ctx.club, ctx.fecha);
  const botones = [{ id: "dia:hoy", titulo: "Hoy" }];
  if (dias.length > 1) botones.push({ id: "dia:manana", titulo: "Mañana" });
  if (dias.length > 2) botones.push({ id: "dia:otro", titulo: "Otro día" });
  ctx.chat.paso = "dia";
  ctx.chat.datos = {};
  await ctx.sender.botones(ctx.to, cuerpo, botones);
  return "pregunta día";
}

async function listaDeDias(ctx) {
  const dias = ctx.U.disp.diasReservables(ctx.club, ctx.fecha).slice(0, 10);
  ctx.chat.paso = "dia";
  await ctx.sender.lista(ctx.to, "Elegí el día:", "Ver días", [{ filas: dias.map((f) => ({ id: `dia:${f}`, titulo: etiquetaDia(f, ctx.fecha, ctx.U.disp), descripcion: f === ctx.fecha || f === ctx.U.disp.sumarDias(ctx.fecha, 1) ? diaCorto(f) : undefined })) }]);
  return "lista de días";
}

function fechaDeRespuesta(ctx, evento) {
  const dias = ctx.U.disp.diasReservables(ctx.club, ctx.fecha);
  const id = evento.opcionId || "";
  const t = normalizar(evento.texto);
  let fecha = null;
  if (id === "dia:hoy" || t === "hoy") fecha = ctx.fecha;
  else if (id === "dia:manana" || t === "manana") fecha = ctx.U.disp.sumarDias(ctx.fecha, 1);
  else if (id === "dia:otro" || t === "otro dia" || t === "otro") return "otro";
  else if (/^dia:\d{4}-\d{2}-\d{2}$/.test(id)) fecha = id.slice(4);
  else {
    // "15/11" o "15-11"
    const m = t.match(/^(\d{1,2})[ /.-](\d{1,2})$/) || String(evento.texto || "").trim().match(/^(\d{1,2})\/(\d{1,2})$/);
    if (m) fecha = dias.find((f) => Number(f.slice(8)) === Number(m[1]) && Number(f.slice(5, 7)) === Number(m[2])) || "fuera";
  }
  if (fecha && fecha !== "fuera" && !dias.includes(fecha)) return "fuera";
  return fecha;
}

// ----- Paso 3: horarios libres de la grilla real -----
async function libresDelDia(ctx, fecha) {
  const [canchas, reservas, turnosFijos] = await Promise.all([ctx.repo.canchas(ctx.clubId), ctx.repo.reservasDelDia(ctx.clubId, fecha), ctx.repo.turnosFijos(ctx.clubId)]);
  const libres = ctx.U.disp.turnosLibres({ canchas, reservas, turnosFijos, fecha, horaAhora: fecha === ctx.fecha ? ctx.hora : null });
  return { canchas, reservas, turnosFijos, libres };
}

async function ofrecerHoras(ctx, fecha, pagina = 0) {
  const { libres } = await libresDelDia(ctx, fecha);
  const etiqueta = etiquetaDia(fecha, ctx.fecha, ctx.U.disp);
  if (!libres.length) {
    await preguntarDia(ctx, `No quedan turnos libres para ${etiqueta === "Hoy" || etiqueta === "Mañana" ? etiqueta.toLowerCase() : `el ${etiqueta}`}. ¿Probamos otro día?`);
    return "sin turnos";
  }
  const desde = pagina * HORAS_POR_PAGINA;
  const pag = libres.slice(desde, desde + HORAS_POR_PAGINA);
  if (!pag.length) return ofrecerHoras(ctx, fecha, 0);
  const filas = pag.map((l) => {
    const precios = l.canchas.map((c) => ctx.U.tarifas.precioDeSlot(c, fecha, l.hora));
    const min = Math.min(...precios);
    return { id: `hora:${l.hora}`, titulo: l.hora, descripcion: `${l.canchas.length === 1 ? "1 cancha" : `${l.canchas.length} canchas`} · ${precios.every((p) => p === min) ? "" : "desde "}${precioTxt(min)}` };
  });
  if (desde + HORAS_POR_PAGINA < libres.length) filas.push({ id: `hora:mas:${pagina + 1}`, titulo: "Ver más", descripcion: "Horarios más tarde" });
  else if (pagina > 0) filas.push({ id: "hora:mas:0", titulo: "Ver desde el principio" });
  filas.push({ id: "dia:cambiar", titulo: "Cambiar día" });
  ctx.chat.paso = "hora";
  ctx.chat.datos = { fecha };
  await ctx.sender.lista(ctx.to, `Turnos libres para ${etiqueta === "Hoy" || etiqueta === "Mañana" ? etiqueta.toLowerCase() : `el ${etiqueta}`} (${diaCorto(fecha)}). Elegí el horario:`, "Ver horarios", [{ filas }]);
  return `horas de ${fecha} (página ${pagina})`;
}

// ----- Paso 4-5: cancha y duración -----
async function elegirHora(ctx, hora) {
  const fecha = ctx.chat.datos.fecha;
  const { libres } = await libresDelDia(ctx, fecha);
  const slot = libres.find((l) => l.hora === hora);
  if (!slot) {
    await ctx.sender.texto(ctx.to, `Las ${hora} ya no está libre. Te muestro lo que queda.`);
    return ofrecerHoras(ctx, fecha);
  }
  ctx.chat.datos = { fecha, hora };
  if (slot.canchas.length === 1) return elegirCancha(ctx, slot.canchas[0].id);
  ctx.chat.paso = "cancha";
  await ctx.sender.lista(ctx.to, `A las ${hora} hay ${slot.canchas.length} canchas libres. ¿Cuál querés?`, "Ver canchas", [
    { filas: slot.canchas.slice(0, 10).map((c) => ({ id: `cancha:${c.id}`, titulo: c.nombre || "Cancha", descripcion: [precioTxt(ctx.U.tarifas.precioDeSlot(c, fecha, hora)), c.techada ? "Techada" : null, c.superficie || null].filter(Boolean).join(" · ") })) },
  ]);
  return "pregunta cancha";
}

async function elegirCancha(ctx, canchaId) {
  const { fecha, hora } = ctx.chat.datos;
  const { canchas, reservas, turnosFijos } = await libresDelDia(ctx, fecha);
  const cancha = canchas.find((c) => c.id === canchaId);
  if (!cancha || ctx.U.disp.estadoDeCelda({ cancha, hora, fecha, reservas, turnosFijos }) !== "libre") {
    await ctx.sender.texto(ctx.to, "Esa cancha ya no está libre a esa hora. Te muestro lo que queda.");
    return ofrecerHoras(ctx, fecha);
  }
  ctx.chat.datos = { fecha, hora, canchaId, canchaNombre: cancha.nombre || "Cancha" };
  const max = ctx.U.tarifas.maxTurnosDelClub(ctx.club);
  const entran = ctx.U.disp.horasSeguidasLibres({ cancha, hora, fecha, reservas, turnosFijos, max });
  if (entran > 1) {
    ctx.chat.paso = "duracion";
    const botones = Array.from({ length: entran }, (_, i) => ({ id: `dur:${i + 1}`, titulo: `${i + 1} h` }));
    await ctx.sender.botones(ctx.to, `${cancha.nombre || "Cancha"} a las ${hora}. ¿Cuánto tiempo?`, botones);
    return "pregunta duración";
  }
  return elegirDuracion(ctx, 1);
}

async function elegirDuracion(ctx, turnos) {
  ctx.chat.datos.turnos = turnos;
  if (!ctx.chat.nombre) {
    ctx.chat.paso = "nombre";
    const perfil = ctx.chat.nombrePerfil && ctx.chat.nombrePerfil.trim().length >= 2 ? ctx.chat.nombrePerfil.trim().slice(0, 20) : null;
    if (perfil) await ctx.sender.botones(ctx.to, "¿A nombre de quién hago la reserva? Escribí nombre y apellido.", [{ id: "nombre:perfil", titulo: perfil }]);
    else await ctx.sender.texto(ctx.to, "¿A nombre de quién hago la reserva? Escribí nombre y apellido.");
    return "pregunta nombre";
  }
  return mostrarResumen(ctx);
}

// ----- Paso 6: resumen con precio y seña -----
async function calcularReserva(ctx) {
  const { fecha, hora, canchaId, turnos } = ctx.chat.datos;
  const canchas = await ctx.repo.canchas(ctx.clubId);
  const cancha = canchas.find((c) => c.id === canchaId);
  if (!cancha) return null;
  const precios = ctx.U.tarifas.preciosDeReserva(cancha, fecha, hora, turnos);
  const precioTotal = precios.reduce((a, b) => a + b, 0);
  const seña = ctx.U.tarifas.calcularSeña(ctx.club, precioTotal);
  const mpConectado = !!(ctx.club.mercadoPago && ctx.club.mercadoPago.conectado === true);
  return { cancha, precios, precioTotal, seña, mpConectado, horaFin: ctx.U.tarifas.sumarHoras(hora, turnos) };
}

async function mostrarResumen(ctx) {
  const c = await calcularReserva(ctx);
  if (!c) return preguntarDia(ctx, "Esa cancha ya no está disponible. ¿Para qué día querés reservar?");
  const { fecha, hora } = ctx.chat.datos;
  const lineas = [`*${ctx.club.nombre || "Club"}*`, `${c.cancha.nombre || "Cancha"} · ${diaCorto(fecha)} · ${rango(hora, c.horaFin)}`, `A nombre de: ${ctx.chat.nombre}`, `Precio: ${precioTxt(c.precioTotal)}`];
  if (c.seña > 0 && c.mpConectado) lineas.push(`Seña: ${precioTxt(c.seña)}. Te mando el link de Mercado Pago y la reserva queda confirmada cuando se paga (tenés ${RETENCION_MIN} minutos).`);
  else if (c.seña > 0) lineas.push(`Seña: ${precioTxt(c.seña)}. La pagás en el club.`);
  ctx.chat.paso = "confirmar";
  await ctx.sender.botones(ctx.to, lineas.join("\n"), [
    { id: "ok:confirmar", titulo: "Confirmar" },
    { id: "ok:cambiar", titulo: "Cambiar" },
    { id: "cmd:cancelar", titulo: "Cancelar" },
  ]);
  return "resumen";
}

// ----- Confirmar: crea la reserva (y el link de la seña) -----
async function confirmar(ctx) {
  const { U, club, clubId, chat } = ctx;
  // Límite de frecuencia (el mismo de la web: 5 reservas cada 10 minutos)
  const lim = U.limites.siguienteLimite(chat.limite, ctx.ahoraMs, "reservas");
  if (lim.excede) {
    await ctx.sender.texto(ctx.to, `Hiciste muchas reservas seguidas. Probá de nuevo en ${U.limites.minutosParaReintentar(chat.limite, ctx.ahoraMs)} min.`);
    return "límite";
  }
  const proximas = reservasProximas(await ctx.repo.reservasDelTelefono(clubId, ctx.chatId), ctx.fecha, ctx.hora);
  if (proximas.length >= MAX_RESERVAS_PROXIMAS) {
    await ctx.sender.texto(ctx.to, `Ya tenés ${proximas.length} reservas próximas en ${club.nombre || "el club"}. Para reservar más, escribí *hablar con el club*.`);
    chat.paso = "inicio";
    return "máximo de reservas";
  }
  const c = await calcularReserva(ctx);
  if (!c) return preguntarDia(ctx, "Esa cancha ya no está disponible. ¿Para qué día querés reservar?");
  const { fecha, hora, turnos } = chat.datos;
  const conSeñaOnline = c.seña > 0 && c.mpConectado;
  const reservaDirecta = club.reservaDirecta !== false;
  const status = conSeñaOnline ? "pendiente" : reservaDirecta ? "confirmada" : "pendiente";
  let grupoId;
  try {
    grupoId = await ctx.repo.crearReserva(clubId, {
      canchaId: c.cancha.id,
      canchaName: c.cancha.nombre || "Cancha",
      fecha,
      hora,
      turnos,
      precios: c.precios,
      seña: c.seña,
      status,
      nombreJugador: chat.nombre,
      telefono: `+${String(chat.waId || "").replace(/\D/g, "")}`,
      waHash: ctx.chatId,
      // Si el teléfono ya se sumó a una cuenta de Padely (link de la confirmación), la reserva nace con su uid
      jugadorUid: chat.uidVinculado || null,
      retencionHastaMs: conSeñaOnline ? ctx.ahoraMs + RETENCION_MIN * 60000 : null,
    });
  } catch (err) {
    if (err && err.code === "SLOT_TAKEN") {
      await ctx.sender.texto(ctx.to, "Uh, alguien acaba de reservar ese turno. Te muestro lo que queda.");
      return ofrecerHoras(ctx, fecha);
    }
    throw err;
  }
  chat.limite = lim.nuevaVentana ? { ventanaInicio: ctx.ahoraMs, cuenta: 1 } : { ...chat.limite, cuenta: lim.cuenta };
  const desc = `${c.cancha.nombre || "Cancha"} · ${diaCorto(fecha)} · ${rango(hora, c.horaFin)}`;
  await ctx.repo.avisarClub(clubId, { tipo: "nueva_reserva", titulo: "Nueva reserva por WhatsApp", mensaje: `${chat.nombre} reservó ${desc}${conSeñaOnline ? " (seña pendiente)" : ""}.`, link: `/admin/canchas?fecha=${fecha}` }).catch(() => {});

  if (conSeñaOnline) {
    let pago = null;
    try {
      pago = await ctx.repo.crearPagoSeña(clubId, grupoId, { nombre: chat.nombre });
    } catch {
      pago = null;
    }
    if (!pago || !pago.link) {
      await ctx.repo.cancelarReserva(clubId, grupoId, { motivo: "sin link de seña" });
      chat.paso = "inicio";
      await ctx.sender.texto(ctx.to, "No pude generar el link de pago de la seña. Probá de nuevo en un rato o escribí *hablar con el club*.");
      return "sin link de pago";
    }
    chat.paso = "pago";
    chat.datos = { ...chat.datos, grupoId, link: pago.link };
    await ctx.sender.ctaUrl(ctx.to, `Te reservé ${desc} por ${RETENCION_MIN} minutos.\n\nPagá la seña (${precioTxt(c.seña)}) con Mercado Pago para confirmarla. Si no se paga, el turno se libera solo.`, "Pagar la seña", pago.link);
    return `reserva ${grupoId} pendiente de seña`;
  }
  chat.paso = "inicio";
  chat.datos = {};
  if (status === "confirmada") {
    await enviarConfirmacion(ctx, { grupoId, desc, seña: c.seña, señaPagada: false });
    return `reserva ${grupoId} confirmada`;
  }
  await ctx.sender.texto(ctx.to, `Listo, mandé tu pedido: ${desc}. El club tiene que confirmarlo; te avisan por acá.${c.seña > 0 ? ` La seña (${precioTxt(c.seña)}) la pagás en el club.` : ""}`);
  return `reserva ${grupoId} pendiente del club`;
}

// Confirmación (también la usa el webhook de Mercado Pago cuando se paga la seña): texto + link para sumar la reserva
// a una cuenta de Padely
async function enviarConfirmacion(ctx, { desc, seña, señaPagada }) {
  const extra = seña > 0 ? (señaPagada ? `\nSeña pagada: ${precioTxt(seña)}.` : `\nLa seña (${precioTxt(seña)}) la pagás en el club.`) : "";
  await ctx.sender.texto(ctx.to, `¡Listo! Reserva confirmada ✅\n${ctx.club.nombre || "Club"} · ${desc}\nA nombre de ${ctx.chat.nombre || "vos"}.${extra}\n\nPara cancelar escribí *cancelar*.`);
  const link = ctx.repo.linkVincular ? ctx.repo.linkVincular(ctx.clubId, ctx.chatId, ctx.ahoraMs + VINCULO_DIAS * 86400000) : null;
  if (link) await ctx.sender.ctaUrl(ctx.to, "¿Tenés cuenta en Padely? Sumá esta reserva (y las próximas que hagas por acá) a tu cuenta para verlas en la app.", "Sumar a Padely", link);
}

// ----- Paso a paso -----
async function seguirPaso(ctx, evento) {
  const { chat } = ctx;
  const id = evento.opcionId || "";
  const t = normalizar(evento.texto);
  switch (chat.paso) {
    case "dia": {
      if (id === "dia:cambiar") return preguntarDia(ctx);
      const f = fechaDeRespuesta(ctx, evento);
      if (f === "otro") return listaDeDias(ctx);
      if (f === "fuera") {
        await ctx.sender.texto(ctx.to, "Ese día no se puede reservar todavía.");
        return listaDeDias(ctx);
      }
      if (!f) return preguntarDia(ctx, "No te entendí. ¿Para qué día querés reservar?");
      return ofrecerHoras(ctx, f);
    }
    case "hora": {
      if (id === "dia:cambiar" || t === "cambiar dia") return preguntarDia(ctx);
      if (id.startsWith("hora:mas:")) return ofrecerHoras(ctx, chat.datos.fecha, Number(id.slice(9)) || 0);
      let hora = id.startsWith("hora:") ? id.slice(5) : null;
      if (!hora) {
        const m = t.match(/^(\d{1,2})(?::00| ?hs?)?$/);
        if (m && Number(m[1]) < 24) hora = `${String(Number(m[1])).padStart(2, "0")}:00`;
      }
      if (!hora) return ofrecerHoras(ctx, chat.datos.fecha);
      return elegirHora(ctx, hora);
    }
    case "cancha": {
      if (id.startsWith("cancha:")) return elegirCancha(ctx, id.slice(7));
      const canchas = await ctx.repo.canchas(ctx.clubId);
      const porNombre = canchas.find((c) => normalizar(c.nombre) === t || normalizar(c.nombre).endsWith(` ${t}`));
      if (porNombre) return elegirCancha(ctx, porNombre.id);
      return elegirHora(ctx, chat.datos.hora);
    }
    case "duracion": {
      const n = id.startsWith("dur:") ? Number(id.slice(4)) : Number((t.match(/^(\d)/) || [])[1]);
      const max = ctx.U.tarifas.maxTurnosDelClub(ctx.club);
      if (!(n >= 1 && n <= max)) return elegirCancha(ctx, chat.datos.canchaId);
      // Vuelve a mirar que entren las N horas
      const { canchas, reservas, turnosFijos } = await libresDelDia(ctx, chat.datos.fecha);
      const cancha = canchas.find((c) => c.id === chat.datos.canchaId);
      if (!cancha || ctx.U.disp.horasSeguidasLibres({ cancha, hora: chat.datos.hora, fecha: chat.datos.fecha, reservas, turnosFijos, max }) < n) return elegirCancha(ctx, chat.datos.canchaId);
      return elegirDuracion(ctx, n);
    }
    case "nombre": {
      let nombre = id === "nombre:perfil" ? chat.nombrePerfil : String(evento.texto || "");
      nombre = nombre.replace(/\s+/g, " ").trim().slice(0, 60);
      if (nombre.length < 2 || !/\p{L}/u.test(nombre)) {
        await ctx.sender.texto(ctx.to, "Escribí tu nombre y apellido, por favor.");
        return "nombre inválido";
      }
      chat.nombre = nombre;
      return mostrarResumen(ctx);
    }
    case "confirmar": {
      if (id === "ok:confirmar" || ["si", "confirmar", "confirmo", "dale", "ok"].includes(t)) return confirmar(ctx);
      if (id === "ok:cambiar" || t === "cambiar") return preguntarDia(ctx);
      return mostrarResumen(ctx);
    }
    case "pago": {
      await ctx.sender.ctaUrl(ctx.to, "Tu turno está reservado esperando la seña. Pagala con este link para confirmarlo, o escribí *cancelar* para liberarlo.", "Pagar la seña", chat.datos.link);
      return "recordatorio de pago";
    }
    case "cancelar_elegir": {
      if (id.startsWith("anular:")) return confirmarAnulacion(ctx, id.slice(7));
      chat.paso = "inicio";
      return saludar(ctx);
    }
    case "cancelar_confirmar": {
      if (id === "anular:si" || t === "si") return anular(ctx, chat.datos.grupoId);
      chat.paso = "inicio";
      chat.datos = {};
      await ctx.sender.texto(ctx.to, "Perfecto, tu reserva sigue en pie.");
      return "anulación descartada";
    }
    default:
      return saludar(ctx);
  }
}

// ----- Comandos -----
const PASOS_DEL_FLUJO = ["dia", "hora", "cancha", "duracion", "nombre", "confirmar"];

async function comandoCancelar(ctx) {
  const { chat } = ctx;
  if (PASOS_DEL_FLUJO.includes(chat.paso)) {
    chat.paso = "inicio";
    chat.datos = {};
    await ctx.sender.texto(ctx.to, "Listo, cancelé la reserva que estábamos armando. Escribí *hola* cuando quieras reservar.");
    return "flujo cancelado";
  }
  if (chat.paso === "pago" && chat.datos.grupoId) {
    const gid = chat.datos.grupoId;
    await ctx.repo.cancelarReserva(ctx.clubId, gid, { motivo: "cancelada por WhatsApp antes de pagar la seña" });
    chat.paso = "inicio";
    chat.datos = {};
    await ctx.sender.texto(ctx.to, "Listo, liberé el turno. No se cobró nada.");
    return `reserva ${gid} cancelada sin seña`;
  }
  const proximas = reservasProximas(await ctx.repo.reservasDelTelefono(ctx.clubId, ctx.chatId), ctx.fecha, ctx.hora);
  if (!proximas.length) {
    chat.paso = "inicio";
    await ctx.sender.texto(ctx.to, "No tenés reservas próximas hechas por WhatsApp en este club.");
    return "nada para cancelar";
  }
  if (proximas.length === 1) return confirmarAnulacion(ctx, proximas[0].id);
  chat.paso = "cancelar_elegir";
  await ctx.sender.lista(ctx.to, "¿Qué reserva querés cancelar?", "Ver reservas", [{ filas: proximas.slice(0, 10).map((r) => ({ id: `anular:${r.id}`, titulo: `${diaCorto(r.fecha)} ${r.horaInicio || r.hora}`, descripcion: r.canchaName || "Cancha" })) }]);
  return "elegir reserva a cancelar";
}

async function confirmarAnulacion(ctx, grupoId) {
  const proximas = reservasProximas(await ctx.repo.reservasDelTelefono(ctx.clubId, ctx.chatId), ctx.fecha, ctx.hora);
  const r = proximas.find((x) => x.id === grupoId);
  if (!r) {
    ctx.chat.paso = "inicio";
    await ctx.sender.texto(ctx.to, "No encontré esa reserva.");
    return "reserva no encontrada";
  }
  const { senas } = ctx.U;
  const s = senas.resolverSeñaCancelada({ canceladaPor: "jugador", politica: senas.politicaDe(ctx.club), inicioTurnoMs: senas.inicioDelTurnoMs(r.fecha, r.horaInicio || r.hora), ahoraMs: ctx.ahoraMs, señaPagada: !!r.señaPagada, monto: Number(r.seña) || 0, medio: r.señaMedio || null });
  const montoTxt = precioTxt(r.seña);
  const aviso = {
    nada: "",
    reembolso_mp: `\nTe devolvemos la seña (${montoTxt}) por Mercado Pago.`,
    credito: `\nLa seña (${montoTxt}) se devuelve: el club se va a comunicar con vos.`,
    queda_club: `\nOjo: según la política del club, la seña (${montoTxt}) no se devuelve (${s.motivo}).`,
  }[s.accion];
  ctx.chat.paso = "cancelar_confirmar";
  ctx.chat.datos = { grupoId };
  await ctx.sender.botones(ctx.to, `¿Cancelás ${describirReserva(r)}?${aviso}`, [
    { id: "anular:si", titulo: "Sí, cancelar" },
    { id: "anular:no", titulo: "No" },
  ]);
  return "confirmar anulación";
}

async function anular(ctx, grupoId) {
  const proximas = reservasProximas(await ctx.repo.reservasDelTelefono(ctx.clubId, ctx.chatId), ctx.fecha, ctx.hora);
  const r = proximas.find((x) => x.id === grupoId);
  ctx.chat.paso = "inicio";
  ctx.chat.datos = {};
  if (!r) {
    await ctx.sender.texto(ctx.to, "Esa reserva ya no está activa.");
    return "nada que anular";
  }
  // canceladaPor "jugador": onReservaUpdated aplica la política de seña del club (devolución por MP o queda en el club)
  await ctx.repo.cancelarReserva(ctx.clubId, grupoId, { motivo: "cancelada por WhatsApp" });
  await ctx.repo.avisarClub(ctx.clubId, { tipo: "reserva_cancelada", titulo: "Reserva cancelada por WhatsApp", mensaje: `${r.nombreJugador || "Un jugador"} canceló ${describirReserva(r)}.`, link: `/admin/canchas?fecha=${r.fecha}` }).catch(() => {});
  await ctx.sender.texto(ctx.to, `Listo, cancelé tu reserva: ${describirReserva(r)}.`);
  return `reserva ${grupoId} cancelada`;
}

async function comandoMisReservas(ctx) {
  const proximas = reservasProximas(await ctx.repo.reservasDelTelefono(ctx.clubId, ctx.chatId), ctx.fecha, ctx.hora);
  if (PASOS_DEL_FLUJO.includes(ctx.chat.paso)) ctx.chat.paso = "inicio";
  if (!proximas.length) {
    await ctx.sender.texto(ctx.to, `No tenés reservas próximas en ${ctx.club.nombre || "el club"} hechas por WhatsApp. Escribí *hola* para reservar.`);
    return "sin reservas";
  }
  const lineas = proximas.slice(0, 10).map((r) => {
    const estado = r.status === "pendiente" ? (Number(r.seña) > 0 && !r.señaPagada ? " (falta la seña)" : " (a confirmar por el club)") : "";
    return `• ${describirReserva(r)}${estado}`;
  });
  await ctx.sender.texto(ctx.to, `Tus próximas reservas en ${ctx.club.nombre || "el club"}:\n${lineas.join("\n")}\n\nPara cancelar una, escribí *cancelar*.`);
  return `${proximas.length} reservas`;
}

async function comandoHumano(ctx) {
  ctx.chat.pausadoHasta = ctx.ahoraMs + ctx.horasPausa * 3600 * 1000;
  ctx.chat.pausaMotivo = "pedido";
  ctx.chat.paso = "inicio";
  ctx.chat.datos = {};
  await ctx.repo.avisarClub(ctx.clubId, { tipo: "whatsapp_humano", titulo: "Te escriben por WhatsApp", mensaje: `${ctx.chat.nombre || ctx.chat.nombrePerfil || "Un cliente"} pidió hablar con alguien del club. Respondé desde WhatsApp Business: el bot queda en pausa en ese chat por ${ctx.horasPausa} h.`, link: "/admin/canchas" }).catch(() => {});
  await ctx.sender.texto(ctx.to, `Listo, le aviso a ${ctx.club.nombre || "el club"}. Te van a responder por acá en cuanto puedan.`);
  return "handover";
}

// ============================================================================
// Fuera de la conversación: avisos que salen de otros eventos del servidor
// ============================================================================
async function contextoDeAviso({ clubId, reserva, repo, sender, ahoraMs }) {
  if (!reserva || reserva.origen !== "whatsapp" || !reserva.waHash) return null;
  const [club, chat] = await Promise.all([repo.club(clubId), repo.getChat(clubId, reserva.waHash)]);
  if (!club || !chat || !chat.waId) return null;
  // Sin plantillas (v1): solo dentro de la ventana de 24 h desde el último mensaje del cliente
  const ultimo = chat.ultimoMensajeEn || chat.actualizadoEn || 0;
  if (ahoraMs - ultimo > 24 * 3600 * 1000) return { fueraDeVentana: true };
  return { U: await utils(), club, clubId, chatId: reserva.waHash, chat: { ...chatNuevo(chat), ...chat }, repo, sender, ahoraMs, to: chat.waId, ...ahoraArgentina(ahoraMs) };
}

// La seña de una reserva del bot se pagó (mpWebhook → aplicarPagoLeido): confirmación + link para sumarla a Padely
async function notificarSeñaPagada({ clubId, reserva, repo, sender, ahoraMs = Date.now() }) {
  const ctx = await contextoDeAviso({ clubId, reserva, repo, sender, ahoraMs });
  if (!ctx) return "no es del bot";
  if (ctx.fueraDeVentana) return "fuera de la ventana de 24 h (falta la plantilla de confirmación)";
  const desc = `${reserva.canchaName || "Cancha"} · ${diaCorto(reserva.fecha)} · ${rango(reserva.horaInicio || reserva.hora, reserva.horaFin)}`;
  if (ctx.chat.paso === "pago") {
    ctx.chat.paso = "inicio";
    ctx.chat.datos = {};
  }
  const confirmada = reserva.status === "confirmada";
  if (confirmada) await enviarConfirmacion(ctx, { desc, seña: Number(reserva.seña) || 0, señaPagada: true });
  else await ctx.sender.texto(ctx.to, `Recibimos la seña (${precioTxt(reserva.seña)}) de ${desc}. El club tiene que confirmar la reserva; te avisan por acá.`);
  await repo.setChat(clubId, ctx.chatId, ctx.chat);
  return confirmada ? "confirmación enviada" : "seña recibida, falta el club";
}

// El turno retenido sin seña se liberó (barrido waLiberarReservas)
async function notificarRetencionVencida({ clubId, reserva, repo, sender, ahoraMs = Date.now() }) {
  const ctx = await contextoDeAviso({ clubId, reserva, repo, sender, ahoraMs });
  if (!ctx || ctx.fueraDeVentana) return "sin aviso";
  if (ctx.chat.paso === "pago" && ctx.chat.datos && ctx.chat.datos.grupoId === (reserva.grupoId || reserva.id)) {
    ctx.chat.paso = "inicio";
    ctx.chat.datos = {};
    await repo.setChat(clubId, ctx.chatId, ctx.chat);
  }
  await ctx.sender.texto(ctx.to, `No se pagó la seña a tiempo y liberé el turno (${reserva.canchaName || "Cancha"} · ${diaCorto(reserva.fecha)} ${reserva.horaInicio || reserva.hora}). Escribí *hola* si querés reservar de nuevo.`);
  return "aviso enviado";
}

module.exports = { procesarEvento, enviarConfirmacion, notificarSeñaPagada, notificarRetencionVencida, comandoDe, normalizar, reservasProximas, ahoraArgentina, diaCorto, precioTxt, rango, chatNuevo, CHAT_EXPIRA_MIN, HORAS_PAUSA_DEFECTO, RETENCION_MIN, MAX_RESERVAS_PROXIMAS, HORAS_POR_PAGINA };
