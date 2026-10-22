import { useEffect, useState } from "react";
import { Printer, RefreshCw } from "lucide-react";
import { useAuthStore } from "../../../store/authStore";
import SinPermiso from "../../../components/SinPermiso";
import { toast } from "../../../components/Toast";
import { confirmar } from "../../../components/ConfirmDialog";
import { Alert, Button, Card } from "../../../components/ui";
import { getCanchas } from "../../../services/canchaService";
import { asegurarQrToken, regenerarQrToken, urlQr } from "../../../services/pedidosService";
import { svgQr } from "../../../utils/qr";
import { documentoHoja, escapar, imprimirDocumento } from "../../../print/imprimir";

// QR de cada cancha: quien lo escanea pide a la barra para el turno en juego (/c/{clubId}/{canchaId}?t=token).
// El token nace la primera vez que se abre esta pantalla; "Regenerar" invalida los QR impresos antes.

function hojaQr({ club, cancha, url }) {
  const qr = svgQr(url, { ancho: 320, titulo: cancha.nombre });
  const html =
    `<div style="padding-top:6mm"><p style="margin:0;font-size:14px;letter-spacing:.08em;text-transform:uppercase;opacity:.7">${escapar(club?.ticket?.encabezado || club?.nombre || "Padely")}</p>` +
    `<h1 style="margin:4mm 0 6mm;font-size:30px;line-height:1.1">Pedí a la barra<br>desde tu celular</h1>` +
    `<div>${qr}</div>` +
    `<h2 style="margin:6mm 0 2mm;font-size:26px">${escapar(cancha.nombre)}</h2>` +
    `<p style="margin:0;font-size:14px;opacity:.8">Escaneá el código con la cámara del celular. No hace falta tener cuenta.</p>` +
    `<p style="margin:8mm 0 0;font-size:10px;opacity:.6;word-break:break-all">${escapar(url)}</p></div>`;
  return documentoHoja(html, { titulo: `QR ${cancha.nombre}` });
}

export default function QrCanchas() {
  const clubActual = useAuthStore((s) => s.clubActual);
  const clubCargado = useAuthStore((s) => s.clubCargado);
  const puede = useAuthStore((s) => s.puede);
  const clubId = clubActual?.id || null;
  const puedeEntrar = !!clubActual && (puede("tarifas") || puede("configurarClub"));
  const [estado, setEstado] = useState({ para: null, canchas: [], error: false });
  const [ocupada, setOcupada] = useState(null);

  useEffect(() => {
    if (!clubId || !puedeEntrar) return undefined;
    let vivo = true;
    (async () => {
      try {
        const canchas = await getCanchas(clubId);
        const conToken = [];
        for (const c of canchas) conToken.push({ ...c, qrToken: c.qrToken || (await asegurarQrToken(clubId, c.id)) });
        conToken.sort((a, b) => String(a.nombre || "").localeCompare(String(b.nombre || ""), "es", { numeric: true }));
        if (vivo) setEstado({ para: clubId, canchas: conToken, error: false });
      } catch (err) {
        console.error("Error cargando las canchas:", err);
        if (vivo) setEstado({ para: clubId, canchas: [], error: true });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [clubId, puedeEntrar]);

  if (!clubCargado) return <div className="pd-skeleton h-64 rounded-lg" aria-busy="true" aria-label="Cargando" />;
  if (!clubActual || !puedeEntrar) {
    return (
      <div>
        <h1 className="heading-lg m-0 mb-4">QR de las canchas</h1>
        <SinPermiso />
      </div>
    );
  }

  const regenerar = async (c) => {
    const ok = await confirmar({
      titulo: `¿Regenerar el QR de ${c.nombre}?`,
      mensaje: "El QR impreso deja de servir: hay que imprimir el nuevo y cambiarlo en la cancha.",
      confirmText: "Regenerar",
      danger: true,
    });
    if (!ok) return;
    setOcupada(c.id);
    try {
      const token = await regenerarQrToken(clubId, c.id);
      setEstado((e) => ({ ...e, canchas: e.canchas.map((x) => (x.id === c.id ? { ...x, qrToken: token } : x)) }));
      toast.success("QR regenerado: imprimí el nuevo");
    } catch (err) {
      console.error("Error regenerando el token:", err);
      toast.error("No se pudo regenerar el QR.");
    } finally {
      setOcupada(null);
    }
  };
  const imprimir = async (c) => {
    setOcupada(c.id);
    try {
      await imprimirDocumento(hojaQr({ club: clubActual, cancha: c, url: urlQr(clubId, c.id, c.qrToken) }));
    } finally {
      setOcupada(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="heading-lg m-0">QR de las canchas</h1>
        <p className="body-md text-ink-2 mt-1 mb-0">Imprimí uno por cancha y pegalo donde se vea. Quien lo escanea pide a la barra para el turno en juego, con o sin cuenta de Padely.</p>
      </div>
      {estado.error && <Alert tone="danger">No pudimos cargar las canchas.</Alert>}
      {estado.para !== clubId && !estado.error ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Cargando">
          {[0, 1].map((i) => (
            <div key={i} className="pd-skeleton h-72 rounded-lg" />
          ))}
        </div>
      ) : estado.canchas.length === 0 ? (
        <Card className="text-center py-12!">
          <p className="heading-sm m-0">Todavía no hay canchas cargadas.</p>
          <Button as="link" to="/admin/canchas" variant="primary" className="mt-4">
            Ir a Canchas
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {estado.canchas.map((c) => {
            const url = urlQr(clubId, c.id, c.qrToken);
            return (
              <Card key={c.id} className="flex flex-col gap-3 items-center text-center">
                <Card.Title as="h2">{c.nombre}</Card.Title>
                <div className="w-full max-w-[220px] rounded-md overflow-hidden" dangerouslySetInnerHTML={{ __html: svgQr(url, { titulo: c.nombre }) }} />
                <p className="body-sm text-ink-3 m-0 break-all">{url}</p>
                <div className="pd-btn-group justify-center">
                  <Button variant="primary" icon={<Printer className="pd-icon" size={20} aria-hidden="true" />} onClick={() => imprimir(c)} cargando={ocupada === c.id ? "…" : ""}>
                    Imprimir
                  </Button>
                  <Button variant="ghost" icon={<RefreshCw className="pd-icon" size={20} aria-hidden="true" />} onClick={() => regenerar(c)} disabled={ocupada === c.id}>
                    Regenerar token
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      <p className="pd-help m-0">La hoja sale en A5: club, "Pedí a la barra desde tu celular", el QR y el nombre de la cancha.</p>
    </div>
  );
}
