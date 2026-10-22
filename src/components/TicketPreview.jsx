import { useMemo, useState } from "react";
import { Printer } from "lucide-react";
import Dialogo from "./Dialogo";
import { Button } from "./ui";
import { documentoTicket, imprimirHtml } from "../print/imprimir";

// Vista previa de un ticket (HTML plano de src/print/*) con "Imprimir" y cerrar. La usan el cierre de caja y el
// historial; P3-3/P3-4 la reutilizan para ventas y cuentas.
export default function TicketPreview({ titulo = "Ticket", html, ancho = 80, descripcion, textoCerrar = "Cerrar", onCerrar }) {
  const [imprimiendo, setImprimiendo] = useState(false);
  const documento = useMemo(() => documentoTicket(html, { ancho, titulo }), [html, ancho, titulo]);

  const imprimir = async () => {
    setImprimiendo(true);
    try {
      await imprimirHtml(html, { ancho, titulo });
    } finally {
      setImprimiendo(false);
    }
  };

  return (
    <Dialogo
      titulo={titulo}
      descripcion={descripcion}
      onCerrar={onCerrar}
      onSubmit={imprimir}
      acciones={
        <>
          <Button onClick={onCerrar}>{textoCerrar}</Button>
          <Button type="submit" variant="primary" icon={<Printer className="pd-icon" size={20} aria-hidden="true" />} cargando={imprimiendo ? "Imprimiendo…" : ""}>
            Imprimir
          </Button>
        </>
      }
    >
      <div className="mt-4 flex flex-col gap-2">
        <div className="bg-surface-sunken rounded-lg p-4 flex justify-center overflow-x-auto">
          <iframe title="Vista previa del ticket" srcDoc={documento} className="border-0 rounded-sm shadow-card" style={{ width: `${ancho}mm`, height: "60vh", minHeight: 320 }} />
        </div>
        <p className="pd-help m-0">Papel de {ancho} mm. El ancho se cambia abajo de la pantalla de Caja.</p>
      </div>
    </Dialogo>
  );
}
