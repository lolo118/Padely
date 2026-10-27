import { useEffect, useState } from "react";
import { getClubConfig } from "../services/canchaService";
import { tienePro } from "../utils/planes";

// P3-9: ¿el club tiene las funciones PRO (pedidos a la barra, cuentas)? Lee el club una vez por sesión (caché por id)
// y mientras tanto responde true, así un club de antes (sin plan) nunca pierde el botón por un parpadeo.
const cache = new Map();

export default function useClubConPro(clubId) {
  const [leido, setLeido] = useState({ id: null, valor: true });
  useEffect(() => {
    if (!clubId || cache.has(clubId)) return undefined;
    let vivo = true;
    getClubConfig(clubId)
      .then((club) => {
        const valor = !club || tienePro(club);
        cache.set(clubId, valor);
        if (vivo) setLeido({ id: clubId, valor });
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [clubId]);
  if (!clubId) return true;
  if (cache.has(clubId)) return cache.get(clubId);
  return leido.id === clubId ? leido.valor : true;
}
