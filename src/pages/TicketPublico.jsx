import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CircleDot, Share2 } from "lucide-react";
import { getTicketPublico } from "../services/reportesService";
import { toast } from "../components/Toast";
import { Badge, Button, Card } from "../components/ui";
import { formatPrecio } from "../utils/format";
import { formatDiaCorto } from "../utils/formatDate";

// /t/v/:clubId/:numero — el ticket digital que apunta el QR del ticket térmico. Público, solo lectura, desde la
// proyección clubs/{c}/ticketsPublicos/{numero} (sin quién vendió, caja ni referencias de pago). Noche.

const ETIQUETA_MEDIO = { efectivo: "Efectivo", transferencia: "Transferencia", tarjeta: "Tarjeta", qr: "QR" };
const fmtCant = (n) => (Number(n) || 0).toLocaleString("es-AR", { maximumFractionDigits: 3 });

export default function TicketPublico() {
  const { clubId, numero } = useParams();
  const [estado, setEstado] = useState({ ticket: null, cargado: false, error: false });

  useEffect(() => {
    if (!clubId || !numero) return undefined;
    let vivo = true;
    getTicketPublico(clubId, numero)
      .then((ticket) => vivo && setEstado({ ticket, cargado: true, error: false }))
      .catch((err) => {
        console.error("Error leyendo el ticket:", err);
        if (vivo) setEstado({ ticket: null, cargado: true, error: true });
      });
    return () => {
      vivo = false;
    };
  }, [clubId, numero]);

  const compartir = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: `Ticket ${numero}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado");
    } catch (err) {
      if (err?.name !== "AbortError") {
        console.error("No se pudo compartir:", err);
        toast.error("No se pudo compartir el link.");
      }
    }
  };

  if (!estado.cargado) {
    return (
      <div className="max-w-[360px] mx-auto flex flex-col gap-4" aria-busy="true" aria-label="Cargando">
        <div className="pd-skeleton h-8 w-40 mx-auto" />
        <div className="pd-skeleton h-96 rounded-lg" />
      </div>
    );
  }
  const t = estado.ticket;
  if (estado.error || !t) {
    return (
      <div className="max-w-[360px] mx-auto">
        <Card className="text-center">
          <CircleDot className="pd-icon-lg mx-auto mb-3 text-ink-3" size={24} aria-hidden="true" />
          <p className="heading-sm">Este ticket no existe</p>
          <p className="body-sm text-ink-2 mt-1">El link puede estar mal escrito, o la venta todavía no se sincronizó.</p>
        </Card>
      </div>
    );
  }
  const anulada = t.estado === "anulada";
  const tk = t.club?.ticket || {};
  const consumos = (t.items || []).filter((it) => it.tipoLinea === "consumo");
  const cancha = (t.items || []).filter((it) => it.tipoLinea !== "consumo");

  return (
    <div className="max-w-[360px] mx-auto flex flex-col gap-4">
      <Card className="font-mono text-[13px] leading-5" aria-label={`Ticket ${t.numero}`}>
        <header className="text-center">
          <p className="heading-md m-0 uppercase tracking-wide">{tk.encabezado || t.club?.nombre || "Padely"}</p>
          {(t.club?.direccion || t.club?.ciudad) && <p className="body-sm text-ink-2 m-0">{[t.club.direccion, t.club.ciudad].filter(Boolean).join(" · ")}</p>}
        </header>
        <hr className="border-0 border-t border-dashed border-line-strong my-3" />
        <div className="text-center">
          <p className="heading-sm m-0 pd-tnum">Ticket Nº {t.numero}</p>
          {anulada && (
            <Badge tone="danger" className="mt-1">
              Anulada{t.anulacion?.motivo ? ` · ${t.anulacion.motivo}` : ""}
            </Badge>
          )}
        </div>
        <dl className="m-0 mt-3 grid gap-0.5">
          <div className="flex justify-between gap-3">
            <dt className="text-ink-2">Fecha</dt>
            <dd className="m-0 pd-tnum">
              {formatDiaCorto(t.fecha)} {t.hora}
            </dd>
          </div>
          {t.cuentaNombre && (
            <div className="flex justify-between gap-3">
              <dt className="text-ink-2">A nombre de</dt>
              <dd className="m-0">{t.cuentaNombre}</dd>
            </div>
          )}
        </dl>
        <hr className="border-0 border-t border-dashed border-line-strong my-3" />
        <ul className="m-0 p-0 list-none grid gap-1">
          {consumos.map((it, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span>
                <span className="pd-tnum">{fmtCant(it.cantidad)} ×</span> {it.nombre}
                {it.descuento > 0 && <span className="block text-ink-3 pl-4">desc. −{formatPrecio(it.descuento)}</span>}
              </span>
              <span className="pd-tnum">{formatPrecio(it.subtotal + (Number(it.descuento) || 0))}</span>
            </li>
          ))}
          {cancha.map((it, i) => (
            <li key={`c${i}`} className="flex justify-between gap-3">
              <span>{it.nombre}</span>
              <span className="pd-tnum">{formatPrecio(it.subtotal)}</span>
            </li>
          ))}
        </ul>
        <hr className="border-0 border-t border-dashed border-line-strong my-3" />
        {t.descuentoTotal > 0 && (
          <>
            <p className="flex justify-between m-0">
              <span>Subtotal</span>
              <span className="pd-tnum">{formatPrecio(t.subtotal)}</span>
            </p>
            <p className="flex justify-between m-0 text-ink-2">
              <span>Descuentos</span>
              <span className="pd-tnum">−{formatPrecio(t.descuentoTotal)}</span>
            </p>
          </>
        )}
        <p className="flex justify-between m-0 heading-sm">
          <span>TOTAL</span>
          <span className="pd-tnum">{formatPrecio(t.total)}</span>
        </p>
        <hr className="border-0 border-t border-dashed border-line-strong my-3" />
        <ul className="m-0 p-0 list-none grid gap-0.5">
          {(t.pagos || []).map((p, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span>{ETIQUETA_MEDIO[p.medio] || p.medio}</span>
              <span className="pd-tnum">{formatPrecio(p.medio === "efectivo" && p.entregado ? p.entregado : p.monto)}</span>
            </li>
          ))}
          {t.vuelto > 0 && (
            <li className="flex justify-between gap-3 text-ink-2">
              <span className="pl-4">Vuelto</span>
              <span className="pd-tnum">{formatPrecio(t.vuelto)}</span>
            </li>
          )}
        </ul>
        {tk.alias && (
          <>
            <hr className="border-0 border-t border-dashed border-line-strong my-3" />
            <p className="text-center m-0">Transferencias: {tk.alias}</p>
          </>
        )}
        <hr className="border-0 border-t border-dashed border-line-strong my-3" />
        <p className="text-center m-0 font-semibold">{tk.pie || "Gracias por venir"}</p>
        <p className="text-center m-0 text-ink-3 body-sm">Comprobante no válido como factura</p>
      </Card>
      <Button onClick={compartir} icon={<Share2 className="pd-icon" size={20} aria-hidden="true" />} className="self-center">
        Guardar / Compartir
      </Button>
    </div>
  );
}
