// functions/whatsapp/repoMemoria.js — el mismo `repo` que usa el motor en producción (repoFirestore.js), en memoria.
// Lo usan los tests (functions/whatsappMotor.test.js) y el simulador (node functions/whatsapp/simular.js).
const { documentosReservaBot, SlotOcupadoError } = require("./reserva");

let dispPromesa = null;
const disp = () => (dispPromesa ||= import("../lib/disponibilidad.mjs"));

// datos: { clubs: { [id]: club }, canchas: { [clubId]: [cancha] }, reservas: { [clubId]: [slot] }, turnosFijos: { [clubId]: [] } }
function crearRepoMemoria(datos = {}, { mpFalla = false, linkBase = "https://padely.netlify.app" } = {}) {
  const st = {
    clubs: { ...(datos.clubs || {}) },
    canchas: { ...(datos.canchas || {}) },
    reservas: {},
    turnosFijos: { ...(datos.turnosFijos || {}) },
    contactos: {},
    chats: {},
    avisos: [],
    pagos: [],
  };
  Object.entries(datos.reservas || {}).forEach(([c, lista]) => {
    st.reservas[c] = new Map(lista.map((r) => [r.id, { ...r }]));
  });
  const reservasDe = (c) => (st.reservas[c] ||= new Map());
  const conId = (m) => [...m.entries()].map(([id, r]) => ({ ...r, id }));
  return {
    st,
    club: async (c) => (st.clubs[c] ? { id: c, ...st.clubs[c] } : null),
    canchas: async (c) => (st.canchas[c] || []).map((x) => ({ ...x })),
    reservasDelDia: async (c, fecha) => conId(reservasDe(c)).filter((r) => r.fecha === fecha),
    turnosFijos: async (c) => (st.turnosFijos[c] || []).map((x) => ({ ...x })),
    getChat: async (c, h) => (st.chats[`${c}/${h}`] ? JSON.parse(JSON.stringify(st.chats[`${c}/${h}`])) : null),
    setChat: async (c, h, chat) => {
      st.chats[`${c}/${h}`] = JSON.parse(JSON.stringify(chat));
    },
    reservasDelTelefono: async (c, h) => conId(reservasDe(c)).filter((r) => r.waHash === h),
    crearReserva: async (c, d) => {
      const { grupoId, slots } = documentosReservaBot(await disp(), d);
      const m = reservasDe(c);
      const ocupado = slots.find((s) => m.has(s.id) && m.get(s.id).status !== "cancelada");
      if (ocupado) throw new SlotOcupadoError(ocupado.doc.hora);
      slots.forEach((s) => {
        m.set(s.id, { ...s.doc, createdAt: Date.now() });
        st.contactos[`${c}/${s.id}`] = s.contacto;
      });
      return grupoId;
    },
    cancelarReserva: async (c, grupoId, { motivo = null } = {}) => {
      const m = reservasDe(c);
      [...m.entries()].filter(([id, r]) => (r.grupoId || id) === grupoId && r.status !== "cancelada").forEach(([id, r]) => m.set(id, { ...r, status: "cancelada", canceladaPor: "jugador", motivo }));
    },
    crearPagoSeña: async (c, grupoId, pagador) => {
      if (mpFalla) throw new Error("MP no disponible (simulado)");
      const id = `pago${st.pagos.length + 1}`;
      st.pagos.push({ id, clubId: c, reservaId: grupoId, pagador });
      return { link: `https://mp.example/checkout/${id}`, pagoMpId: id };
    },
    avisarClub: async (c, aviso) => {
      st.avisos.push({ clubId: c, ...aviso });
    },
    linkVincular: (c, h, venceMs) => `${linkBase}/whatsapp/vincular?c=${encodeURIComponent(c)}&h=${h}&v=${venceMs}&s=firma-de-prueba`,
    // Simula el webhook de MP: la seña quedó pagada (como aplicarPagoAprobado: pendiente → confirmada si reservaDirecta)
    pagarSeña: async (c, grupoId) => {
      const m = reservasDe(c);
      const club = st.clubs[c] || {};
      let cabeza = null;
      [...m.entries()].filter(([id, r]) => (r.grupoId || id) === grupoId && r.status !== "cancelada").forEach(([id, r]) => {
        const nuevo = { ...r, señaPagada: true, señaMedio: "mercadopago", ...(r.status === "pendiente" && club.reservaDirecta !== false ? { status: "confirmada" } : {}) };
        m.set(id, nuevo);
        if (id === grupoId) cabeza = { ...nuevo, id };
      });
      return cabeza;
    },
  };
}

module.exports = { crearRepoMemoria };
