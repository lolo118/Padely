import { useEffect, useState } from "react";
import { collectionGroup, getDocs, query, where } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { formatPrecio } from "../../utils/format";
import { formatFechaHora } from "../../utils/formatDate";
import { Badge, Card } from "../ui";

// Reportes (P3-14 B): créditos dados por señas de reservas canceladas en este club (las devoluciones por Mercado Pago
// ya se ven como ventas de seña anuladas). Sin permiso o sin datos (antes del deploy) no se muestra.
export default function CreditosSenas({ clubId }) {
  const [creditos, setCreditos] = useState(null);
  useEffect(() => {
    let vivo = true;
    if (!clubId) return undefined;
    getDocs(query(collectionGroup(db, "creditos"), where("clubId", "==", clubId)))
      .then((snap) => vivo && setCreditos(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.creadoEn?.toMillis?.() || 0) - (a.creadoEn?.toMillis?.() || 0)).slice(0, 30)))
      .catch(() => vivo && setCreditos([]));
    return () => {
      vivo = false;
    };
  }, [clubId]);
  if (!creditos || creditos.length === 0) return null;
  const disponible = creditos.filter((c) => c.estado === "disponible").reduce((s, c) => s + (Number(c.monto) || 0), 0);
  return (
    <Card>
      <Card.Row>
        <Card.Title as="h3">Créditos por señas devueltas</Card.Title>
        <span className="caption text-ink-3 pd-tnum">Sin usar: {formatPrecio(disponible)}</span>
      </Card.Row>
      <ul className="mt-2">
        {creditos.map((c) => (
          <li key={c.id} className="py-2 border-b border-line last:border-b-0 flex flex-wrap items-center justify-between gap-2 body-sm">
            <span className="pd-tnum">
              {formatFechaHora(c.creadoEn)} · reserva del {c.origen?.fecha || "—"}
            </span>
            <span className="pd-badge-group">
              <span className="font-semibold pd-tnum">{formatPrecio(c.monto)}</span>
              <Badge tone={c.estado === "disponible" ? "warning" : "neutral"}>{c.estado === "disponible" ? "Sin usar" : "Usado"}</Badge>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
