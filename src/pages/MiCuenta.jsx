import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CircleDot, ShoppingBag, UserPlus } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { escucharCuenta } from "../services/cuentasService";
import { getClubConfig } from "../services/canchaService";
import { asignarLineasTurno } from "../services/participantesService";
import { calcularTotalesCuenta, esLegacyDividida, iniciales, lineaPagada, lineasDeVentaParaParte, parteDelJugador, partePagada, participantePorUid, participantesActivos, puedeAsignar, saldosDeCuenta } from "../utils/cuentas";
import { puedePedir } from "../utils/pedidos";
import { formatPrecio } from "../utils/format";
import { formatDiaCorto, formatHora } from "../utils/formatDate";
import { toast } from "../components/Toast";
import { Alert, Badge, Button, Card, Pills } from "../components/ui";
import ChipsParticipantes from "../components/cuenta/ChipsParticipantes";
import AsignarSheet from "../components/cuenta/AsignarSheet";
import SumarJugadorDialog from "../components/cuenta/SumarJugadorDialog";
import PedirUI from "../components/pedidos/PedirUI";

// "Mi cuenta" / "Tu turno": lo que ve cada persona del turno (titular, jugador sumado o invitado anónimo que entró por
// el link). Primero "Tu parte" (cancha, tus consumos, los compartidos "÷3", lo sin asignar, pagado, debe), después
// "Todos" (quién pagó y quién debe: esa transparencia es el punto), y los consumos con su "para quién". El titular y
// los dueños de una línea la reasignan (Function asignarLineas). "Pedir a la barra" durante el turno. Sin pagos acá
// todavía (P3-8): se paga en el mostrador. Rutas: /mi-cuenta/:clubId/:grupoId (jugador) y /turno/:clubId/:grupoId
// (pública: también para sesiones anónimas).

const fmtCant = (n) => (Number(n) || 0).toLocaleString("es-AR", { maximumFractionDigits: 3 });
const TONO = { abierta: "success", cerrada: "neutral", anulada: "danger" };
const ETIQUETA = { abierta: "Abierta", cerrada: "Cerrada", anulada: "Anulada" };

export default function MiCuenta() {
  const { clubId, grupoId } = useParams();
  const user = useAuthStore((s) => s.user);
  const perfil = useAuthStore((s) => s.perfil);
  const anonimo = user?.isAnonymous === true;
  const [estado, setEstado] = useState({ cuenta: null, cargada: false, error: false });
  const [club, setClub] = useState(null);
  const [vista, setVista] = useState("cuenta"); // "cuenta" | "pedir"
  const [dialogo, setDialogo] = useState(null); // { tipo: "asignar", linea } | "invitar"
  const [ahora, setAhora] = useState(() => new Date());

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

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 60000);
    return () => clearInterval(t);
  }, []);

  const { cuenta } = estado;
  const saldos = useMemo(() => (cuenta ? saldosDeCuenta(cuenta) : null), [cuenta]);
  const yo = cuenta ? participantePorUid(cuenta, user?.uid) : null;
  const esTitular = !!cuenta && ((!!cuenta.jugadorUid && cuenta.jugadorUid === user?.uid) || yo?.tipo === "titular");
  const miSaldo = saldos && !saldos.legacy && yo ? saldos.participantes.find((p) => p.id === yo.id) : null;
  const reservaDelTurno = cuenta ? { id: grupoId, grupoId, clubId, canchaId: cuenta.canchaId, canchaName: cuenta.canchaNombre, fecha: cuenta.fecha, horaInicio: cuenta.horaInicio, horaFin: cuenta.horaFin, status: "confirmada", jugadorUid: cuenta.jugadorUid } : null;
  const enVentana = !!cuenta && cuenta.estado === "abierta" && puedePedir(reservaDelTurno, ahora);

  const volver = !anonimo ? (
    <Link to="/mis-reservas" className="body-sm text-ink-2 inline-flex items-center gap-1 hover:underline self-start">
      <ArrowLeft className="pd-icon" size={16} aria-hidden="true" /> Mis reservas
    </Link>
  ) : null;

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col gap-4">
        <Card className="text-center">
          <p className="heading-sm">Entrá para ver la cuenta del turno</p>
          <Button as="link" to={`/login?next=${encodeURIComponent(`/turno/${clubId}/${grupoId}`)}`} variant="primary" className="mt-4">
            Entrar con mi cuenta de Padely
          </Button>
        </Card>
      </div>
    );
  }
  if (!estado.cargada) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col gap-4" aria-busy="true" aria-label="Cargando">
        {volver}
        <div className="pd-skeleton h-8 w-48" />
        <div className="pd-skeleton h-40 rounded-lg" />
      </div>
    );
  }
  if (estado.error || !cuenta) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col gap-4">
        {volver}
        <Card className="text-center">
          <CircleDot className="pd-icon-lg mx-auto mb-3 text-ink-3" size={24} aria-hidden="true" />
          <p className="heading-sm">{estado.error ? "No pudimos abrir esta cuenta" : "Esta cuenta no existe"}</p>
          <p className="body-sm text-ink-2 mt-1">{estado.error ? "Solo quien reservó y las personas sumadas al turno pueden verla." : "El club todavía no abrió la cuenta de este turno."}</p>
          {!anonimo && (
            <Button as="link" to="/mis-reservas" variant="primary" className="mt-4">
              Volver a mis reservas
            </Button>
          )}
        </Card>
      </div>
    );
  }

  const totales = calcularTotalesCuenta(cuenta);
  const c = cuenta.cancha || {};
  const participantes = participantesActivos(cuenta);
  const legacy = esLegacyDividida(cuenta);
  const miParteLegacy = legacy ? parteDelJugador(cuenta, user?.uid, perfil?.nombre) : null;
  const abierta = cuenta.estado === "abierta";
  const nombreMio = yo?.nombre || perfil?.nombre || user.displayName || "";

  const asignar = async (linea, asignadoA) => {
    await asignarLineasTurno({ clubId, grupoId, lineaIds: [linea.lineaId], asignadoA });
    toast.success(asignadoA.length === 0 ? "Queda entre todos" : asignadoA.length === 1 ? "Listo" : `Compartido entre ${asignadoA.length}`);
    setDialogo(null);
  };
  const puedoTocar = (linea) => abierta && !!yo && puedeAsignar({ cuenta, linea, asignadoA: [yo.id], participante: yo, esTitular });

  const encabezado = (
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="pd-eyebrow m-0">{club?.nombre || "Club"}</p>
        <h1 className="heading-lg m-0 mt-1">{vista === "pedir" ? "Pedir a la barra" : "Cuenta del turno"}</h1>
        <p className="body-sm text-ink-2 m-0 mt-1 pd-tnum">
          {formatDiaCorto(cuenta.fecha)} · {cuenta.canchaNombre} · {cuenta.horaInicio}
          {cuenta.horaFin ? `–${cuenta.horaFin}` : ""}
          {cuenta.nombreJugador ? ` · reservó ${cuenta.nombreJugador}` : ""}
        </p>
      </div>
      <Badge tone={TONO[cuenta.estado] || "neutral"} dot={abierta}>
        {ETIQUETA[cuenta.estado] || cuenta.estado}
      </Badge>
    </header>
  );

  if (vista === "pedir" && enVentana && yo) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col gap-4">
        {volver}
        <Pills items={[{ value: "cuenta", label: "Cuenta" }, { value: "pedir", label: "Pedir" }]} value={vista} onChange={setVista} ariaLabel="Sección" />
        <PedirUI clubId={clubId} club={club} reserva={reservaDelTurno} uid={user.uid} nombre={nombreMio} origen="celular" anonimo={anonimo} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-4">
      {volver}
      {encabezado}
      {enVentana && yo && <Pills items={[{ value: "cuenta", label: "Cuenta" }, { value: "pedir", label: "Pedir" }]} value={vista} onChange={setVista} ariaLabel="Sección" />}

      {cuenta.estado === "anulada" && <Alert tone="danger">El club anuló esta cuenta.</Alert>}
      {abierta && !yo && !legacy && <Alert>Estás viendo la cuenta del turno. Si jugás en este turno, pedile al titular o al club que te sumen.</Alert>}

      {/* Tu parte */}
      {miSaldo && (
        <Card variant="night">
          <Card.Row className="items-start!">
            <Card.Eyebrow>Tu parte · {nombreMio}</Card.Eyebrow>
            {miSaldo.debe > 0 ? <Badge tone="warning" className="pd-tnum">{`Debés ${formatPrecio(miSaldo.debe)}`}</Badge> : <Badge tone="success">{miSaldo.pagado > 0 ? "Pagaste" : "Al día"}</Badge>}
          </Card.Row>
          <p className="numeral-lg pd-tnum m-0 mt-1">{formatPrecio(miSaldo.total)}</p>
          <ul className="m-0 mt-3 p-0 list-none grid gap-1 body-sm">
            {(miSaldo.canchaBruta > 0 || miSaldo.canchaPagada) && (
              <li className="flex justify-between gap-3 pd-tnum">
                <span>
                  Cancha{miSaldo.excluirCancha ? "" : saldos.reparto?.cabezas > 1 && miSaldo.canchaFija === null ? ` (÷${saldos.reparto.cabezas})` : ""}
                  {miSaldo.canchaPagada ? " · pagada" : ""}
                </span>
                <span>{miSaldo.canchaPagada ? "—" : formatPrecio(miSaldo.canchaBruta)}</span>
              </li>
            )}
            {miSaldo.seña > 0 && (
              <li className="flex justify-between gap-3 pd-tnum text-ink-2">
                <span>Seña a tu favor</span>
                <span>−{formatPrecio(miSaldo.seña)}</span>
              </li>
            )}
            {miSaldo.consumos.map((x, i) => (
              <li key={`${x.lineaId}-${i}`} className="flex justify-between gap-3 pd-tnum">
                <span>
                  {x.nombre}
                  {x.compartidoCon > 1 ? ` (÷${x.compartidoCon})` : ""}
                  {x.sinAsignar ? <span className="text-ink-3"> · sin asignar</span> : ""}
                </span>
                <span>{formatPrecio(x.monto)}</span>
              </li>
            ))}
            {miSaldo.pagado > 0 && (
              <li className="flex justify-between gap-3 pd-tnum text-ink-2 border-t border-line pt-1 mt-1">
                <span>Pagado</span>
                <span>{formatPrecio(miSaldo.pagado)}</span>
              </li>
            )}
          </ul>
          {abierta && <p className="body-sm text-ink-3 m-0 mt-3">Pagás en el mostrador. Pronto vas a poder pagar desde acá.</p>}
        </Card>
      )}
      {legacy && miParteLegacy && (
        <Card variant="night">
          <Card.Eyebrow>Tu parte</Card.Eyebrow>
          <Card.Row className="items-end!">
            <p className="numeral-lg pd-tnum m-0">{formatPrecio(miParteLegacy.total)}</p>
            {partePagada(miParteLegacy) ? <Badge tone="success">Pagada · {miParteLegacy.ventaNumero}</Badge> : <Badge tone="warning">Pendiente</Badge>}
          </Card.Row>
          <ul className="m-0 mt-3 p-0 list-none grid gap-1 body-sm">
            {lineasDeVentaParaParte(cuenta, miParteLegacy).map((l, i) => (
              <li key={i} className="flex justify-between gap-3 pd-tnum">
                <span>{l.nombre}</span>
                <span>{formatPrecio(l.subtotal)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Acciones del turno */}
      {abierta && (enVentana || esTitular) && (
        <div className="pd-btn-group">
          {enVentana && yo && (
            <Button variant="primary" icon={<ShoppingBag className="pd-icon" size={20} aria-hidden="true" />} onClick={() => setVista("pedir")}>
              Pedir a la barra
            </Button>
          )}
          {esTitular && !anonimo && (
            <Button icon={<UserPlus className="pd-icon" size={20} aria-hidden="true" />} onClick={() => setDialogo("invitar")}>
              Invitar
            </Button>
          )}
        </div>
      )}

      {/* Todos */}
      {saldos && !saldos.legacy && participantes.length > 0 && (
        <Card>
          <Card.Row>
            <Card.Title as="h2">Todos</Card.Title>
            <span className="body-sm text-ink-2 pd-tnum">
              {saldos.pagadoTotal > 0 ? `Pagado ${formatPrecio(saldos.pagadoTotal)} · faltan ${formatPrecio(saldos.pendiente)}` : `${participantes.length} en el turno`}
            </span>
          </Card.Row>
          <ul className="m-0 mt-3 p-0 list-none divide-y divide-line">
            {saldos.participantes.map((p) => (
              <li key={p.id} className="py-2 flex items-center gap-3">
                <span className="pd-avatar pd-avatar-sm" aria-hidden="true">
                  {iniciales(p.nombre)}
                </span>
                <span className="min-w-0 flex-1 truncate body-sm">
                  {p.nombre}
                  {yo && p.id === yo.id ? " (vos)" : ""}
                  {p.tipo === "titular" ? <span className="text-ink-3"> · titular</span> : ""}
                </span>
                <span className="pd-tnum body-sm text-ink-2">{formatPrecio(p.total)}</span>
                {p.debe > 0 ? <Badge tone="warning" className="pd-tnum">{`Debe ${formatPrecio(p.debe)}`}</Badge> : <Badge tone="success">{p.pagado > 0 ? "Pagó" : "Al día"}</Badge>}
              </li>
            ))}
          </ul>
          {saldos.reparto && c.cobrar !== false && <p className="pd-help mt-3 mb-0">La cancha se reparte entre {saldos.reparto.cabezas} en partes iguales{totales.seña > 0 ? `; la seña (${formatPrecio(totales.seña)}) va a favor de quien reservó` : ""}. Lo que nadie se asignó se divide entre todos al cobrar.</p>}
        </Card>
      )}

      {/* Consumos */}
      <Card>
        <Card.Title as="h2">Consumos</Card.Title>
        {(cuenta.items || []).length === 0 ? (
          <Card.Meta className="mt-2!">Todavía no hay consumos cargados.</Card.Meta>
        ) : (
          <ul className="m-0 mt-3 p-0 list-none divide-y divide-line">
            {cuenta.items.map((it) => {
              const pagada = lineaPagada(cuenta, it.lineaId);
              return (
                <li key={it.lineaId} className="py-2 flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block body-sm font-semibold">
                      {fmtCant(it.cantidad)} × {it.nombre}
                    </span>
                    <span className="block body-sm text-ink-3 pd-tnum">
                      {formatHora(it.agregadoEn)}
                      {it.pedidoId ? ` · pedido de ${it.pedidoPor || "—"}` : ""}
                    </span>
                    {!legacy && (
                      <span className="block mt-1">
                        <ChipsParticipantes asignadoA={it.asignadoA} participantes={participantes} onClick={puedoTocar(it) && !pagada ? () => setDialogo({ tipo: "asignar", linea: it }) : undefined} />
                        {pagada && <Badge tone="success" className="ml-2">Pagada</Badge>}
                      </span>
                    )}
                  </span>
                  <span className="pd-tnum font-semibold">{formatPrecio(it.subtotal)}</span>
                </li>
              );
            })}
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

      {legacy && cuenta.division?.partes?.length > 0 && !miParteLegacy && (
        <Card>
          <Card.Title as="h2">Dividida entre {cuenta.division.partes.length}</Card.Title>
          <ul className="m-0 mt-3 p-0 list-none divide-y divide-line">
            {cuenta.division.partes.map((p) => (
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

      {dialogo?.tipo === "asignar" && yo && <AsignarSheet lineas={[dialogo.linea]} participantes={participantes} yo={esTitular ? null : yo.id} onCerrar={() => setDialogo(null)} onGuardar={(ids) => asignar(dialogo.linea, ids)} />}
      {dialogo === "invitar" && (
        <SumarJugadorDialog clubId={clubId} grupoId={grupoId} clubNombre={club?.nombre} turno={{ fecha: cuenta.fecha, horaInicio: cuenta.horaInicio, horaFin: cuenta.horaFin, canchaNombre: cuenta.canchaNombre }} participantes={participantes} companerosDe={user.uid} pestañaInicial="wa" onCerrar={() => setDialogo(null)} />
      )}
    </div>
  );
}
