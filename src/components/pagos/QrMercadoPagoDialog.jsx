import { useEffect, useMemo, useState } from "react";
import { Copy, ExternalLink, RefreshCw } from "lucide-react";
import Dialogo from "../Dialogo";
import { Alert, Badge, Button } from "../ui";
import { toast } from "../Toast";
import { escucharPagoMp, mpCrearPago } from "../../services/mercadoPagoService";
import { svgQr } from "../../utils/qr";
import { formatPrecio } from "../../utils/format";

// QR de Mercado Pago en el mostrador. La Function mpCrearPago arma la preferencia (monto y piezas congeladas en el
// servidor) y devuelve un link corto (mpIr → redirige al checkout) que sí entra en el QR; acá se escucha
// clubs/{c}/pagosMp/{id} hasta que el webhook lo apruebe. El pago aprobado crea la venta y se ve en la cuenta solo.

const mmss = (ms) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

function Cuerpo({ clubId, datos, onAprobado, onReintentar }) {
  const [estado, setEstado] = useState({ cargando: true, error: "", pago: null }); // pago: { pagoMpId, initPoint, linkCorto, monto, venceEn }
  const [doc, setDoc] = useState(null);
  const [ahora, setAhora] = useState(() => Date.now());

  useEffect(() => {
    let vivo = true;
    mpCrearPago({ clubId, ...datos })
      .then((r) => vivo && setEstado({ cargando: false, error: "", pago: r }))
      .catch((e) => vivo && setEstado({ cargando: false, error: e?.message || "No pudimos armar el cobro con Mercado Pago.", pago: null }));
    return () => {
      vivo = false;
    };
  }, [clubId, datos]);

  useEffect(() => {
    if (!estado.pago) return undefined;
    return escucharPagoMp(clubId, estado.pago.pagoMpId, setDoc, (e) => console.error("Error escuchando el pago de Mercado Pago:", e));
  }, [clubId, estado.pago]);

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (doc?.estado === "aprobado") onAprobado(doc);
  }, [doc, onAprobado]);

  const link = estado.pago?.linkCorto || estado.pago?.initPoint || "";
  const qr = useMemo(() => {
    if (!link) return null;
    try {
      return svgQr(link, { ancho: 224, titulo: "QR para pagar con Mercado Pago" });
    } catch (e) {
      console.error("El link no entra en el QR:", e?.message);
      return null;
    }
  }, [link]);
  const venceEn = estado.pago ? estado.pago.venceEn - ahora : 0;
  const vencido = !!estado.pago && (venceEn <= 0 || doc?.estado === "vencido");
  const rechazado = doc?.estado === "rechazado";

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(estado.pago.initPoint);
      toast.success("Link copiado");
    } catch {
      toast.error("No pudimos copiar el link.");
    }
  };

  if (estado.cargando) return <div className="pd-skeleton h-64 rounded-lg mt-4" aria-busy="true" aria-label="Armando el cobro" />;
  if (estado.error) {
    return (
      <div className="mt-4 flex flex-col gap-3">
        <Alert tone="danger">{estado.error}</Alert>
        <Button onClick={onReintentar} icon={<RefreshCw className="pd-icon" size={20} aria-hidden="true" />}>
          Probar de nuevo
        </Button>
      </div>
    );
  }
  return (
    <div className="mt-4 flex flex-col items-center gap-3 text-center">
      <p className="numeral-lg pd-tnum m-0">{formatPrecio(estado.pago.monto)}</p>
      {rechazado ? (
        <Alert tone="danger" className="w-full text-left">
          Mercado Pago rechazó el pago{doc?.motivo ? ` (${doc.motivo})` : ""}. Podés armar otro QR o cobrar con otro medio.
        </Alert>
      ) : vencido ? (
        <Alert tone="warning" className="w-full text-left">
          Este QR venció (dura 15 minutos). Armá uno nuevo si la persona todavía quiere pagar.
        </Alert>
      ) : (
        <>
          {qr ? (
            <div className="rounded-lg bg-white p-3" dangerouslySetInnerHTML={{ __html: qr }} />
          ) : (
            <Alert className="w-full text-left">El link no entra en el QR: compartilo con el botón de abajo.</Alert>
          )}
          <Badge tone="warning" dot className="pd-tnum">
            Esperando el pago… vence en {mmss(venceEn)}
          </Badge>
          <p className="body-sm text-ink-2 m-0">La persona escanea con la app de Mercado Pago. Cuando se apruebe, la venta se registra sola y la cuenta se actualiza acá.</p>
        </>
      )}
      <div className="pd-btn-group justify-center">
        {rechazado || vencido ? (
          <Button variant="primary" onClick={onReintentar} icon={<RefreshCw className="pd-icon" size={20} aria-hidden="true" />}>
            Nuevo QR
          </Button>
        ) : (
          <>
            <Button size="sm" onClick={copiar} icon={<Copy className="pd-icon" size={20} aria-hidden="true" />}>
              Copiar link
            </Button>
            <Button size="sm" onClick={() => window.open(estado.pago.initPoint, "_blank", "noopener")} icon={<ExternalLink className="pd-icon" size={20} aria-hidden="true" />}>
              Abrir link
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

// datos: { tipo: "mostrador", grupoId, participanteIds } | { tipo: "mostrador", grupoId, lineaIds, pagadorId }
export default function QrMercadoPagoDialog({ clubId, datos, descripcion = "", onAprobado, onCerrar }) {
  const [intento, setIntento] = useState(0);
  const clave = JSON.stringify(datos);
  const datosEstables = useMemo(() => JSON.parse(clave), [clave]);
  return (
    <Dialogo
      titulo="Mercado Pago (QR)"
      descripcion={descripcion}
      onCerrar={onCerrar}
      acciones={
        <Button onClick={onCerrar}>
          Cerrar
        </Button>
      }
    >
      <Cuerpo key={intento} clubId={clubId} datos={datosEstables} onAprobado={onAprobado} onReintentar={() => setIntento((i) => i + 1)} />
    </Dialogo>
  );
}
