import { ReceiptText, ShoppingBag } from "lucide-react";
import { Badge, Button } from "./ui";
import { formatPrecio } from "../utils/format";
import { etiquetaEstado, puedePedir, resumenItems, tonoEstado } from "../utils/pedidos";

// Debajo de una reserva del jugador: "Pedir a la barra" mientras el turno está en juego, el último pedido y su
// estado, y la cuenta del turno (abierta: total; cerrada: "Cuenta cerrada · $ X"). Todo lleva a /pedir o /mi-cuenta.
//   reserva: agrupada (con clubId, grupoId, cuentaCerrada?, cuentaTotal?) · cuenta: la abierta de esa reserva, o null
//   pedidos: los del jugador en esa reserva (el más nuevo primero), o []
export default function CuentaTurnoResumen({ reserva, cuenta = null, pedidos = [], compacto = false, ahora = new Date() }) {
  const grupoId = reserva?.grupoId || reserva?.id;
  const clubId = reserva?.clubId;
  if (!clubId || !grupoId) return null;
  const abierta = cuenta && cuenta.estado === "abierta";
  const cerrada = !abierta && reserva?.cuentaCerrada === true;
  const enVentana = puedePedir(reserva, ahora);
  const ultimo = pedidos[0] || null;
  if (!abierta && !cerrada && !enVentana && !ultimo) return null;
  const t = abierta ? cuenta.totales || {} : null;
  const aPedir = `/pedir/${clubId}/${grupoId}`;
  const aCuenta = `/mi-cuenta/${clubId}/${grupoId}`;
  return (
    <div className={["flex flex-col gap-2", compacto ? "mt-2" : "mt-3 pt-3 border-t border-line"].join(" ")}>
      {(enVentana || ultimo) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {ultimo ? (
            <p className="body-sm m-0 flex items-center gap-2 min-w-0">
              <Badge tone={tonoEstado(ultimo.estado)} dot={ultimo.estado === "pendiente" || ultimo.estado === "aceptado"}>
                Pedido {etiquetaEstado(ultimo.estado).toLowerCase()}
              </Badge>
              <span className="text-ink-2 truncate">{resumenItems(ultimo.items)}</span>
            </p>
          ) : (
            <p className="body-sm text-ink-2 m-0">¿Algo de la barra? Te lo llevan a la cancha.</p>
          )}
          {enVentana && (
            <Button as="link" to={aPedir} size="sm" variant="primary" icon={<ShoppingBag className="pd-icon" size={20} aria-hidden="true" />}>
              Pedir a la barra
            </Button>
          )}
        </div>
      )}
      {(abierta || cerrada) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
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
          <Button as="link" to={aCuenta} size="sm" icon={<ReceiptText className="pd-icon" size={20} aria-hidden="true" />}>
            {abierta ? "Ver mi cuenta" : "Ver ticket"}
          </Button>
        </div>
      )}
    </div>
  );
}
