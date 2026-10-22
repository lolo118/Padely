import { useEffect, useState } from "react";
import { create } from "zustand";
import { waitForPendingWrites } from "firebase/firestore";

// Estado de conexión y escrituras pendientes de sincronizar (Firestore con persistencia local: una venta hecha
// sin internet queda en cola y se sube sola cuando vuelve la conexión).

// ¿Hay internet? (navigator.onLine + eventos online/offline)
export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  useEffect(() => {
    const si = () => setOnline(true);
    const no = () => setOnline(false);
    window.addEventListener("online", si);
    window.addEventListener("offline", no);
    return () => {
      window.removeEventListener("online", si);
      window.removeEventListener("offline", no);
    };
  }, []);
  return online;
}

// Escrituras hechas por esta pestaña que el servidor todavía no confirmó (ids: números de ticket, etc.)
export const useSyncStore = create((set) => ({
  pendientes: [],
  agregar: (id) => set((s) => (s.pendientes.includes(id) ? s : { pendientes: [...s.pendientes, id] })),
  quitar: (id) => set((s) => ({ pendientes: s.pendientes.filter((x) => x !== id) })),
}));

// Registra una escritura: se marca pendiente hasta que la promesa (el ack del servidor) termine
export function registrarEscrituraPendiente(id, promesa) {
  const { agregar, quitar } = useSyncStore.getState();
  agregar(id);
  Promise.resolve(promesa)
    .catch((err) => console.error(`La escritura ${id} falló:`, err))
    .finally(() => quitar(id));
  return promesa;
}

export const usePendientes = () => useSyncStore((s) => s.pendientes);

// true si Firestore tiene escrituras locales sin confirmar (de cualquier pestaña del navegador). Espera hasta
// `timeoutMs`: si en ese tiempo no se vaciaron, se las considera pendientes.
export async function pendientesDeSync(db, { timeoutMs = 1500 } = {}) {
  let timer;
  const espera = new Promise((resolve) => {
    timer = setTimeout(() => resolve(true), timeoutMs);
  });
  try {
    return await Promise.race([waitForPendingWrites(db).then(() => false), espera]);
  } catch (err) {
    console.error("No se pudo consultar las escrituras pendientes:", err);
    return false;
  } finally {
    clearTimeout(timer);
  }
}
