import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { CircleDot } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { query, where, getDocs, collectionGroup, getDoc, doc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { cancelarReservaGrupo } from "../services/canchaService";
import { pagarConMercadoPago } from "../services/mercadoPagoService";
import { notificarReservaCanceladaPorJugador } from "../services/notificationService";
import { formatDiaCorto, getTodayLocal } from "../utils/formatDate";
import { formatPrecio } from "../utils/format";
import { agruparReservas, estadoSeña, rangoHoras } from "../utils/reservas";
import { toast } from "../components/Toast";
import { confirmar } from "../components/ConfirmDialog";
import { Badge, Button, Card } from "../components/ui";
import CuentaTurnoResumen from "../components/CuentaTurnoResumen";
import SumarJugadorDialog from "../components/cuenta/SumarJugadorDialog";
import { escucharCuentasDondeParticipo, escucharMisCuentasAbiertas } from "../services/cuentasService";
import { escucharMisPedidos } from "../services/pedidosService";
import { participantePorUid, saldosDeCuenta } from "../utils/cuentas";

// Estado de la reserva → tono del badge y su palabra. Llevan punto: son estados que cambian con el tiempo.
function estadoReserva(status) {
  if (status === "confirmada") return { tone: "success", label: "Confirmada" };
  if (status === "cancelada") return { tone: "danger", label: "Cancelada" };
  if (status === "rechazada") return { tone: "danger", label: "Rechazada" };
  if (status === "expirada") return { tone: "neutral", label: "Expirada" };
  if (String(status || "").startsWith("pendiente_")) return { tone: "warning", label: "Pendiente de seña" };
  return { tone: "warning", label: "Pendiente" };
}

// Una reserva ya cerrada (cancelada, rechazada o expirada) no tiene seña pendiente que mostrar
const ESTADOS_CERRADOS = ["cancelada", "rechazada", "expirada"];

// Badge de seña de una reserva: "Seña $ 5.000 pendiente" (warning) / "Seña cobrada" (success) / nada
function badgeSeña(r) {
  const seña = estadoSeña(r);
  if (!seña) return null;
  if (seña.tone === "success") return <Badge tone="success">{seña.label}</Badge>;
  if (ESTADOS_CERRADOS.includes(r.status)) return null;
  return <Badge tone="warning">Seña {formatPrecio(seña.monto)} pendiente</Badge>;
}

// Una reserva agrupada se identifica por club + grupoId (el id del grupo es el slot del primer turno)
const claveReserva = (r) => `${r.clubId || ""}/${r.id}`;

export default function MisReservas() {
  const { user } = useAuthStore();
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);
  // Seña online (P3-8): solo el titular, con seña pendiente y el club con Mercado Pago conectado
  const [pagandoSeña, setPagandoSeña] = useState(null);
  const puedePagarSeñaMp = (r) => r.clubMp === true && r.jugadorUid === user?.uid && Number(r.seña) > 0 && !r.señaPagada && !ESTADOS_CERRADOS.includes(r.status);
  const pagarSeñaMp = async (r) => {
    setPagandoSeña(claveReserva(r));
    try {
      await pagarConMercadoPago({ clubId: r.clubId, tipo: "seña", reservaId: r.grupoId || r.id });
    } catch (e) {
      console.error("No pudimos abrir Mercado Pago:", e);
      toast.error(e?.message || "No pudimos abrir Mercado Pago. Podés pagar la seña en el club.");
      setPagandoSeña(null);
    }
  };
  // Vuelta de Mercado Pago (?mp=ok|pendiente|error): un aviso y la URL limpia
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const mp = params.get("mp");
    if (!mp) return;
    if (mp === "ok") toast.success("Pago recibido. La seña figura pagada en cuanto Mercado Pago lo confirma (unos segundos).");
    else if (mp === "pendiente") toast.info("Mercado Pago dejó el pago pendiente: cuando se acredite, la seña figura pagada.");
    else toast.error("El pago de la seña no se completó. Podés intentar de nuevo o pagarla en el club.");
    setParams(
      (p) => {
        p.delete("mp");
        return p;
      },
      { replace: true },
    );
  }, [params, setParams]);

  const [hoyStr] = useState(() => getTodayLocal());
  const [verCanceladas, setVerCanceladas] = useState(false);
  // Cuentas del turno abiertas a nombre del jugador (cualquier club), por grupoId de la reserva
  const [cuentas, setCuentas] = useState([]);
  useEffect(() => {
    if (!user) return undefined;
    const unsub = escucharMisCuentasAbiertas(user.uid, setCuentas, (err) => console.error("Error escuchando mis cuentas:", err));
    return () => unsub();
  }, [user]);
  const cuentaDe = (r) => cuentas.find((c) => c.id === (r.grupoId || r.id) && c.clubId === r.clubId) || null;
  // Cuentas abiertas de turnos a los que me sumaron (no soy quien reservó), con el nombre del club
  const [participo, setParticipo] = useState([]);
  const [nombresClub, setNombresClub] = useState({});
  useEffect(() => {
    if (!user) return undefined;
    const unsub = escucharCuentasDondeParticipo(user.uid, (lista) => setParticipo(lista.filter((c) => c.jugadorUid !== user.uid)), (err) => console.error("Error escuchando los turnos donde participo:", err));
    return () => unsub();
  }, [user]);
  useEffect(() => {
    const faltan = [...new Set(participo.map((c) => c.clubId))].filter((id) => !(id in nombresClub));
    if (!faltan.length) return undefined;
    let vivo = true;
    Promise.all(faltan.map((id) => getDoc(doc(db, "clubs", id)).then((s) => [id, s.exists() ? s.data().nombre || "" : ""]).catch(() => [id, ""]))).then((pares) => vivo && setNombresClub((prev) => ({ ...prev, ...Object.fromEntries(pares) })));
    return () => {
      vivo = false;
    };
  }, [participo, nombresClub]);
  // "Invitar" desde la tarjeta del titular
  const [invitando, setInvitando] = useState(null); // { reserva, cuenta }
  // Mis pedidos a la barra (cualquier club), por reserva
  const [pedidos, setPedidos] = useState([]);
  useEffect(() => {
    if (!user) return undefined;
    const unsub = escucharMisPedidos(user.uid, setPedidos, (err) => console.error("Error escuchando mis pedidos:", err));
    return () => unsub();
  }, [user]);
  const pedidosDe = (r) => pedidos.filter((p) => p.cuentaId === (r.grupoId || r.id) && p.clubId === r.clubId);

  useEffect(() => {
    if (!user) return;
    const cargar = async () => {
      try {
        const q = query(collectionGroup(db, "reservas"), where("jugadorUid", "==", user.uid));
        const snap = await getDocs(q);
        const datos = [];
        // Un club se lee una sola vez aunque tenga varios turnos del jugador
        const clubesPorId = new Map();

        for (const d of snap.docs) {
          const data = d.data();
          const clubRef = d.ref.parent.parent;
          const clubId = clubRef.id;
          if (!clubesPorId.has(clubId)) {
            let clubNombre = "";
            let clubOwnerUid = null;
            let clubMp = false;
            try {
              const clubSnap = await getDoc(clubRef);
              if (clubSnap.exists()) {
                clubNombre = clubSnap.data().nombre || clubSnap.data().name || "";
                clubOwnerUid = clubSnap.data().ownerUid || null;
                clubMp = clubSnap.data().mercadoPago?.conectado === true;
              }
            } catch (err) { console.error(err); }
            clubesPorId.set(clubId, { clubNombre, clubOwnerUid, clubMp });
          }
          datos.push({ id: d.id, clubId, ...clubesPorId.get(clubId), ...data });
        }

        // Una tarjeta por reserva: los turnos de varias horas se agrupan por grupoId (los viejos son de una hora)
        const grupos = agruparReservas(datos);

        // Separar y ordenar
        const proximas = grupos
          .filter((r) => r.fecha >= hoyStr && r.status !== "cancelada")
          .sort((a, b) => (a.fecha + a.horaInicio).localeCompare(b.fecha + b.horaInicio));

        const anteriores = grupos
          .filter((r) => r.fecha < hoyStr && r.status !== "cancelada")
          .sort((a, b) => (b.fecha + (b.horaInicio || "")).localeCompare(a.fecha + (a.horaInicio || "")));
        const canceladas = grupos
          .filter((r) => r.status === "cancelada")
          .sort((a, b) => (b.fecha + (b.horaInicio || "")).localeCompare(a.fecha + (a.horaInicio || "")));

        setReservas([...proximas, ...anteriores, ...canceladas]);
      } catch (err) {
        console.error("Error al cargar reservas:", err);
      }
      setLoading(false);
    };
    cargar();
  }, [user, hoyStr]);

  // Hoy, con menos de 2 horas de anticipación al inicio, ya no se puede cancelar
  const puedeCancelar = (reserva) => {
    if (reserva.fecha !== getTodayLocal()) return true;
    const [h, m] = String(reserva.horaInicio || reserva.hora || "00:00").split(":").map(Number);
    const ahora = new Date();
    const inicio = new Date(ahora);
    inicio.setHours(h || 0, m || 0, 0, 0);
    return inicio.getTime() - ahora.getTime() >= 2 * 60 * 60 * 1000;
  };

  // Cancela la reserva entera (todos sus turnos) y avisa al club una sola vez con el rango de horas
  const cancelarReserva = async (reserva) => {
    if (!puedeCancelar(reserva)) {
      toast.error("Las reservas se pueden cancelar hasta 2 horas antes");
      return;
    }
    const cancha = reserva.canchaName || reserva.cancha || "la cancha";
    const ok = await confirmar({
      titulo: "Cancelar reserva",
      mensaje: `¿Cancelar la reserva de ${cancha} el ${formatDiaCorto(reserva.fecha)} de ${reserva.horaInicio} a ${reserva.horaFin}?`,
      confirmText: "Cancelar reserva",
      cancelText: "Volver",
      danger: true,
    });
    if (!ok) return;
    try {
      await cancelarReservaGrupo(reserva.clubId, reserva.id);
      const clave = claveReserva(reserva);
      setReservas(
        reservas.map((r) =>
          claveReserva(r) === clave
            ? { ...r, status: "cancelada", slots: (r.slots || []).map((s) => ({ ...s, status: "cancelada" })) }
            : r,
        ),
      );
      if (reserva.clubOwnerUid) {
        const nombreJugador = reserva.nombreJugador || user?.displayName || user?.email || "Un jugador";
        notificarReservaCanceladaPorJugador(
          reserva.clubOwnerUid,
          nombreJugador,
          cancha,
          reserva.fecha,
          rangoHoras(reserva.horaInicio, reserva.horaFin),
        );
      }
      toast.success("Reserva cancelada");
    } catch (err) {
      console.error("Error al cancelar:", err);
      toast.error("No pudimos cancelar la reserva. Intentá de nuevo.");
    }
  };

  const encabezado = (
    <header className="mb-6">
      <h1 className="display-lg">Mis reservas</h1>
      <p className="body-sm text-ink-2 mt-1">Tus reservas de canchas</p>
    </header>
  );

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto" aria-busy="true">
        {encabezado}
        <p className="sr-only">Cargando reservas…</p>
        <div className="flex flex-col gap-4">
          <div className="pd-skeleton h-36 rounded-lg!" />
          <div className="pd-skeleton h-36 rounded-lg!" />
          <div className="pd-skeleton h-36 rounded-lg!" />
        </div>
      </div>
    );
  }

  // Tres grupos por estado y fecha: una cancelada nunca se mezcla con las próximas ni con las anteriores
  const proximas = reservas.filter((r) => r.fecha >= hoyStr && r.status !== "cancelada");
  const anteriores = reservas.filter((r) => r.fecha < hoyStr && r.status !== "cancelada");
  const canceladas = reservas.filter((r) => r.status === "cancelada");

  // Un turno al que me sumaron: la cuenta compartida vista desde mi lado
  function tarjetaParticipo(c) {
    const yo = participantePorUid(c, user?.uid);
    const s = saldosDeCuenta(c);
    const mio = yo && !s.legacy ? s.participantes.find((p) => p.id === yo.id) : null;
    return (
      <Card key={`p/${c.clubId}/${c.id}`}>
        <Card.Row>
          <Card.Eyebrow>{formatDiaCorto(c.fecha)}</Card.Eyebrow>
          <Badge tone="court">Te sumó {c.nombreJugador || "el titular"}</Badge>
        </Card.Row>
        <Card.Title className="mt-2!">{nombresClub[c.clubId] || "Club"}</Card.Title>
        <p className="body-sm text-ink-2 mt-1 pd-tnum">
          {c.canchaNombre || "Cancha"} · {rangoHoras(c.horaInicio, c.horaFin)}
        </p>
        {mio && (
          <p className="body-sm m-0 pd-tnum">
            <span className="text-ink-2">Mi parte: </span>
            <strong>{formatPrecio(mio.total)}</strong>
            <span className="text-ink-3"> · {mio.pagado > 0 ? `Pagaste ${formatPrecio(mio.pagado)}` : `Debés ${formatPrecio(mio.debe)}`}</span>
          </p>
        )}
        <Card.Foot>
          <Button as="link" to={`/mi-cuenta/${c.clubId}/${c.id}`} size="sm" variant="primary">
            Ver cuenta
          </Button>
        </Card.Foot>
      </Card>
    );
  }

  // Una reserva: fecha en el eyebrow, estado y seña en los badges, club como título, cancha, rango de horas y
  // total en body-sm. Cancelar es secondary en la tarjeta; el danger vive en el diálogo de confirmación.
  function tarjeta(r, pasada) {
    const estado = estadoReserva(r.status);
    return (
      <Card key={claveReserva(r)}>
        <Card.Row>
          <Card.Eyebrow>{formatDiaCorto(r.fecha)}</Card.Eyebrow>
          <span className="flex flex-wrap items-center justify-end gap-2">
            {badgeSeña(r)}
            <Badge dot tone={estado.tone}>
              {estado.label}
            </Badge>
          </span>
        </Card.Row>
        <Card.Title className={pasada ? "mt-2! text-ink-2" : "mt-2!"}>{r.clubNombre || "Club"}</Card.Title>
        <p className="body-sm text-ink-2 mt-1 pd-tnum">
          {r.canchaName || r.cancha || "Cancha"} · {rangoHoras(r.horaInicio, r.horaFin)}
        </p>
        {r.precioTotal > 0 && <p className="body-sm text-ink-2 pd-tnum">{formatPrecio(r.precioTotal)}</p>}
        {r.status !== "cancelada" && <CuentaTurnoResumen reserva={r} cuenta={cuentaDe(r)} pedidos={pedidosDe(r)} uid={user?.uid} onInvitar={(reserva, cuenta) => setInvitando({ reserva, cuenta })} />}
        {!pasada && r.status !== "cancelada" && (
          <Card.Foot>
            {puedePagarSeñaMp(r) && (
              <Button size="sm" variant="primary" cargando={pagandoSeña === claveReserva(r) ? "Abriendo Mercado Pago…" : ""} onClick={() => pagarSeñaMp(r)}>
                Pagar seña con Mercado Pago
              </Button>
            )}
            <Button size="sm" onClick={() => cancelarReserva(r)}>
              Cancelar reserva
            </Button>
          </Card.Foot>
        )}
      </Card>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      {encabezado}

      {participo.length > 0 && (
        <section aria-labelledby="turnos-participo" className="mb-8">
          <h2 id="turnos-participo" className="heading-lg mb-3">
            Turnos a los que te sumaron <span className="pd-count text-ink-3 font-semibold">{participo.length}</span>
          </h2>
          <div className="flex flex-col gap-4">{participo.map(tarjetaParticipo)}</div>
        </section>
      )}
      {reservas.length === 0 && participo.length === 0 ? (
        <Card className="text-center">
          <CircleDot className="pd-icon-lg mx-auto mb-3 text-ink-3" size={24} aria-hidden="true" />
          <p className="heading-sm">No tenés reservas</p>
          <p className="body-sm text-ink-2 mt-1">Cuando reserves una cancha, aparece acá.</p>
          <Button as="link" to="/clubes" variant="primary" className="mt-4">
            Ver canchas disponibles
          </Button>
        </Card>
      ) : reservas.length === 0 ? null : (
        <div className="flex flex-col gap-8">
          {/* Próximas */}
          {proximas.length > 0 && (
            <section aria-labelledby="reservas-proximas">
              <h2 id="reservas-proximas" className="heading-lg mb-3">
                Próximas <span className="pd-count text-ink-3 font-semibold">{proximas.length}</span>
              </h2>
              <div className="flex flex-col gap-4">{proximas.map((r) => tarjeta(r, false))}</div>
            </section>
          )}

          {/* Anteriores */}
          {anteriores.length > 0 && (
            <section aria-labelledby="reservas-anteriores">
              <h2 id="reservas-anteriores" className="heading-lg mb-3">
                Anteriores <span className="pd-count text-ink-3 font-semibold">{anteriores.length}</span>
              </h2>
              <div className="flex flex-col gap-4">{anteriores.map((r) => tarjeta(r, true))}</div>
            </section>
          )}

          {/* Canceladas: plegadas, nunca mezcladas con las demás */}
          {canceladas.length > 0 && (
            <section aria-labelledby="reservas-canceladas">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <h2 id="reservas-canceladas" className="heading-lg m-0 text-ink-2">
                  Canceladas <span className="pd-count text-ink-3 font-semibold">{canceladas.length}</span>
                </h2>
                <Button size="sm" variant="ghost" onClick={() => setVerCanceladas((v) => !v)} aria-expanded={verCanceladas} aria-controls="lista-canceladas">
                  {verCanceladas ? "Ocultar" : "Ver"}
                </Button>
              </div>
              {verCanceladas && (
                <div id="lista-canceladas" className="flex flex-col gap-4">
                  {canceladas.map((r) => tarjeta(r, true))}
                </div>
              )}
            </section>
          )}
        </div>
      )}
      {invitando && (
        <SumarJugadorDialog
          clubId={invitando.reserva.clubId}
          grupoId={invitando.reserva.grupoId || invitando.reserva.id}
          clubNombre={invitando.reserva.clubNombre}
          turno={{ fecha: invitando.reserva.fecha, horaInicio: invitando.reserva.horaInicio, horaFin: invitando.reserva.horaFin, canchaNombre: invitando.reserva.canchaName }}
          participantes={invitando.cuenta?.participantes?.filter((p) => p.estado !== "quitado") || []}
          companerosDe={user?.uid}
          pestañaInicial="wa"
          onCerrar={() => setInvitando(null)}
        />
      )}
    </div>
  );
}
