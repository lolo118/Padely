import { useEffect } from "react";

// Título de la pestaña para páginas públicas (P3-12): "<texto> · Padely"; al salir vuelve al título de la app
const TITULO_APP = "Padely — Reservá canchas y jugá torneos de pádel";

export default function useTituloPagina(texto) {
  useEffect(() => {
    if (!texto) return undefined;
    document.title = `${texto} · Padely`;
    return () => {
      document.title = TITULO_APP;
    };
  }, [texto]);
}
