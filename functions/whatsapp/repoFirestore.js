// functions/whatsapp/repoFirestore.js — el `repo` del motor sobre Firestore (Admin SDK). Lo arma functions/index.js con
// las piezas que viven allá (crear el pago de la seña con el MISMO helper que mpCrearPago, avisos al club, el link
// firmado). Colecciones (todas cerradas a los clientes en firestore.rules):
//   clubs/{c}/whatsappChats/{hash}  estado de la conversación (paso, datos, nombre, waId, pausadoHasta, límite, expiraEn)
//   clubs/{c}/reservas/{slotId}     las reservas del bot (origen "whatsapp", waHash, telefonoMascara)
//   clubs/{c}/contactosReservas/{slotId}  el teléfono entero (lo lee el club, como en la web)
const { documentosReservaBot, SlotOcupadoError } = require("./reserva");

let dispPromesa = null;
const disp = () => (dispPromesa ||= import("../lib/disponibilidad.mjs"));

function crearRepoFirestore({ db, FieldValue, Timestamp, crearPagoSeña, avisarClub, linkVincular }) {
  const clubRef = (c) => db.collection("clubs").doc(c);
  const chatRef = (c, h) => clubRef(c).collection("whatsappChats").doc(h);
  const lista = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return {
    club: async (c) => {
      const s = await clubRef(c).get();
      return s.exists ? { id: s.id, ...s.data() } : null;
    },
    canchas: async (c) => lista(await clubRef(c).collection("canchas").get()),
    reservasDelDia: async (c, fecha) => lista(await clubRef(c).collection("reservas").where("fecha", "==", fecha).get()),
    turnosFijos: async (c) => lista(await clubRef(c).collection("turnosFijos").get()),
    getChat: async (c, h) => {
      const s = await chatRef(c, h).get();
      return s.exists ? s.data() : null;
    },
    setChat: async (c, h, chat) => {
      const limpio = JSON.parse(JSON.stringify(chat)); // sin undefined
      await chatRef(c, h).set({ ...limpio, expiraEnTs: chat.expiraEn ? Timestamp.fromMillis(chat.expiraEn) : null, guardadoEn: FieldValue.serverTimestamp() });
    },
    reservasDelTelefono: async (c, h) => lista(await clubRef(c).collection("reservas").where("waHash", "==", h).get()),
    // Una transacción: lee los N turnos; si alguno tiene una reserva viva no escribe nada (SLOT_TAKEN)
    crearReserva: async (c, d) => {
      const { grupoId, slots } = documentosReservaBot(await disp(), d);
      const col = clubRef(c).collection("reservas");
      await db.runTransaction(async (tx) => {
        const snaps = [];
        for (const s of slots) snaps.push(await tx.get(col.doc(s.id)));
        const i = snaps.findIndex((s) => s.exists && s.data().status !== "cancelada");
        if (i >= 0) throw new SlotOcupadoError(slots[i].doc.hora);
        slots.forEach((s) => {
          tx.set(col.doc(s.id), { ...s.doc, createdAt: FieldValue.serverTimestamp() });
          tx.set(clubRef(c).collection("contactosReservas").doc(s.id), { ...s.contacto, createdAt: FieldValue.serverTimestamp() });
        });
      });
      return grupoId;
    },
    // canceladaPor "jugador": onReservaUpdated aplica la política de seña del club (P3-14 B) como en la web
    cancelarReserva: async (c, grupoId, { motivo = null } = {}) => {
      const snap = await clubRef(c).collection("reservas").where("grupoId", "==", grupoId).get();
      const vivos = snap.docs.filter((x) => x.data().status !== "cancelada" && x.data().origen === "whatsapp");
      if (!vivos.length) return 0;
      const batch = db.batch();
      vivos.forEach((x) => batch.update(x.ref, { status: "cancelada", canceladaPor: "jugador", motivo: motivo || "cancelada por WhatsApp", canceladaEn: FieldValue.serverTimestamp() }));
      await batch.commit();
      return vivos.length;
    },
    crearPagoSeña,
    avisarClub,
    linkVincular,
  };
}

module.exports = { crearRepoFirestore };
