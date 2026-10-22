import { useState } from "react";
import { MessageCircle, Printer } from "lucide-react";
import Dialogo from "../Dialogo";
import TicketPreview from "../TicketPreview";
import { Button } from "../ui";
import { imprimirHtml } from "../../print/imprimir";
import { htmlTicketVenta } from "../../print/ticketVenta";
import { formatPrecio } from "../../utils/format";
import { telefonoWhatsApp, textoTicketWhatsApp } from "../../utils/ventas";

// Después de cobrar: número, vuelto grande, "Imprimir" (directo o con vista previa), "Enviar por WhatsApp" (si se
// cargó un teléfono) y "Sin ticket". La venta ya está guardada: cerrar no deshace nada.
export default function PostVentaDialog({ venta, club, clubId, ancho = 80, imprimirDirecto = false, accionesExtra = null, onCerrar }) {
  const [preview, setPreview] = useState(false);
  const [imprimiendo, setImprimiendo] = useState(false);
  const html = htmlTicketVenta({ club, venta, clubId });
  const telefono = telefonoWhatsApp(venta.cliente?.telefono);

  const imprimir = async () => {
    if (!imprimirDirecto) {
      setPreview(true);
      return;
    }
    setImprimiendo(true);
    try {
      await imprimirHtml(html, { ancho, titulo: `Ticket ${venta.numero}` });
    } finally {
      setImprimiendo(false);
    }
  };
  const whatsapp = () => {
    const url = `https://wa.me/${telefono}?text=${encodeURIComponent(textoTicketWhatsApp(venta, club))}`;
    window.open(url, "_blank", "noopener");
  };

  return (
    <>
      <Dialogo
        titulo={`Venta ${venta.numero}`}
        descripcion={venta.cliente?.nombre ? `Cliente: ${venta.cliente.nombre}` : undefined}
        onCerrar={onCerrar}
        onSubmit={onCerrar}
        acciones={
          <>
            {accionesExtra}
            {telefono && (
              <Button icon={<MessageCircle className="pd-icon" size={20} aria-hidden="true" />} onClick={whatsapp}>
                Enviar por WhatsApp
              </Button>
            )}
            <Button icon={<Printer className="pd-icon" size={20} aria-hidden="true" />} onClick={imprimir} cargando={imprimiendo ? "Imprimiendo…" : ""}>
              Imprimir
            </Button>
            <Button type="submit" variant="primary" data-autofocus>
              Sin ticket
            </Button>
          </>
        }
      >
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="pd-stat">
            <span className="pd-stat-value">{formatPrecio(venta.total)}</span>
            <span className="pd-stat-label">Total cobrado</span>
          </div>
          <div className="pd-stat">
            <span className="pd-stat-value">{formatPrecio(venta.vuelto)}</span>
            <span className="pd-stat-label">Vuelto</span>
          </div>
        </div>
      </Dialogo>
      {preview && <TicketPreview titulo={`Ticket ${venta.numero}`} html={html} ancho={ancho} textoCerrar="Listo" onCerrar={() => setPreview(false)} onImprimido={() => setPreview(false)} />}
    </>
  );
}
