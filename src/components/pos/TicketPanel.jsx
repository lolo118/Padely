import { Minus, Plus, Tag, Trash2, X } from "lucide-react";
import { Badge, Button, Field, Input } from "../ui";
import { formatPrecio } from "../../utils/format";

// Columna derecha del POS: las líneas del ticket, descuentos, total y "Cobrar".
// lineas: salida de calcularTotales (con bruto, descuento, subtotal por línea)

const fmtCant = (n) => (Number(n) || 0).toLocaleString("es-AR", { maximumFractionDigits: 3 });
const icono = (Icono, extra = {}) => <Icono className="pd-icon" size={20} aria-hidden="true" {...extra} />;

export default function TicketPanel({
  totales,
  maxPct = 100,
  cliente,
  onCliente,
  onCantidad,
  onQuitar,
  onDescuentoLinea,
  onDescuentoGeneral,
  onCobrar,
  onVaciar,
  bloqueo = "",
  className = "",
  // Modo "cargar a la cuenta": { texto } del turno elegido; el botón primario agrega a la cuenta en vez de cobrar
  cuenta = null,
  onSalirCuenta,
  onAgregarACuenta,
}) {
  const { lineas, subtotal, descuento, descuentoTotal, total, excedido } = totales;
  const vacio = lineas.length === 0;
  return (
    <aside className={["pd-card p-0! flex flex-col min-h-0", className].filter(Boolean).join(" ")} aria-label="Ticket">
      <div className={["flex items-center justify-between gap-2 px-4 py-3 border-b border-line", cuenta && "bg-court-soft"].filter(Boolean).join(" ")}>
        <h2 className="heading-sm m-0 min-w-0">
          {cuenta ? (
            <>
              <span className="pd-eyebrow block">Cargando a la cuenta</span>
              <span className="block truncate">{cuenta.texto}</span>
            </>
          ) : (
            <>
              Ticket
              {!vacio && <span className="pd-count">{lineas.length}</span>}
            </>
          )}
        </h2>
        <div className="flex items-center gap-1 flex-none">
          {!vacio && (
            <Button variant="ghost" size="sm" icon={icono(Trash2)} onClick={onVaciar}>
              Vaciar
            </Button>
          )}
          {cuenta && <Button variant="ghost" size="sm" iconOnly aria-label="Salir de la cuenta" icon={icono(X)} onClick={onSalirCuenta} />}
        </div>
      </div>

      <ul className="m-0 p-0 list-none flex-1 min-h-[120px] overflow-y-auto divide-y divide-line" aria-label="Líneas del ticket">
        {vacio && <li className="px-4 py-8 text-center body-sm text-ink-2">Tocá un producto para empezar.</li>}
        {lineas.map((l) => (
          <li key={l.key} className="px-4 py-3 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <button type="button" className="text-left min-w-0 flex-1 body-sm font-semibold text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus" onClick={() => onDescuentoLinea(l)} aria-label={`Descuento para ${l.nombre}`}>
                <span className="block break-words">{l.nombre}</span>
                <span className="block body-sm text-ink-3 font-medium pd-tnum">
                  {formatPrecio(l.precio)} c/u{l.descuento > 0 ? ` · desc. −${formatPrecio(l.descuento)}` : ""}
                </span>
              </button>
              <span className="font-semibold pd-tnum whitespace-nowrap">{formatPrecio(l.subtotal)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <Button size="sm" iconOnly aria-label={`Una menos de ${l.nombre}`} icon={icono(Minus)} onClick={() => onCantidad(l, -1)} />
                <span className="min-w-[44px] text-center font-semibold pd-tnum" aria-live="polite">
                  {fmtCant(l.cantidad)}
                </span>
                <Button size="sm" iconOnly aria-label={`Una más de ${l.nombre}`} icon={icono(Plus)} onClick={() => onCantidad(l, 1)} />
              </div>
              <Button variant="ghost" size="sm" iconOnly aria-label={`Quitar ${l.nombre}`} icon={icono(X)} onClick={() => onQuitar(l)} />
            </div>
          </li>
        ))}
      </ul>

      <div className="border-t border-line px-4 py-3 flex flex-col gap-2">
        {!cuenta && (
        <div className="grid grid-cols-[minmax(0,1fr)_120px] gap-2 mb-1">
          <Field label="Cliente (opcional)">
            <Input value={cliente.nombre} onChange={(e) => onCliente({ ...cliente, nombre: e.target.value })} placeholder="Nombre para el ticket" maxLength={60} autoComplete="off" />
          </Field>
          <Field label="WhatsApp">
            <Input type="tel" inputMode="tel" value={cliente.telefono} onChange={(e) => onCliente({ ...cliente, telefono: e.target.value })} placeholder="385…" maxLength={20} autoComplete="off" />
          </Field>
        </div>
        )}
        <div className="flex items-center justify-between body-sm text-ink-2">
          <span>Subtotal</span>
          <span className="pd-tnum">{formatPrecio(subtotal)}</span>
        </div>
        <div className="flex items-center justify-between gap-2 body-sm">
          <Button variant="ghost" size="sm" icon={icono(Tag)} onClick={onDescuentoGeneral} disabled={vacio || !!cuenta} title={cuenta ? "El descuento general se hace al cerrar la cuenta" : undefined}>
            {descuento ? `Descuento ${descuento.tipo === "porcentaje" ? `${descuento.valor} %` : ""}` : "Descuento"}
          </Button>
          <span className="pd-tnum text-ink-2">{cuenta ? "al cerrar" : descuento ? `−${formatPrecio(descuento.monto)}` : "—"}</span>
        </div>
        {excedido && (
          <p className="pd-error m-0">
            Los descuentos ({formatPrecio(descuentoTotal)}) superan tu tope de {maxPct} %.
          </p>
        )}
        <div className="flex items-end justify-between gap-2 pt-1">
          <span className="heading-sm">Total</span>
          <span className="numeral-lg pd-tnum" aria-live="polite">
            {formatPrecio(total)}
          </span>
        </div>
        {bloqueo && (
          <Badge tone="warning" className="self-start">
            {bloqueo}
          </Badge>
        )}
        {cuenta ? (
          <Button variant="primary" className="w-full h-14! text-[18px]!" onClick={onAgregarACuenta} disabled={vacio || excedido || !!bloqueo}>
            Agregar a la cuenta {vacio ? "" : formatPrecio(total)}
          </Button>
        ) : (
          <Button variant="primary" className="w-full h-14! text-[18px]!" onClick={onCobrar} disabled={vacio || excedido || !!bloqueo}>
            Cobrar {vacio ? "" : formatPrecio(total)}
          </Button>
        )}
      </div>
    </aside>
  );
}
