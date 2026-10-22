import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CircleDot } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { escucharCuenta } from "../services/cuentasService";
import { getClubConfig } from "../services/canchaService";
import { calcularTotalesCuenta, lineasDeVentaParaParte, parteDelJugador, partePagada } from "../utils/cuentas";
import { formatPrecio } from "../utils/format";
import { formatDiaCorto, formatHora } from "../utils/formatDate";
import { Alert, Badge, Button, Card } from "../components/ui";

// "Mi cuenta": el jugador que reservó ve la cuenta del turno (consumos, cancha, seña, total y su parte si está
// dividida). Solo lectura: pedir desde el celular es P3-5 y el ticket digital público, P3-6.

const fmtCant = (n) => (Number(n) || 0).toLocaleString("es-AR", { maximumFractionDigits: 3 });
const TONO = { abierta: "success", cerrada: "neutral", anulada: "danger" };
const ETIQUETA = { abierta: "Abierta", cerrada: "Cerrada", anulada: "Anulada" };

export default function MiCuenta() {
  const { clubId, grupoId } = useParams();
  const user = useAuthStore((s) => s.user);
  const perfil = useAuthStore((s) => s.perfil);
  const [estado, setEstado] = useState({ cuenta: null, cargada: false, error: false });
  const [club, setClub] = useState(null);

  useEffect(() => {
    if (!clubId || !grupoId || !user) return undefined;
    const unsub = escucharCuenta(
      clubId,
      grupoId,
      (cuenta) => setEstado({ cuenta, cargada: true, error: false }),
      (err) => {
        console.error("Error leyendo la cuenta:", err);
        setEstado({ cuenta: null, cargada: true, error: true });
      },
    );
    getClubConfig(clubId)
      .then(setClub)
      .catch((err) => console.error("Error leyendo el club:", err));
    return () => unsub();
  }, [clubId, grupoId, user]);

  const volver = (
    <Link to="/mis-reservas" className="body-sm text-ink-2 inline-flex items-center gap-1 hover:underline self-start">
      <ArrowLeft className="pd-icon" size={16} aria-hidden="true" /> Mis reservas
    </Link>
  );

  if (!estado.cargada) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col gap-4" aria-busy="true" aria-label="Cargando">
        {volver}
        <div className="pd-skeleton h-8 w-48" />
        <div className="pd-skeleton h-40 rounded-lg" />
      </div>
    );
  }
  const { cuenta } = estado;
  if (estado.error || !cuenta) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col gap-4">
        {volver}
        <Card className="text-center">
          <CircleDot className="pd-icon-lg mx-auto mb-3 text-ink-3" size={24} aria-hidden="true" />
          <p className="heading-sm">{estado.error ? "No pudimos abrir esta cuenta" : "Esta cuenta no existe"}</p>
          <p className="body-sm text-ink-2 mt-1">{estado.error ? "Solo quien hizo la reserva puede verla." : "El club todavía no cargó consumos a este turno."}</p>
          <Button as="link" to="/mis-reservas" variant="primary" className="mt-4">
            Volver a mis reservas
          </Button>
        </Card>
      </div>
    );
  }

  const totales = calcularTotalesCuenta(cuenta);
  const c = cuenta.cancha || {};
  const miParte = parteDelJugador(cuenta, user?.uid, perfil?.nombre);
  const partes = cuenta.division?.partes || [];

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-4">
      {volver}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="pd-eyebrow m-0">{club?.nombre || "Club"}</p>
          <h1 className="heading-lg m-0 mt-1">Cuenta del turno</h1>
          <p className="body-sm text-ink-2 m-0 mt-1 pd-tnum">
            {formatDiaCorto(cuenta.fecha)} · {cuenta.canchaNombre} · {cuenta.horaInicio}
            {cuenta.horaFin ? `–${cuenta.horaFin}` : ""}
          </p>
        </div>
        <Badge tone={TONO[cuenta.estado] || "neutral"} dot={cuenta.estado === "abierta"}>
          {ETIQUETA[cuenta.estado] || cuenta.estado}
        </Badge>
      </header>

      {cuenta.estado === "abierta" && <Alert>Lo que se va sumando al turno. Se cobra en el club al terminar; si la dividen entre los jugadores, acá vas a ver tu parte.</Alert>}
      {cuenta.estado === "anulada" && <Alert tone="danger">El club anuló esta cuenta.</Alert>}

      {miParte && (
        <Card variant="night">
          <Card.Eyebrow>Tu parte</Card.Eyebrow>
          <Card.Row className="items-end!">
            <p className="numeral-lg pd-tnum m-0">{formatPrecio(miParte.total)}</p>
            {partePagada(miParte) ? <Badge tone="success">Pagada · {miParte.ventaNumero}</Badge> : <Badge tone="warning">Pendiente</Badge>}
          </Card.Row>
          <ul className="m-0 mt-3 p-0 list-none grid gap-1 body-sm">
            {lineasDeVentaParaParte(cuenta, miParte).map((l, i) => (
              <li key={i} className="flex justify-between gap-3 pd-tnum">
                <span>
                  {l.cantidad !== 1 ? `${fmtCant(l.cantidad)} × ` : ""}
                  {l.nombre}
                </span>
                <span>{formatPrecio(l.subtotal)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <Card.Title as="h2">Consumos</Card.Title>
        {(cuenta.items || []).length === 0 ? (
          <Card.Meta className="mt-2!">Todavía no hay consumos cargados.</Card.Meta>
        ) : (
          <ul className="m-0 mt-3 p-0 list-none divide-y divide-line">
            {cuenta.items.map((it) => (
              <li key={it.lineaId} className="py-2 flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="block body-sm font-semibold">
                    {fmtCant(it.cantidad)} × {it.nombre}
                  </span>
                  <span className="block body-sm text-ink-3 pd-tnum">{formatHora(it.agregadoEn)}</span>
                </span>
                <span className="pd-tnum font-semibold">{formatPrecio(it.subtotal)}</span>
              </li>
            ))}
          </ul>
        )}
        <dl className="m-0 mt-4 grid gap-1 body-sm">
          <div className="flex justify-between text-ink-2">
            <dt>Consumos</dt>
            <dd className="m-0 pd-tnum">{formatPrecio(totales.consumos)}</dd>
          </div>
          <div className="flex justify-between text-ink-2">
            <dt>Cancha</dt>
            <dd className="m-0 pd-tnum">{totales.cancha > 0 ? formatPrecio(totales.cancha) : c.cobrar === false ? "pagada aparte" : "—"}</dd>
          </div>
          {Number(c.seña) > 0 && (
            <div className="flex justify-between text-ink-2">
              <dt>Seña {c.señaPagada ? "pagada" : "pendiente"}</dt>
              <dd className="m-0 pd-tnum">{totales.seña > 0 ? `−${formatPrecio(totales.seña)}` : formatPrecio(c.seña)}</dd>
            </div>
          )}
          <div className="flex items-end justify-between pt-2 mt-1 border-t border-line">
            <dt className="heading-sm">Total</dt>
            <dd className="m-0 numeral-md pd-tnum">{formatPrecio(totales.total)}</dd>
          </div>
        </dl>
      </Card>

      {partes.length > 0 && !miParte && (
        <Card>
          <Card.Title as="h2">Dividida entre {partes.length}</Card.Title>
          <ul className="m-0 mt-3 p-0 list-none divide-y divide-line">
            {partes.map((p) => (
              <li key={p.parteId} className="py-2 flex items-center justify-between gap-3">
                <span className="body-sm font-semibold">{p.nombre}</span>
                <span className="flex items-center gap-2">
                  <span className="pd-tnum">{formatPrecio(p.total)}</span>
                  {partePagada(p) ? <Badge tone="success">Pagada</Badge> : <Badge tone="warning">Pendiente</Badge>}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {cuenta.estado === "cerrada" && (cuenta.ventas || []).length > 0 && (
        <p className="body-sm text-ink-3 m-0 pd-tnum">
          {cuenta.ventas.length === 1 ? "Ticket" : "Tickets"} {cuenta.ventas.join(", ")} · comprobante no válido como factura
        </p>
      )}
    </div>
  );
}
