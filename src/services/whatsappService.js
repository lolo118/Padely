import { collection, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../lib/firebase";

// Bot de reservas por WhatsApp (docs/WHATSAPP.md). El token de Meta va directo a la Function, que lo guarda cifrado:
// ningún cliente lo vuelve a leer. El super-admin ve las conexiones en el índice whatsappNumeros/{phoneNumberId}.

export const getConexionesWhatsapp = async () => {
  const snap = await getDocs(collection(db, "whatsappNumeros"));
  return snap.docs.map((d) => ({ phoneNumberId: d.id, ...d.data() }));
};

export const conectarWhatsapp = async ({ clubId, phoneNumberId, wabaId, token }) =>
  (await httpsCallable(functions, "waConectarClub")({ clubId, phoneNumberId: String(phoneNumberId).trim(), wabaId: String(wabaId).trim(), token: String(token).trim() })).data;

export const desconectarWhatsapp = async (clubId) => (await httpsCallable(functions, "waDesconectarClub")({ clubId })).data;

// Link de la confirmación del bot: suma a la cuenta las reservas de ese teléfono en ese club
export const vincularReservasWhatsapp = async ({ c, h, v, s }) => (await httpsCallable(functions, "waVincularReservas")({ c, h, v: Number(v), s })).data;
