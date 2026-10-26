import { useSearchParams } from "react-router-dom";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { Card } from "../components/ui";

// /pago-recibido?estado=ok|pendiente|error (también ?mp=…): a dónde vuelve quien pagó un QR del mostrador con
// Mercado Pago. Página neutra, sin datos de la cuenta: el club ve el resultado en su pantalla (M4, P3-8b).

const COPY = {
  ok: { Icono: CheckCircle2, clase: "text-success", titulo: "Pago recibido", texto: "Ya podés cerrar esta página. El club ve el pago en su pantalla en unos segundos." },
  pendiente: { Icono: Clock, clase: "text-warning", titulo: "Pago pendiente", texto: "Mercado Pago todavía está procesando el pago. Cuando se acredite, el club lo ve en su pantalla; no hace falta que hagas nada más." },
  error: { Icono: XCircle, clase: "text-danger", titulo: "El pago no se completó", texto: "No se cobró nada. Podés volver a escanear el QR del mostrador o pagar ahí mismo con otro medio." },
};

export default function PagoRecibido() {
  const [params] = useSearchParams();
  const estado = params.get("estado") || params.get("mp") || "ok";
  const c = COPY[estado] || COPY.error;
  return (
    <div className="max-w-md mx-auto">
      <Card className="text-center">
        <c.Icono className={`pd-icon-lg mx-auto mb-3 ${c.clase}`} size={32} aria-hidden="true" />
        <h1 className="heading-lg m-0">{c.titulo}</h1>
        <p className="body-sm text-ink-2 mt-2 mb-0">{c.texto}</p>
      </Card>
    </div>
  );
}
