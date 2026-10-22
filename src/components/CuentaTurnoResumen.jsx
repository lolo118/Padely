import { ReceiptText } from "lucide-react";
import { Button } from "./ui";
import { formatPrecio } from "../utils/format";

// Una línea + botón en la tarjeta de una reserva del jugador: la cuenta del turno abierta ("Cuenta del turno: $ X")
// o ya cerrada ("Cuenta cerrada · $ X"). Lleva a /mi-cuenta/:clubId/:grupoId (solo lectura).
//   reserva: agrupada (con clubId, grupoId, cuentaCerrada?, cuentaTotal?) · cuenta: la abierta de esa reserva, o null
export default function CuentaTurnoResumen({ reserva, cuenta = null, compacto = false }) {
  const grupoId = reserva?.grupoId || reserva?.id;
  const clubId = reserva?.clubId;
  if (!clubId || !grupoId) return null;
  const abierta = cuenta && cuenta.estado === "abierta";
  const cerrada = !abierta && reserva?.cuentaCerrada === true;
  if (!abierta && !cerrada) return null;
  const t = abierta ? cuenta.totales || {} : null;
  return (
    <div className={["flex flex-wrap items-center justify-between gap-2", compacto ? "mt-2" : "mt-3 pt-3 border-t border-line"].join(" ")}>
      <p className="body-sm m-0 pd-tnum">
        {abierta ? (
          <>
            <span className="text-ink-2">Cuenta del turno: </span>
            <strong>{formatPrecio(t.total)}</strong>
            <span className="text-ink-3"> (consumos {formatPrecio(t.consumos)} · cancha {formatPrecio(Math.max(0, (Number(t.cancha) || 0) - (Number(t.seña) || 0)))})</span>
          </>
        ) : (
          <>
            <span className="text-ink-2">Cuenta cerrada · </span>
            <strong>{formatPrecio(reserva.cuentaTotal)}</strong>
          </>
        )}
      </p>
      <Button as="link" to={`/mi-cuenta/${clubId}/${grupoId}`} size="sm" icon={<ReceiptText className="pd-icon" size={20} aria-hidden="true" />}>
        {abierta ? "Ver mi cuenta" : "Ver ticket"}
      </Button>
    </div>
  );
}
