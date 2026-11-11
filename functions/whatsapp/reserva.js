// functions/whatsapp/reserva.js — los documentos de una reserva hecha por el bot. Mismo formato que la web
// (services/canchaService.crearReserva: un slot por hora con los campos del grupo, contacto aparte en
// contactosReservas) más lo del bot: origen "whatsapp", waHash (id del chat = HMAC del teléfono), telefonoMascara y
// waRetencionHasta (hasta cuándo se guarda el turno sin seña). Sin jugadorUid: se suma a una cuenta con el link firmado.
// El teléfono entero va SOLO en contactosReservas (lo lee el club) y en el chat (solo Functions).
const { enmascararTelefono } = require("./seguridad");

// disp: functions/lib/disponibilidad.mjs · datos: lo que arma el motor (motor.confirmar)
function documentosReservaBot(disp, datos) {
  const grupo = disp.slotsDeReserva({ canchaId: datos.canchaId, fecha: datos.fecha, hora: datos.hora, turnos: datos.turnos, precios: datos.precios });
  const seña = Math.max(0, Math.round(Number(datos.seña) || 0));
  const slots = grupo.slots.map((s) => ({
    id: s.id,
    doc: {
      canchaId: datos.canchaId,
      canchaName: datos.canchaName || "Cancha",
      fecha: datos.fecha,
      hora: s.hora,
      precio: s.precio,
      grupoId: grupo.grupoId,
      horaInicio: grupo.horaInicio,
      horaFin: grupo.horaFin,
      turnos: grupo.turnos,
      precioTotal: grupo.precioTotal,
      seña,
      señaPagada: false,
      status: datos.status,
      jugadorUid: datos.jugadorUid || null,
      nombreJugador: String(datos.nombreJugador || "").slice(0, 60),
      origen: "whatsapp",
      waHash: datos.waHash,
      telefonoMascara: enmascararTelefono(datos.telefono),
      waRetencionHasta: datos.retencionHastaMs || null,
    },
    contacto: { jugadorUid: datos.jugadorUid || null, nombreJugador: String(datos.nombreJugador || "").slice(0, 60), canchaId: datos.canchaId, fecha: datos.fecha, hora: s.hora, email: "", telefono: datos.telefono || "", origen: "whatsapp" },
  }));
  return { grupoId: grupo.grupoId, slots };
}

class SlotOcupadoError extends Error {
  constructor(hora) {
    super(hora ? `El turno de las ${hora} ya está reservado` : "SLOT_TAKEN");
    this.code = "SLOT_TAKEN";
    this.hora = hora || null;
  }
}

module.exports = { documentosReservaBot, SlotOcupadoError };
