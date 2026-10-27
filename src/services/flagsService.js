import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

// Flags de la plataforma (P3-14): configuracionPadely/flags, lo escriben las Functions (migración) y el super-admin.
//   ticketsPublicId: los QR y links del ticket digital usan venta.publicId (aleatorio) en vez del número
//   privacidadMigrada: plan.historial y los datos de la cuenta de MP viven en clubs/{c}/privado/*
//   inscripcionesOnline: pago de inscripciones a torneos con Mercado Pago (organizadores)
// Sin el documento (o sin permiso para leerlo) todo queda apagado: la app se porta como antes.
let flags = {};
let promesa = null;

export const cargarFlags = () => {
  if (!promesa) {
    promesa = getDoc(doc(db, "configuracionPadely", "flags"))
      .then((snap) => {
        flags = snap.exists() ? snap.data() : {};
        return flags;
      })
      .catch(() => flags);
  }
  return promesa;
};

// Lectura síncrona (para imprimir): lo último que se cargó
export const flag = (nombre) => flags[nombre] === true;
