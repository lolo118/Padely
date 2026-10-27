import { useEffect, useState } from "react";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { getEstadoPlataforma } from "../services/estadoService";
import { formatDiaHora } from "../utils/formatDate";
import { Card } from "../components/ui";

// /estado (P3-12, público): si Padely tiene un problema conocido o un mantenimiento, acá está el aviso del
// super-admin (configuracionPadely/estado); si no, "Todo funciona normalmente".
export default function Estado() {
  const [estado, setEstado] = useState(null);
  useEffect(() => {
    let vivo = true;
    getEstadoPlataforma({ fresco: true }).then((e) => vivo && setEstado(e));
    return () => {
      vivo = false;
    };
  }, []);
  if (!estado) return <div className="pd-skeleton h-40 rounded-lg max-w-2xl" aria-busy="true" aria-label="Cargando" />;
  const conAviso = estado.activo && estado.mensaje;
  return (
    <div className="max-w-2xl flex flex-col gap-4">
      <h1 className="heading-lg m-0">Estado de Padely</h1>
      <Card>
        <div className="flex items-start gap-3">
          {conAviso ? <TriangleAlert className="pd-icon-lg text-warning shrink-0" size={24} aria-hidden="true" /> : <CheckCircle2 className="pd-icon-lg text-success shrink-0" size={24} aria-hidden="true" />}
          <div>
            <p className="heading-sm m-0">{conAviso ? "Hay un aviso" : "Todo funciona normalmente"}</p>
            <p className="body-sm text-ink-2 mt-1 mb-0">{conAviso ? estado.mensaje : "Reservas, pagos, el bar y los torneos andan con normalidad."}</p>
            {conAviso && estado.desde && <p className="caption text-ink-3 mt-2 mb-0">Desde {formatDiaHora(estado.desde)}</p>}
          </div>
        </div>
      </Card>
    </div>
  );
}
