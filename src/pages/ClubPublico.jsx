import { Fragment, useEffect, useState } from "react";
import { Link, useParams, useNavigate, useLocation } from "react-router-dom";
import {
  AlertTriangle,
  AtSign,
  Camera,
  Check,
  ChevronLeft,
  Clock,
  ExternalLink,
  Globe,
  Lock,
  Mail,
  MapPin,
  MessageCircle,
  Phone,
  Star,
} from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { formatFecha, getTodayLocal, addDaysLocal, horaActualStr } from "../utils/formatDate";
import { formatPrecio, ubicacionCorta } from "../utils/format";
import {
  calcularSeña,
  horasDeReserva,
  maxTurnosDelClub,
  precioDeReserva,
  precioDeSlot,
  precioMinimo,
  preciosDeReserva,
  sumarHoras,
} from "../utils/tarifas";
import { rangoHoras } from "../utils/reservas";
import {
  getCanchas,
  getReservas,
  getTurnosFijos,
  crearReserva,
} from "../services/canchaService";
import { getTorneosDeClub } from "../services/torneoService";
import { canchasDelTorneo, listaCategorias } from "../utils/torneo";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  addDoc,
} from "firebase/firestore";
import { db, logEvento } from "../lib/firebase";
import { getUserData } from "../services/authService";
import { notificarNuevaReserva } from "../services/notificationService";
import { toast } from "../components/Toast";
import { confirmar } from "../components/ConfirmDialog";
import { Alert, Badge, Button, Card, Field, Input, MarcaCategoria, Pills, SlotCell, Tabs, Textarea } from "../components/ui";

const horasDelDia = Array.from(
  { length: 24 },
  (_, i) => `${i.toString().padStart(2, "0")}:00`,
);

// Fechas cortas del design system ("mié 15 oct") a partir de "YYYY-MM-DD", en hora local
const DIAS_CORTOS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function partesFecha(fechaStr) {
  const [y, m, d] = String(fechaStr).split("-").map(Number);
  return { m, d, dia: new Date(y, m - 1, d).getDay() };
}

function fechaCorta(fechaStr) {
  if (!fechaStr) return "";
  const { m, d, dia } = partesFecha(fechaStr);
  return `${DIAS_CORTOS[dia]} ${d} ${MESES_CORTOS[m - 1]}`;
}

// Etiqueta de cada pastilla del selector de día: "Hoy", "Mañana" y después "mié 15"
function etiquetaDia(fechaStr, indice) {
  if (indice === 0) return "Hoy";
  if (indice === 1) return "Mañana";
  const { d, dia } = partesFecha(fechaStr);
  return `${DIAS_CORTOS[dia]} ${d}`;
}

// Torneos que se juegan en el club (tab "Torneos"): abierto y en curso llevan el marco heat (Card torneo) y
// su badge heat; finalizado y cancelado, tarjeta quieta con badge neutro o danger, como en la lista de torneos.
const torneoEstadoTone = {
  inscripcion: "heat",
  en_curso: "heat",
  finalizado: "neutral",
  cancelado: "danger",
};

const torneoEstadoLabel = {
  inscripcion: "Inscripción abierta",
  en_curso: "En curso",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
};

const esTorneoActivo = (t) => t?.status === "inscripcion" || t?.status === "en_curso";

// Toda la tarjeta del torneo es el link (Card as={Link}), con el foco visible del sistema
const enlaceCard =
  "block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";

// Un turno bloqueado por un partido de torneo (lo escribe la Cloud Function): se ve reservado y no se reserva
const esBloqueoTorneo = (reserva) => reserva?.tipo === "torneo";

// Puntuación de reviews. El sistema no define estrellas: Lucide Star, llena en ink y vacía en ink-3
function StarRating({ value, onChange }) {
  return (
    <div className="flex gap-1" role="radiogroup" aria-label="Puntuación">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={star === value}
          aria-label={`${star} ${star === 1 ? "estrella" : "estrellas"}`}
          onClick={() => onChange?.(star)}
          className="grid h-11 w-11 place-items-center rounded-sm cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <Star
            className={`pd-icon-lg ${star <= value ? "text-ink fill-current" : "text-ink-3"}`}
            size={24}
            aria-hidden="true"
          />
        </button>
      ))}
    </div>
  );
}

function StarDisplay({ value, size = 16 }) {
  const llenas = Math.round(value || 0);
  return (
    <div className="flex gap-0.5" role="img" aria-label={`${Number(value || 0).toFixed(1)} de 5`}>
      {[1, 2, 3, 4, 5].map((star) => (
        <Star
          key={star}
          size={size}
          className={star <= llenas ? "text-ink fill-current" : "text-ink-3"}
          aria-hidden="true"
        />
      ))}
    </div>
  );
}

// Las canchas del club como tarjetas: nombre, superficie y el precio más bajo entre semana y fin de semana
function ListaCanchas({ canchas }) {
  if (canchas.length === 0) {
    return <p className="body-sm text-ink-2">Este club todavía no cargó sus canchas.</p>;
  }
  return (
    <div className="grid gap-4 sm:grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
      {canchas.map((c) => (
        <Card key={c.id}>
          <Card.Row>
            <div className="min-w-0">
              <Card.Title>{c.nombre}</Card.Title>
              <Card.Meta>{[c.superficie, c.techada ? "Techada" : "Aire libre"].filter(Boolean).join(" · ")}</Card.Meta>
            </div>
            <div className="shrink-0 text-right">
              <span className="caption text-ink-3 block">Desde</span>
              <span className="numeral-md pd-tnum text-ink">{formatPrecio(precioMinimo(c))}</span>
            </div>
          </Card.Row>
        </Card>
      ))}
    </div>
  );
}

export default function ClubPublico() {
  const { id } = useParams();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [club, setClub] = useState(null);
  const [canchas, setCanchas] = useState([]);
  const [reservas, setReservas] = useState([]);
  const [turnosFijos, setTurnosFijos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fechaSeleccionada, setFechaSeleccionada] = useState(() => {
    // Si venimos del hub con una fecha pasada, arrancamos en hoy
    const hoy = getTodayLocal();
    const f = location.state?.fecha;
    return f && f >= hoy ? f : hoy;
  });
  const [mostrarModal, setMostrarModal] = useState(false);
  const [modalData, setModalData] = useState(null);
  // Horas seguidas elegidas en el diálogo (1 a maxTurnosDelClub); vuelve a 1 cada vez que se abre
  const [turnos, setTurnos] = useState(1);
  const [reservaExitosa, setReservaExitosa] = useState(null);
  const [formReserva, setFormReserva] = useState({
    nombreJugador: "",
    email: "",
    telefono: "",
  });
  const [guardando, setGuardando] = useState(false);
  const [tab, setTab] = useState("canchas");

  // Torneos del club: se cargan una sola vez, la primera vez que se abre la pestaña (null = todavía no)
  const [torneosClub, setTorneosClub] = useState(null);

  // Reviews
  const [reviews, setReviews] = useState([]);
  const [puedeReview, setPuedeReview] = useState(false);
  const [yaHizoReview, setYaHizoReview] = useState(false);
  const [mostrarFormReview, setMostrarFormReview] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    estrellas: 5,
    comentario: "",
  });
  const [guardandoReview, setGuardandoReview] = useState(false);

  useEffect(() => {
    const cargar = async () => {
      try {
        const snap = await getDoc(doc(db, "clubs", id));
        if (snap.exists()) {
          const clubData = { id: snap.id, ...snap.data() };
          setClub(clubData);
          // Ventana de reserva del club: si la fecha quedó fuera, la ajustamos (el efecto vuelve a correr)
          const maxPermitida = addDaysLocal(getTodayLocal(), clubData.diasAnticipacion ?? 7);
          if (fechaSeleccionada > maxPermitida) {
            setFechaSeleccionada(maxPermitida);
            return;
          }
          // Reservas y turnos fijos no son públicos: sin sesión solo se cargan las canchas
          const [canchasData, reservasData, turnosData] = await Promise.all([
            getCanchas(id),
            user ? getReservas(id, fechaSeleccionada) : Promise.resolve([]),
            user ? getTurnosFijos(id) : Promise.resolve([]),
          ]);
          setCanchas(canchasData);
          setReservas(reservasData);
          setTurnosFijos(turnosData);

          // Cargar reviews
          const reviewsSnap = await getDocs(
            collection(db, "clubs", id, "reviews"),
          );
          const reviewsData = reviewsSnap.docs.map((d) => ({
            id: d.id,
            ...d.data(),
          }));
          setReviews(reviewsData);

          // Verificar si puede hacer review
          if (user) {
            const yaHizo = reviewsData.some((r) => r.uid === user.uid);
            setYaHizoReview(yaHizo);

            // Verificar si tiene reservas en este club
            const allReservas = await getReservas(id);
            const tieneReserva = allReservas.some(
              (r) => r.jugadorUid === user.uid && r.status === "confirmada",
            );
            setPuedeReview(tieneReserva && !yaHizo);
          }
        }
      } catch (err) {
        console.error("Error:", err);
      }
      setLoading(false);
    };
    cargar();
  }, [id, fechaSeleccionada, user]);

  // Los torneos son de lectura pública: se cargan con o sin sesión, solo al abrir la pestaña
  const clubId = club?.id;
  useEffect(() => {
    if (tab !== "torneos" || !clubId || torneosClub !== null) return;
    const cargarTorneos = async () => {
      try {
        setTorneosClub(await getTorneosDeClub(clubId));
      } catch (err) {
        console.error("Error cargando los torneos del club:", err);
        setTorneosClub([]);
      }
    };
    cargarTorneos();
  }, [tab, clubId, torneosClub]);

  // La reserva viva de una celda (un slot de una hora; en una reserva de varias horas, cada hora tiene el suyo)
  const reservaEn = (canchaId, hora) =>
    reservas.find(
      (r) =>
        r.canchaId === canchaId && r.hora === hora && r.status !== "cancelada",
    );

  const esTurnoFijo = (canchaId, hora) => {
    const partes = fechaSeleccionada.split("-");
    const hoy = new Date(
      Number(partes[0]),
      Number(partes[1]) - 1,
      Number(partes[2]),
    );
    const diasMap = {
      0: "Domingo",
      1: "Lunes",
      2: "Martes",
      3: "Miércoles",
      4: "Jueves",
      5: "Viernes",
      6: "Sábado",
    };
    return turnosFijos.some(
      (t) =>
        t.canchaId === canchaId &&
        t.dia === diasMap[hoy.getDay()] &&
        (t.horas || [t.hora]).includes(hora) &&
        t.status === "activo",
    );
  };

  // Estado de una celda de la grilla: solo "libre" se puede reservar (misma condición que antes)
  const estadoDeCelda = (cancha, hora) => {
    const reserva = reservaEn(cancha.id, hora);
    if (reserva) return reserva.status === "pendiente" ? "pendiente" : "reservada";
    if (esTurnoFijo(cancha.id, hora)) return "fijo";
    if (!(cancha.horariosDisponibles || []).includes(hora)) return "bloqueada";
    return "libre";
  };

  // Por qué una hora extra de la reserva (la 2.ª o la 3.ª) no se puede sumar, o null si está libre. El orden es
  // el de estadoDeCelda: primero lo reservado (torneo o jugador), después el turno fijo, al final el horario.
  const motivoHoraExtra = (cancha, hora) => {
    if (hora >= "24:00") return "No se puede pasar de medianoche";
    const reserva = reservaEn(cancha.id, hora);
    if (esBloqueoTorneo(reserva)) {
      return reserva.torneoNombre ? `Lo bloquea el torneo ${reserva.torneoNombre}` : "Lo bloquea un torneo";
    }
    if (reserva) return `El turno de las ${hora} ya está reservado`;
    if (esTurnoFijo(cancha.id, hora)) return `Turno fijo a las ${hora}`;
    if (!(cancha.horariosDisponibles || []).includes(hora)) return `El club cierra a las ${hora}`;
    return null;
  };

  // Las duraciones que ofrece el diálogo (1 h … el máximo del club): una duración queda deshabilitada, con el
  // motivo de la primera hora extra que no entra; las más largas heredan ese mismo motivo.
  const duracionesPara = (cancha, hora) => {
    let motivo = null;
    return Array.from({ length: maxTurnosDelClub(club) }, (_, i) => {
      const n = i + 1;
      if (n > 1 && !motivo) motivo = motivoHoraExtra(cancha, sumarHoras(hora, n - 1));
      return { value: n, label: `${n} h`, motivo };
    });
  };

  // Lo que el diálogo abierto va a reservar: si la duración elegida dejó de entrar (se recargaron las reservas),
  // vuelve a 1 h sin cerrar el diálogo
  const duraciones = modalData ? duracionesPara(modalData.cancha, modalData.hora) : [];
  const turnosElegidos = duraciones.some((d) => d.value === turnos && !d.motivo) ? turnos : 1;
  const horasElegidas = modalData ? horasDeReserva(modalData.hora, turnosElegidos) : [];
  const horaFinElegida = modalData ? sumarHoras(modalData.hora, turnosElegidos) : "";
  const precioTotal = modalData
    ? precioDeReserva(modalData.cancha, fechaSeleccionada, modalData.hora, turnosElegidos)
    : 0;
  const señaReserva = calcularSeña(club, precioTotal);
  const ayudaDuracion = duraciones.find((d) => d.motivo)?.motivo || "";

  const abrirModal = async (cancha, hora) => {
    setTurnos(1);
    if (user) {
      const userData = await getUserData(user.uid);
      const registradoConGoogle = user.providerData?.some(p => p.providerId === "google.com");
      if (!registradoConGoogle && userData && (!userData.telefono || !userData.nivel || !userData.genero || !userData.nacimiento)) {
        const ir = await confirmar({
          titulo: "Completá tu perfil",
          mensaje: "Necesitás completar tu perfil para reservar. ¿Ir a completarlo ahora?",
          confirmText: "Ir a mi perfil",
          cancelText: "Ahora no",
        });
        if (ir) navigate("/perfil");
        return;
      }
      setModalData({ cancha, hora });
      setFormReserva({
        nombreJugador: userData?.nombre || user.displayName || "",
        email: userData?.email || user.email || "",
        telefono: userData?.telefono || "",
      });
      setMostrarModal(true);
    } else {
      setModalData({ cancha, hora });
      setFormReserva({
        nombreJugador: "",
        email: "",
        telefono: "",
      });
      setMostrarModal(true);
    }
  };

  const handleReservar = async (e) => {
    e.preventDefault();
    if (!modalData || !club) return;
    setGuardando(true);
    // Sin configuración explícita, el club acepta reserva directa (mismo default que las reglas de Firestore)
    const reservaDirecta = club.reservaDirecta ?? true;
    // Una sola reserva de N horas seguidas (N documentos en una transacción); el rango va en las notificaciones
    const rango = rangoHoras(modalData.hora, horaFinElegida);
    try {
      await crearReserva(club.id, {
        canchaId: modalData.cancha.id,
        canchaName: modalData.cancha.nombre,
        fecha: fechaSeleccionada,
        hora: modalData.hora,
        turnos: turnosElegidos,
        precios: preciosDeReserva(modalData.cancha, fechaSeleccionada, modalData.hora, turnosElegidos),
        seña: señaReserva,
        jugadorUid: user?.uid || null,
        nombreJugador: formReserva.nombreJugador,
        email: formReserva.email,
        telefono: formReserva.telefono,
        status: reservaDirecta ? "confirmada" : "pendiente",
      });
      logEvento("reserva_creada", {
        clubId: club.id,
        status: reservaDirecta ? "confirmada" : "pendiente",
        turnos: turnosElegidos,
      });
      const nuevasReservas = await getReservas(club.id, fechaSeleccionada);
      setReservas(nuevasReservas);
      if (club.ownerUid) {
        notificarNuevaReserva(club.ownerUid, formReserva.nombreJugador, modalData.cancha.nombre, fechaSeleccionada, rango);
      }
      setReservaExitosa({
        cancha: modalData.cancha.nombre,
        fecha: fechaSeleccionada,
        hora: rango,
        precio: precioTotal,
        seña: señaReserva,
        status: reservaDirecta ? "confirmada" : "pendiente",
        clubNombre: club.nombre,
      });
      setMostrarModal(false);
    } catch (err) {
      if (err?.code === "SLOT_TAKEN") {
        // Otro jugador ganó uno de los turnos mientras completábamos el formulario: el servicio dice cuál
        toast.error(err.hora ? err.message : "Ese turno acaba de ser reservado por otra persona");
        try {
          setReservas(await getReservas(club.id, fechaSeleccionada));
        } catch (e) {
          console.error("Error recargando reservas:", e);
        }
        // Si se perdió el primer turno no queda nada que reservar; si fue una hora extra, el diálogo sigue
        // abierto con esa duración deshabilitada para elegir una más corta
        if (!err.hora || err.hora === modalData.hora) setMostrarModal(false);
      } else {
        console.error("Error:", err);
        toast.error("No pudimos crear la reserva. Intentá de nuevo.");
      }
    }
    setGuardando(false);
  };

  const handleReview = async () => {
    if (!user || !club) return;
    setGuardandoReview(true);
    try {
      await addDoc(collection(db, "clubs", club.id, "reviews"), {
        uid: user.uid,
        nombre: user.displayName || user.email?.split("@")[0] || "Anónimo",
        estrellas: reviewForm.estrellas,
        comentario: reviewForm.comentario,
        fecha: getTodayLocal(),
      });
      const reviewsSnap = await getDocs(
        collection(db, "clubs", club.id, "reviews"),
      );
      setReviews(reviewsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setYaHizoReview(true);
      setPuedeReview(false);
      setMostrarFormReview(false);
      setReviewForm({ estrellas: 5, comentario: "" });
      toast.success("¡Gracias por tu review!");
    } catch (err) {
      console.error("Error:", err);
      toast.error("No pudimos guardar tu review. Intentá de nuevo.");
    }
    setGuardandoReview(false);
  };

  // Ventana de reserva: desde hoy hasta hoy + diasAnticipacion (7 por defecto)
  const fechaMin = getTodayLocal();
  const fechaMax = addDaysLocal(fechaMin, club?.diasAnticipacion ?? 7);
  const cambiarFecha = (valor) => {
    if (!valor) return;
    if (valor < fechaMin) return setFechaSeleccionada(fechaMin);
    if (valor > fechaMax) return setFechaSeleccionada(fechaMax);
    setFechaSeleccionada(valor);
  };
  const esHoy = fechaSeleccionada === fechaMin;
  const horaAhora = horaActualStr();

  const promedioEstrellas =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + (r.estrellas || 0), 0) / reviews.length
      : 0;

  if (loading) {
    return (
      <div aria-busy="true">
        <span className="sr-only">Cargando club…</span>
        <div className="pd-skeleton h-10 w-2/3 mb-2" />
        <div className="pd-skeleton h-[18px] w-1/2 mb-6" />
        <div className="flex gap-2 mb-4">
          <div className="pd-skeleton h-9 w-20 rounded-pill!" />
          <div className="pd-skeleton h-9 w-20 rounded-pill!" />
          <div className="pd-skeleton h-9 w-20 rounded-pill!" />
        </div>
        <div className="pd-skeleton h-72 rounded-lg!" />
      </div>
    );
  }

  if (!club) {
    return (
      <Card className="text-center py-10!">
        <div className="flex justify-center mb-3">
          <span className="pd-ball" aria-hidden="true" />
        </div>
        <p className="body-md text-ink-2">Club no encontrado</p>
      </Card>
    );
  }

  if (club.suspendido === true) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="display-lg m-0">{club.nombre || "Club"}</h1>
        <Alert tone="warning">
          <strong>Este club no está disponible por el momento.</strong> Mirá otros clubes en la lista de canchas.
        </Alert>
        <Button as="link" to="/clubes" className="self-start">
          Ver clubes
        </Button>
      </div>
    );
  }

  // Torneos que se ven en la pestaña: el club aceptó ser sede y el torneo está vigente (abierto, en curso o
  // que todavía no terminó). Tolera torneos sin club o sin fechas.
  const cargandoTorneos = tab === "torneos" && torneosClub === null;
  const torneosVisibles = (torneosClub || []).filter(
    (t) =>
      t?.club?.estado === "aceptado" &&
      t.status !== "cancelado" &&
      (esTorneoActivo(t) || (typeof t.fechaFin === "string" && t.fechaFin >= fechaMin)),
  );

  const tabs = [
    { value: "canchas", label: "Canchas" },
    { value: "torneos", label: "Torneos", count: torneosClub ? torneosVisibles.length : 0 },
    { value: "info", label: "Info" },
    { value: "reviews", label: "Reviews", count: reviews.length },
  ];

  // Un día por pastilla, desde hoy hasta el máximo de anticipación del club
  const dias = [];
  for (let f = fechaMin, i = 0; f <= fechaMax; f = addDaysLocal(f, 1), i += 1) {
    dias.push({ value: f, label: etiquetaDia(f, i) });
  }

  // Filas de la grilla: hoy, una hora que ya empezó no se muestra. El resto se muestra cuando alguna cancha tiene
  // algo en esa hora: abre (libre o reservada) o tiene una reserva, un bloqueo de torneo o un turno fijo. Una hora
  // en la que ninguna cancha abre ni tiene nada (la madrugada, por ejemplo) se omite.
  const horasVisibles = horasDelDia.filter((hora) => {
    if (esHoy && hora <= horaAhora) return false;
    return canchas.some(
      (c) => (c.horariosDisponibles || []).includes(hora) || !!reservaEn(c.id, hora) || esTurnoFijo(c.id, hora),
    );
  });

  const reservaConfirmada = reservaExitosa?.status === "confirmada";

  return (
    <div>
      {/* Header */}
      <div className="flex items-start gap-1 mb-4">
        <Button
          variant="ghost"
          iconOnly
          aria-label="Volver a clubes"
          icon={<ChevronLeft className="pd-icon" size={20} aria-hidden="true" />}
          onClick={() => navigate("/clubes")}
          className="-ml-3 shrink-0"
        />
        <div className="min-w-0 flex-1">
          <h1 className="display-lg text-ink break-words">{club.nombre}</h1>
          {(club.direccion || club.ciudad) && (
            <p className="body-sm text-ink-2 flex items-center gap-1.5 mt-1">
              <MapPin className="pd-icon text-ink-3" size={20} aria-hidden="true" />
              <span>
                {club.direccion && `${club.direccion} · `}
                {club.ciudad}
              </span>
            </p>
          )}

          {/* Rating */}
          {reviews.length > 0 && (
            <div className="flex items-center gap-2 mt-2">
              <StarDisplay value={promedioEstrellas} size={16} />
              <span className="numeral-md pd-tnum text-ink">{promedioEstrellas.toFixed(1)}</span>
              <span className="body-sm text-ink-3">
                {reviews.length} review{reviews.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs items={tabs} value={tab} onChange={setTab} ariaLabel="Secciones del club" className="mb-4" />

      {/* Tab: Canchas sin sesión: la grilla y las reservas no son públicas */}
      {tab === "canchas" && !user && (
        <div className="flex flex-col gap-6">
          <Card className="text-center">
            <Lock className="pd-icon-lg mx-auto mb-3 text-ink-3" size={24} aria-hidden="true" />
            <h2 className="heading-md">Iniciá sesión para ver disponibilidad y reservar</h2>
            <p className="body-sm text-ink-2 mt-1 mb-5">
              La grilla de horarios y las reservas están disponibles con tu cuenta de Padely.
            </p>
            <div className="pd-btn-group justify-center">
              <Button as="link" to={`/login?next=${encodeURIComponent(`/club/${id}`)}`} variant="primary">
                Iniciar sesión
              </Button>
              <Button as="link" to="/register">
                Crear cuenta
              </Button>
            </div>
          </Card>
          <section>
            <h2 className="heading-lg mb-4">
              Canchas <span className="body-md font-medium! text-ink-3">{canchas.length}</span>
            </h2>
            <ListaCanchas canchas={canchas} />
          </section>
        </div>
      )}

      {/* Tab: Canchas */}
      {tab === "canchas" && user && (
        <>
          <Pills
            items={dias}
            value={fechaSeleccionada}
            onChange={cambiarFecha}
            ariaLabel="Día"
            className="flex-nowrap! overflow-x-auto pb-1 mb-4 -mx-4 px-4 sm:mx-0 sm:px-0"
          />

          <Card className="p-0! overflow-hidden">
            {canchas.length === 0 ? (
              <div className="p-5 text-center">
                <div className="flex justify-center mb-3">
                  <span className="pd-ball" aria-hidden="true" />
                </div>
                <p className="body-md text-ink-2">Este club todavía no cargó sus canchas.</p>
              </div>
            ) : horasVisibles.length === 0 ? (
              <div className="p-5 text-center">
                <div className="flex justify-center mb-3">
                  <span className="pd-ball" aria-hidden="true" />
                </div>
                <p className="body-md text-ink-2">No quedan turnos libres para este día. Probá con otro día.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <div
                  className="pd-grid"
                  style={{
                    gridTemplateColumns: `56px repeat(${canchas.length}, minmax(112px, 1fr))`,
                    minWidth: `${80 + canchas.length * 120}px`,
                  }}
                  role="group"
                  aria-label={`Turnos del ${fechaCorta(fechaSeleccionada)}`}
                >
                  {/* La columna de horas queda fija cuando la grilla se desplaza a lo ancho */}
                  <div className="sticky left-0 z-[1] bg-surface-sunken -ml-3 pl-3 -mr-2 pr-2" aria-hidden="true" />
                  {canchas.map((cancha) => (
                    <div key={cancha.id} className="pd-grid-head">
                      {cancha.nombre}
                      <span className="block normal-case tracking-normal body-sm font-medium! text-ink-3">
                        {[cancha.superficie, cancha.techada ? "Techada" : "Aire libre"].filter(Boolean).join(" · ")}
                      </span>
                    </div>
                  ))}
                  {horasVisibles.map((hora) => (
                    <Fragment key={hora}>
                      <div className="pd-grid-time sticky left-0 z-[1] bg-surface-sunken self-stretch! flex items-center -ml-3 pl-3 -mr-2 pr-2">
                        {hora}
                      </div>
                      {canchas.map((cancha) => {
                        const estado = estadoDeCelda(cancha, hora);
                        const reserva = reservaEn(cancha.id, hora);
                        // Turno de un partido de torneo: se ve reservado con el nombre del torneo y nunca abre el diálogo
                        if (esBloqueoTorneo(reserva)) {
                          return (
                            <SlotCell
                              key={cancha.id}
                              estado="reservada"
                              linea1="Torneo"
                              linea2={reserva.torneoNombre || undefined}
                            />
                          );
                        }
                        if (estado !== "libre") {
                          return (
                            <SlotCell
                              key={cancha.id}
                              estado={estado}
                              linea1={estado === "bloqueada" ? "No disponible" : undefined}
                            />
                          );
                        }
                        const precio = precioDeSlot(cancha, fechaSeleccionada, hora);
                        // Con el diálogo abierto, las N horas de la reserva se ven elegidas (todas libres)
                        const elegido =
                          mostrarModal && modalData?.cancha?.id === cancha.id && horasElegidas.includes(hora);
                        return (
                          <SlotCell
                            key={cancha.id}
                            estado={elegido ? "elegido" : "libre"}
                            linea2={formatPrecio(precio)}
                            onClick={() => abrirModal(cancha, hora)}
                            aria-label={`${cancha.nombre}, ${hora}, ${formatPrecio(precio)}, ${elegido ? "elegido" : "libre"}`}
                          />
                        );
                      })}
                    </Fragment>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </>
      )}

      {/* Tab: Torneos que se juegan en el club */}
      {tab === "torneos" && (
        <div className="flex flex-col gap-4">
          {cargandoTorneos && (
            <div className="flex flex-col gap-4" aria-busy="true">
              <span className="sr-only">Cargando torneos…</span>
              {[0, 1].map((i) => (
                <div key={i} className="pd-skeleton h-36 rounded-lg!" />
              ))}
            </div>
          )}

          {!cargandoTorneos && torneosVisibles.length === 0 && (
            <Card className="text-center py-10!">
              <div className="flex justify-center mb-3">
                <span className="pd-ball" aria-hidden="true" />
              </div>
              <p className="body-md text-ink-2">Este club todavía no tiene torneos</p>
            </Card>
          )}

          {!cargandoTorneos && torneosVisibles.length > 0 && (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
              {torneosVisibles.map((t) => {
                const activo = esTorneoActivo(t);
                const categorias = listaCategorias(t);
                const canchasTorneo = canchasDelTorneo(t);
                return (
                  <Card
                    key={t.id}
                    as={Link}
                    to={`/torneos/${t.id}`}
                    variant={activo ? "torneo" : "default"}
                    hover
                    className={enlaceCard}
                  >
                    <Card.Row>
                      <Card.Eyebrow>
                        {formatFecha(t.fechaInicio)}
                        {t.fechaFin && ` – ${formatFecha(t.fechaFin)}`}
                      </Card.Eyebrow>
                      <Badge tone={torneoEstadoTone[t.status] || "neutral"}>
                        {torneoEstadoLabel[t.status] || t.status || "Torneo"}
                      </Badge>
                    </Card.Row>
                    <Card.Title as="h2" className="mt-2!">
                      {t.nombre || "Torneo"}
                    </Card.Title>
                    {(categorias.length > 0 || canchasTorneo.length > 0) && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {categorias.map((c) => (
                          <Badge key={c.id}>
                            <MarcaCategoria cat={c.nivel} size={20} />
                            {c.label}
                          </Badge>
                        ))}
                        {canchasTorneo.map((c) => (
                          <Badge key={c.id}>{c.nombre}</Badge>
                        ))}
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab: Info */}
      {tab === "info" && (
        <div className="flex flex-col gap-4">
          {/* Datos generales */}
          <Card>
            <Card.Title as="h2">Información</Card.Title>
            <div className="flex flex-col gap-3 mt-3">
              {club.bio && <p className="body-md text-ink-2">{club.bio}</p>}
              <ul className="flex flex-col gap-2">
                {club.direccion && (
                  <li className="flex items-center gap-2 body-sm text-ink-2">
                    <MapPin className="pd-icon text-ink-3" size={20} aria-hidden="true" />
                    <span>{[club.direccion, ubicacionCorta(club)].filter(Boolean).join(", ")}</span>
                  </li>
                )}
                {club.telefono && (
                  <li className="flex items-center gap-2 body-sm text-ink-2">
                    <Phone className="pd-icon text-ink-3" size={20} aria-hidden="true" />
                    <span>{club.telefono}</span>
                  </li>
                )}
                {club.email && (
                  <li className="flex items-center gap-2 body-sm text-ink-2">
                    <Mail className="pd-icon text-ink-3" size={20} aria-hidden="true" />
                    <span>{club.email}</span>
                  </li>
                )}
              </ul>
            </div>
          </Card>

          {/* Horarios */}
          {(club.horarioApertura || club.horarioCierre) && (
            <Card>
              <Card.Title as="h2">Horario de atención</Card.Title>
              <p className="flex items-center gap-2 body-sm text-ink-2 mt-3">
                <Clock className="pd-icon text-ink-3" size={20} aria-hidden="true" />
                <span>
                  {club.horarioApertura || "08:00"} – {club.horarioCierre || "23:00"}
                </span>
              </p>
              {club.diasAbiertos && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  {club.diasAbiertos.map((d) => (
                    <Badge key={d}>{d.slice(0, 3)}</Badge>
                  ))}
                </div>
              )}
            </Card>
          )}

          {/* Redes sociales */}
          {(club.instagram ||
            club.facebook ||
            club.whatsapp ||
            club.website) && (
            <Card>
              <Card.Title as="h2">Redes y contacto</Card.Title>
              <ul className="flex flex-col gap-2 mt-3">
                {club.instagram && (
                  <li>
                    <a
                      href={`https://instagram.com/${club.instagram.replace("@", "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 body-sm text-court hover:underline"
                    >
                      <AtSign className="pd-icon" size={20} aria-hidden="true" />
                      <span className="font-semibold">Instagram</span>
                      <span className="text-ink-2">@{club.instagram.replace("@", "")}</span>
                    </a>
                  </li>
                )}
                {club.facebook && (
                  <li>
                    <a
                      href={
                        club.facebook.startsWith("http")
                          ? club.facebook
                          : `https://facebook.com/${club.facebook}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 body-sm text-court hover:underline"
                    >
                      <ExternalLink className="pd-icon" size={20} aria-hidden="true" />
                      <span className="font-semibold">Facebook</span>
                      <span className="text-ink-2">{club.facebook}</span>
                    </a>
                  </li>
                )}
                {club.whatsapp && (
                  <li>
                    <a
                      href={`https://wa.me/${club.whatsapp.replace(/[^0-9]/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 body-sm text-court hover:underline"
                    >
                      <MessageCircle className="pd-icon" size={20} aria-hidden="true" />
                      <span className="font-semibold">WhatsApp</span>
                      <span className="text-ink-2">{club.whatsapp}</span>
                    </a>
                  </li>
                )}
                {club.website && (
                  <li>
                    <a
                      href={
                        club.website.startsWith("http")
                          ? club.website
                          : `https://${club.website}`
                      }
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 body-sm text-court hover:underline"
                    >
                      <Globe className="pd-icon" size={20} aria-hidden="true" />
                      <span className="font-semibold">Web</span>
                      <span className="text-ink-2">{club.website}</span>
                    </a>
                  </li>
                )}
              </ul>
            </Card>
          )}

          {/* Canchas del club */}
          <section>
            <h2 className="heading-lg mb-4">
              Canchas <span className="body-md font-medium! text-ink-3">{canchas.length}</span>
            </h2>
            <ListaCanchas canchas={canchas} />
          </section>

          {/* Galería placeholder */}
          <Card className="text-center">
            <Camera className="pd-icon-lg mx-auto mb-2 text-ink-3" size={24} aria-hidden="true" />
            <p className="body-sm text-ink-2">Galería de fotos próximamente</p>
          </Card>
        </div>
      )}

      {/* Tab: Reviews */}
      {tab === "reviews" && (
        <div className="flex flex-col gap-4">
          {/* Resumen */}
          <Card className="text-center">
            {reviews.length > 0 ? (
              <>
                <p className="numeral-lg pd-tnum text-ink">{promedioEstrellas.toFixed(1)}</p>
                <div className="flex justify-center mt-1">
                  <StarDisplay value={promedioEstrellas} size={20} />
                </div>
                <p className="body-sm text-ink-3 mt-1">
                  {reviews.length} review{reviews.length !== 1 ? "s" : ""}
                </p>
              </>
            ) : (
              <>
                <div className="flex justify-center mb-3">
                  <span className="pd-ball" aria-hidden="true" />
                </div>
                <p className="body-md text-ink-2">Este club aún no tiene reviews</p>
              </>
            )}
          </Card>

          {/* Botón dejar review */}
          {puedeReview && !mostrarFormReview && (
            <Button variant="primary" block onClick={() => setMostrarFormReview(true)}>
              Dejar una review
            </Button>
          )}

          {yaHizoReview && (
            <p className="body-sm text-ink-3 text-center">Ya dejaste tu review en este club</p>
          )}

          {!puedeReview && !yaHizoReview && user && (
            <p className="body-sm text-ink-3 text-center">
              Necesitás haber reservado en este club para dejar una review
            </p>
          )}

          {/* Formulario de review */}
          {mostrarFormReview && (
            <Card>
              <Card.Title>Tu review</Card.Title>
              <div className="flex flex-col gap-4 mt-3">
                <Field label="Puntuación" as="div">
                  <StarRating
                    value={reviewForm.estrellas}
                    onChange={(v) =>
                      setReviewForm({ ...reviewForm, estrellas: v })
                    }
                  />
                </Field>
                <Field label="Comentario (opcional)">
                  <Textarea
                    value={reviewForm.comentario}
                    onChange={(e) =>
                      setReviewForm({
                        ...reviewForm,
                        comentario: e.target.value,
                      })
                    }
                    placeholder="Contá tu experiencia…"
                    rows={3}
                  />
                </Field>
                <div className="pd-btn-group justify-end">
                  <Button variant="ghost" onClick={() => setMostrarFormReview(false)}>
                    Cancelar
                  </Button>
                  <Button
                    variant="primary"
                    onClick={handleReview}
                    cargando={guardandoReview ? "Enviando…" : ""}
                  >
                    Enviar review
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Lista de reviews */}
          {reviews.length > 0 && (
            <div className="flex flex-col gap-4">
              {reviews
                .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""))
                .map((r) => (
                  <Card key={r.id}>
                    <Card.Row>
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-8 h-8 rounded-pill bg-surface-sunken text-ink font-display font-bold text-[15px] grid place-items-center shrink-0"
                          aria-hidden="true"
                        >
                          {(r.nombre || "A").charAt(0).toUpperCase()}
                        </span>
                        <div className="min-w-0">
                          <p className="heading-sm text-ink truncate">{r.nombre}</p>
                          <p className="body-sm text-ink-3">{formatFecha(r.fecha)}</p>
                        </div>
                      </div>
                      <StarDisplay value={r.estrellas} size={16} />
                    </Card.Row>
                    {r.comentario && <p className="body-md text-ink-2 mt-3">{r.comentario}</p>}
                  </Card>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Modal de reserva */}
      {mostrarModal && modalData && (
        <div className="pd-backdrop z-50">
          <div
            className="pd-dialog max-h-[calc(100dvh-32px)] overflow-y-auto"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reserva-titulo"
            aria-describedby="reserva-cuerpo"
          >
            <h2 className="pd-dialog-title" id="reserva-titulo">
              ¿Confirmar la reserva?
            </h2>
            <p className="pd-dialog-body" id="reserva-cuerpo">
              {club.nombre} · {modalData.cancha.nombre} · {fechaCorta(fechaSeleccionada)} ·{" "}
              <span className="pd-tnum">{rangoHoras(modalData.hora, horaFinElegida)}</span>
            </p>
            {/* Duración: pastillas a mano porque Pills no deshabilita por ítem; el motivo va en title y en la ayuda */}
            {duraciones.length > 1 && (
              <Field as="div" label="Duración" help={ayudaDuracion} className="mt-4">
                <div className="pd-pills" role="tablist" aria-label="Duración de la reserva">
                  {duraciones.map((d) => (
                    <button
                      key={d.value}
                      type="button"
                      role="tab"
                      className="pd-pill disabled:opacity-50 disabled:cursor-not-allowed! disabled:hover:bg-surface-raised! disabled:hover:text-ink-2!"
                      aria-selected={d.value === turnosElegidos}
                      disabled={!!d.motivo}
                      title={d.motivo || undefined}
                      onClick={() => setTurnos(d.value)}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </Field>
            )}
            <div className="mt-4 rounded-md bg-surface-sunken px-4 py-3" aria-live="polite">
              <div className="flex items-end justify-between gap-3">
                <span className="body-sm text-ink-2">Precio</span>
                <span className="numeral-lg pd-tnum text-ink">{formatPrecio(precioTotal)}</span>
              </div>
              {señaReserva > 0 && (
                <p className="body-sm text-ink-2 mt-1">
                  Seña {formatPrecio(señaReserva)} · el resto lo pagás en el club
                </p>
              )}
            </div>
            <form onSubmit={handleReservar} className="flex flex-col gap-4 mt-4">
              <Field label="Nombre completo *">
                <Input
                  type="text"
                  required
                  autoComplete="name"
                  value={formReserva.nombreJugador}
                  onChange={(e) =>
                    setFormReserva({
                      ...formReserva,
                      nombreJugador: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  autoComplete="email"
                  inputMode="email"
                  value={formReserva.email}
                  onChange={(e) =>
                    setFormReserva({ ...formReserva, email: e.target.value })
                  }
                />
              </Field>
              <Field label="Teléfono">
                <Input
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  value={formReserva.telefono}
                  onChange={(e) =>
                    setFormReserva({ ...formReserva, telefono: e.target.value })
                  }
                />
              </Field>
              <div className="pd-dialog-actions">
                <Button onClick={() => setMostrarModal(false)}>Volver</Button>
                <Button type="submit" variant="primary" cargando={guardando ? "Reservando…" : ""}>
                  Confirmar reserva
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmación de reserva */}
      {reservaExitosa && (
        <div className="pd-backdrop z-50">
          <div
            className="pd-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="exito-titulo"
            aria-describedby="exito-cuerpo"
          >
            {reservaConfirmada ? (
              <Check className="pd-icon-lg text-success mb-3" size={24} aria-hidden="true" />
            ) : (
              <AlertTriangle className="pd-icon-lg text-warning mb-3" size={24} aria-hidden="true" />
            )}
            <h2 className="pd-dialog-title" id="exito-titulo">
              {reservaConfirmada ? "Reserva confirmada" : "Reserva pendiente"}
            </h2>
            <p className="pd-dialog-body" id="exito-cuerpo">
              {reservaConfirmada
                ? "Tu cancha está reservada. Nos vemos en la cancha."
                : "Tu reserva fue enviada y está pendiente de aprobación por el club."}
            </p>

            <dl className="flex flex-col gap-2 mt-4 rounded-md bg-surface-sunken px-4 py-3">
              <div className="flex justify-between gap-3">
                <dt className="body-sm text-ink-3">Club</dt>
                <dd className="body-sm font-semibold! text-ink text-right">{reservaExitosa.clubNombre}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="body-sm text-ink-3">Cancha</dt>
                <dd className="body-sm font-semibold! text-ink text-right">{reservaExitosa.cancha}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="body-sm text-ink-3">Fecha</dt>
                <dd className="body-sm font-semibold! text-ink text-right">{fechaCorta(reservaExitosa.fecha)}</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="body-sm text-ink-3">Hora</dt>
                <dd className="body-sm font-semibold! text-ink text-right pd-tnum">{reservaExitosa.hora}</dd>
              </div>
              <div className="flex items-end justify-between gap-3">
                <dt className="body-sm text-ink-3">Precio</dt>
                <dd className="numeral-lg pd-tnum text-ink">{formatPrecio(reservaExitosa.precio)}</dd>
              </div>
            </dl>
            {reservaExitosa.seña > 0 && (
              <p className="body-sm text-ink-2 mt-2">
                Seña {formatPrecio(reservaExitosa.seña)} · el resto lo pagás en el club
              </p>
            )}

            <div className="pd-dialog-actions">
              <Button onClick={() => { setReservaExitosa(null); navigate("/mis-reservas"); }}>
                Ver mis reservas
              </Button>
              <Button variant="primary" onClick={() => setReservaExitosa(null)}>
                Entendido
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
