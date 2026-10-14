import { useEffect, useState } from "react";
import { CircleDot } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { query, where, getDocs, collectionGroup, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { actualizarReserva } from "../services/canchaService";
import { notificarReservaCanceladaPorJugador } from "../services/notificationService";
import { formatFecha, getTodayLocal } from "../utils/formatDate";
import { formatPrecio } from "../utils/format";
import { toast } from "../components/Toast";
import { confirmar } from "../components/ConfirmDialog";
import { Badge, Button, Card } from "../components/ui";

// Estado de la reserva → tono del badge y su palabra. Llevan punto: son estados que cambian con el tiempo.
function estadoReserva(status) {
  if (status === "confirmada") return { tone: "success", label: "Confirmada" };
  if (status === "cancelada") return { tone: "danger", label: "Cancelada" };
  if (status === "rechazada") return { tone: "danger", label: "Rechazada" };
  if (status === "expirada") return { tone: "neutral", label: "Expirada" };
  if (String(status || "").startsWith("pendiente_")) return { tone: "warning", label: "Pendiente de seña" };
  return { tone: "warning", label: "Pendiente" };
}

export default function MisReservas() {
  const { user } = useAuthStore();
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(true);

  const [hoyStr] = useState(() => getTodayLocal());

  useEffect(() => {
    if (!user) return;
    const cargar = async () => {
      try {
        const q = query(collectionGroup(db, "reservas"), where("jugadorUid", "==", user.uid));
        const snap = await getDocs(q);
        const datos = [];

        for (const d of snap.docs) {
          const data = d.data();
          const clubRef = d.ref.parent.parent;
          const clubId = clubRef.id;
          let clubNombre = "";
          let clubOwnerUid = null;
          try {
            const clubSnap = await getDoc(clubRef);
            if (clubSnap.exists()) {
              clubNombre = clubSnap.data().nombre || clubSnap.data().name || "";
              clubOwnerUid = clubSnap.data().ownerUid || null;
            }
          } catch (err) { console.error(err); }
          datos.push({ id: d.id, clubId, clubNombre, clubOwnerUid, ...data });
        }

        // Separar y ordenar
        const proximas = datos
          .filter((r) => r.fecha >= hoyStr && r.status !== "cancelada")
          .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));

        const anteriores = datos
          .filter((r) => r.fecha < hoyStr || r.status === "cancelada")
          .sort((a, b) => (b.fecha + (b.hora || "")).localeCompare(a.fecha + (a.hora || "")));

        setReservas([...proximas, ...anteriores]);
      } catch (err) {
        console.error("Error al cargar reservas:", err);
      }
      setLoading(false);
    };
    cargar();
  }, [user, hoyStr]);

  // Hoy, con menos de 2 horas de anticipación, ya no se puede cancelar
  const puedeCancelar = (reserva) => {
    if (reserva.fecha !== getTodayLocal()) return true;
    const [h, m] = String(reserva.hora || "00:00").split(":").map(Number);
    const ahora = new Date();
    const inicio = new Date(ahora);
    inicio.setHours(h || 0, m || 0, 0, 0);
    return inicio.getTime() - ahora.getTime() >= 2 * 60 * 60 * 1000;
  };

  const cancelarReserva = async (reserva) => {
    if (!puedeCancelar(reserva)) {
      toast.error("Las reservas se pueden cancelar hasta 2 horas antes");
      return;
    }
    const ok = await confirmar({
      titulo: "Cancelar reserva",
      mensaje: `¿Cancelar la reserva de ${reserva.canchaName || reserva.cancha || "la cancha"} el ${formatFecha(reserva.fecha)} a las ${reserva.hora}?`,
      confirmText: "Cancelar reserva",
      cancelText: "Volver",
      danger: true,
    });
    if (!ok) return;
    try {
      await actualizarReserva(reserva.clubId, reserva.id, { status: "cancelada" });
      setReservas(reservas.map((r) => r.id === reserva.id ? { ...r, status: "cancelada" } : r));
      if (reserva.clubOwnerUid) {
        const nombreJugador = reserva.nombreJugador || user?.displayName || user?.email || "Un jugador";
        notificarReservaCanceladaPorJugador(reserva.clubOwnerUid, nombreJugador, reserva.canchaName || reserva.cancha || "la cancha", reserva.fecha, reserva.hora);
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

  const proximas = reservas.filter((r) => r.fecha >= hoyStr && r.status !== "cancelada");
  const anteriores = reservas.filter((r) => r.fecha < hoyStr || r.status === "cancelada");

  // Una reserva: fecha en el eyebrow, estado en el badge, club como título, cancha/hora/precio en body-sm.
  // Cancelar es secondary en la tarjeta; el danger vive en el diálogo de confirmación.
  function tarjeta(r, pasada) {
    const estado = estadoReserva(r.status);
    return (
      <Card key={r.id}>
        <Card.Row>
          <Card.Eyebrow className="pd-tnum">{formatFecha(r.fecha)}</Card.Eyebrow>
          <Badge dot tone={estado.tone}>
            {estado.label}
          </Badge>
        </Card.Row>
        <Card.Title className={pasada ? "mt-2! text-ink-2" : "mt-2!"}>{r.clubNombre || "Club"}</Card.Title>
        <p className="body-sm text-ink-2 mt-1 pd-tnum">
          {r.canchaName || r.cancha || "Cancha"} · {r.hora}
        </p>
        {r.precio != null && <p className="body-sm text-ink-2 pd-tnum">{formatPrecio(r.precio)}</p>}
        {!pasada && r.status !== "cancelada" && (
          <Card.Foot>
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

      {reservas.length === 0 ? (
        <Card className="text-center">
          <CircleDot className="pd-icon-lg mx-auto mb-3 text-ink-3" size={24} aria-hidden="true" />
          <p className="heading-sm">No tenés reservas</p>
          <p className="body-sm text-ink-2 mt-1">Cuando reserves una cancha, aparece acá.</p>
          <Button as="link" to="/clubes" variant="primary" className="mt-4">
            Ver canchas disponibles
          </Button>
        </Card>
      ) : (
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
        </div>
      )}
    </div>
  );
}
