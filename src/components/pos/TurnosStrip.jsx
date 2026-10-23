import { useEffect, useMemo, useRef, useState } from "react";
import { Info } from "lucide-react";
import { Badge, Button } from "../ui";
import { escucharReservasDeHoy } from "../../services/cuentasService";
import { textoTurno, ventanaDeTurno } from "../../utils/cuentas";
import { formatPrecio } from "../../utils/format";

// Franja de turnos del POS: las reservas confirmadas de hoy que están "en juego" (desde 30 min antes hasta 60 min
// después), una por reserva. Tocar una pasa el ticket a "cargar a la cuenta"; tocarla de nuevo la suelta.
// Las que ya tienen cuenta abierta muestran el total y se ven siempre, aunque el turno haya terminado.
//   clubId · seleccionId (grupoId | null) · onSeleccionar(reserva | null) · cuentasAbiertas (lista) ·
//   preseleccionId (desde ?cuenta= en la URL: se selecciona una vez cuando aparece)

export default function TurnosStrip({ clubId, seleccionId = null, onSeleccionar, cuentasAbiertas = [], preseleccionId = null, deshabilitado = false, onInfo = null }) {
  const [reservas, setReservas] = useState({ para: null, lista: [], error: false });
  const [verTodos, setVerTodos] = useState(false);
  const [ahora, setAhora] = useState(() => new Date());
  const preseleccionada = useRef(false);

  useEffect(() => {
    if (!clubId) return undefined;
    const unsub = escucharReservasDeHoy(
      clubId,
      (lista) => setReservas({ para: clubId, lista, error: false }),
      (err) => {
        console.error("Error escuchando las reservas de hoy:", err);
        setReservas({ para: clubId, lista: [], error: true });
      },
    );
    return () => unsub();
  }, [clubId]);

  // La ventana "en juego" se recalcula cada minuto
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const lista = useMemo(() => (reservas.para === clubId ? reservas.lista : []), [reservas, clubId]);
  const cuentaDe = (r) => cuentasAbiertas.find((c) => c.id === (r.grupoId || r.id)) || null;
  const visibles = verTodos ? lista : lista.filter((r) => ventanaDeTurno(r, ahora) || cuentaDe(r) || (r.grupoId || r.id) === seleccionId);

  // ?cuenta=<id>: se selecciona una sola vez, cuando la reserva aparece en la lista
  useEffect(() => {
    if (!preseleccionId || preseleccionada.current || !lista.length) return;
    const r = lista.find((x) => (x.grupoId || x.id) === preseleccionId);
    if (r) {
      preseleccionada.current = true;
      onSeleccionar?.(r);
    }
  }, [preseleccionId, lista, onSeleccionar]);

  if (reservas.para !== clubId && !reservas.error) return <div className="pd-skeleton h-11 w-full max-w-xl" aria-hidden="true" />;
  if (reservas.error) return <p className="pd-help m-0">No pudimos cargar los turnos de hoy.</p>;
  if (lista.length === 0) return <p className="pd-help m-0">Sin turnos confirmados hoy. Las ventas sueltas se cobran como siempre.</p>;

  return (
    <div className="flex flex-col gap-2" aria-label="Turnos de hoy">
      <div className="flex items-center justify-between gap-2">
        <span className="pd-eyebrow">Turnos {verTodos ? "de hoy" : "en juego"}</span>
        <Button variant="ghost" size="sm" onClick={() => setVerTodos((v) => !v)}>
          {verTodos ? "Solo en juego" : `Ver todos los de hoy (${lista.length})`}
        </Button>
      </div>
      {visibles.length === 0 ? (
        <p className="pd-help m-0">Ningún turno en juego ahora. "Ver todos los de hoy" muestra los demás.</p>
      ) : (
        <div className="pd-pills flex-nowrap! overflow-x-auto pb-1" role="listbox" aria-label="Turnos">
          {visibles.map((r) => {
            const id = r.grupoId || r.id;
            const cuenta = cuentaDe(r);
            const activo = id === seleccionId;
            // Un turno cuya cuenta ya se cerró (la reserva lleva cuentaCerrada) se ve apagado: no se le carga más
            const cerrado = !cuenta && r.cuentaCerrada === true;
            const pendientes = Number(cuenta?.pedidosPendientes) || 0;
            return (
              <span key={id} className="inline-flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  role="option"
                  aria-selected={activo}
                  className={["pd-pill h-11! shrink-0", cerrado && "text-ink-3! opacity-60"].filter(Boolean).join(" ")}
                  disabled={deshabilitado || cerrado}
                  title={cerrado ? "La cuenta de este turno ya se cerró" : undefined}
                  onClick={() => onSeleccionar?.(activo ? null : r)}
                >
                  {textoTurno({ canchaNombre: r.canchaName, horaInicio: r.horaInicio, horaFin: r.horaFin, nombreJugador: r.nombreJugador })}
                  {cuenta && (
                    <Badge tone={activo ? "neutral" : "court"} className="pd-tnum">
                      {formatPrecio(cuenta.totales?.total)} abierta
                    </Badge>
                  )}
                  {pendientes > 0 && <Badge tone="warning">{pendientes === 1 ? "1 pedido" : `${pendientes} pedidos`}</Badge>}
                </button>
                {onInfo && <Button variant="ghost" size="sm" iconOnly aria-label={`Ficha del turno de ${r.nombreJugador || "jugador"}`} icon={<Info className="pd-icon" size={20} aria-hidden="true" />} onClick={() => onInfo(r)} />}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
