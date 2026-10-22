import { useCallback, useEffect, useState } from "react";
import { SinNumerosError, estadoNumeracion, prepararNumeracion, tomarNumero } from "../../services/ventasService";
import { bloqueNecesitaReserva } from "../../utils/ventas";

// Numeración de tickets de este dispositivo, lista de antemano: código asignado y bloque con números (pide otro
// bloque cuando quedan pocos). `tomar()` entrega el siguiente número; sin números y sin internet lanza SinNumerosError.
export default function useNumeracion({ clubId, dispositivo, uid, activo = true, online = true }) {
  const [numeracion, setNumeracion] = useState(() => (clubId ? estadoNumeracion(clubId) : { proximo: null, agotado: true, bloque: null, codigo: null }));

  useEffect(() => {
    if (!clubId || !activo || !online) return undefined;
    let vivo = true;
    prepararNumeracion(clubId, { dispositivo, uid, online: true }).then(() => vivo && setNumeracion(estadoNumeracion(clubId)));
    return () => {
      vivo = false;
    };
  }, [clubId, activo, online, dispositivo, uid]);

  const refrescar = useCallback(() => setNumeracion(estadoNumeracion(clubId)), [clubId]);

  const tomar = useCallback(async () => {
    let estado = estadoNumeracion(clubId);
    if (estado.agotado) {
      if (!online) throw new SinNumerosError();
      await prepararNumeracion(clubId, { dispositivo, uid, online: true });
      estado = estadoNumeracion(clubId);
      if (estado.agotado) throw new SinNumerosError();
    }
    const numero = tomarNumero(clubId);
    setNumeracion(estadoNumeracion(clubId));
    if (online && bloqueNecesitaReserva(estadoNumeracion(clubId).bloque)) {
      prepararNumeracion(clubId, { dispositivo, uid, online: true }).then(() => setNumeracion(estadoNumeracion(clubId)));
    }
    return numero;
  }, [clubId, dispositivo, uid, online]);

  return { numeracion, tomar, refrescar, sinNumeros: numeracion.agotado && !online };
}
