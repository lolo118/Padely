import { useEffect, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import {
  getCanchas,
  getReservas,
  getTurnosFijos,
  crearReserva,
} from "../services/canchaService";
import {
  doc,
  getDoc,
  collection,
  getDocs,
  addDoc,
  query,
  where,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { getUserData } from "../services/authService";

const horasDelDia = Array.from(
  { length: 24 },
  (_, i) => `${i.toString().padStart(2, "0")}:00`,
);

function StarRating({ value, onChange, size = "w-6 h-6" }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onChange?.(star)}
          className="transition hover:scale-110"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill={star <= value ? "#f59e0b" : "none"}
            stroke={star <= value ? "#f59e0b" : "currentColor"}
            strokeWidth="1.5"
            className={`${size} ${!onChange ? "" : "cursor-pointer"}`}
            style={{ color: "var(--text-muted)" }}
          >
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
      ))}
    </div>
  );
}

function StarDisplay({ value, size = "w-4 h-4" }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((star) => (
        <svg
          key={star}
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill={star <= Math.round(value) ? "#f59e0b" : "none"}
          stroke={star <= Math.round(value) ? "#f59e0b" : "currentColor"}
          strokeWidth="1.5"
          className={size}
          style={{ color: "var(--text-muted)" }}
        >
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
        </svg>
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
  const [fechaSeleccionada, setFechaSeleccionada] = useState(
    location.state?.fecha || new Date().toISOString().split("T")[0],
  );
  const [mostrarModal, setMostrarModal] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [reservaExitosa, setReservaExitosa] = useState(null);
  const [formReserva, setFormReserva] = useState({
    nombreJugador: "",
    email: "",
    telefono: "",
  });
  const [guardando, setGuardando] = useState(false);
  const [tab, setTab] = useState("canchas");

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
          setClub({ id: snap.id, ...snap.data() });
          const [canchasData, reservasData, turnosData] = await Promise.all([
            getCanchas(id),
            getReservas(id, fechaSeleccionada),
            getTurnosFijos(id),
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

  const estaOcupado = (canchaId, hora) => {
    return reservas.some(
      (r) =>
        r.canchaId === canchaId && r.hora === hora && r.status !== "cancelada",
    );
  };

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

  const abrirModal = async (cancha, hora, precio) => {
    if (user) {
      const userData = await getUserData(user.uid);
      const registradoConGoogle = user.providerData?.some(p => p.providerId === "google.com");
      if (!registradoConGoogle && userData && (!userData.telefono || !userData.nivel || !userData.genero || !userData.nacimiento)) {
        if (window.confirm("Necesitás completar tu perfil para reservar. ¿Ir a completarlo ahora?")) {
          navigate("/perfil");
        }
        return;
      }
    }
    setModalData({ cancha, hora, precio });
    setFormReserva({
      nombreJugador: user?.displayName || "",
      email: user?.email || "",
      telefono: "",
    });
    setMostrarModal(true);
  };

  const handleReservar = async (e) => {
    e.preventDefault();
    if (!modalData || !club) return;
    setGuardando(true);
    try {
      await crearReserva(club.id, {
        canchaId: modalData.cancha.id,
        canchaName: modalData.cancha.nombre,
        fecha: fechaSeleccionada,
        hora: modalData.hora,
        precio: modalData.precio,
        jugadorUid: user?.uid || null,
        nombreJugador: formReserva.nombreJugador,
        email: formReserva.email,
        telefono: formReserva.telefono,
        status: club.reservaDirecta ? "confirmada" : "pendiente",
      });
      const nuevasReservas = await getReservas(club.id, fechaSeleccionada);
      setReservas(nuevasReservas);
      setReservaExitosa({
        cancha: modalData.cancha.nombre,
        fecha: fechaSeleccionada,
        hora: modalData.hora,
        precio: modalData.precio,
        status: club.reservaDirecta ? "confirmada" : "pendiente",
        clubNombre: club.nombre,
      });
      setMostrarModal(false);
    } catch (err) {
      console.error("Error:", err);
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
        fecha: new Date().toISOString().split("T")[0],
      });
      const reviewsSnap = await getDocs(
        collection(db, "clubs", club.id, "reviews"),
      );
      setReviews(reviewsSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setYaHizoReview(true);
      setPuedeReview(false);
      setMostrarFormReview(false);
      setReviewForm({ estrellas: 5, comentario: "" });
    } catch (err) {
      console.error("Error:", err);
    }
    setGuardandoReview(false);
  };

  const promedioEstrellas =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + (r.estrellas || 0), 0) / reviews.length
      : 0;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p style={{ color: "var(--text-muted)" }} className="text-sm">
          Cargando club...
        </p>
      </div>
    );
  }

  if (!club) {
    return (
      <div className="themed-card text-center py-16 rounded-2xl border">
        <p style={{ color: "var(--text-muted)" }}>Club no encontrado</p>
      </div>
    );
  }

  const tabs = [
    { key: "canchas", label: "Canchas" },
    { key: "info", label: "Info" },
    { key: "reviews", label: `Reviews (${reviews.length})` },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <button
          onClick={() => navigate("/hub")}
          className="p-1 rounded-lg transition"
          style={{ color: "var(--text-muted)" }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="w-5 h-5"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        <div className="flex-1">
          <h1
            className="text-xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            {club.nombre}
          </h1>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            {club.direccion && `${club.direccion} · `}
            {club.ciudad}
          </p>
        </div>
      </div>

      {/* Rating */}
      {reviews.length > 0 && (
        <div className="flex items-center gap-2 mb-4 ml-8">
          <StarDisplay value={promedioEstrellas} />
          <span
            className="text-sm font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            {promedioEstrellas.toFixed(1)}
          </span>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            ({reviews.length} review{reviews.length !== 1 ? "s" : ""})
          </span>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition whitespace-nowrap ${
              tab === t.key ? "text-white" : ""
            }`}
            style={{
              backgroundColor:
                tab === t.key ? "var(--accent)" : "var(--bg-card)",
              color: tab === t.key ? "white" : "var(--text-secondary)",
              border: tab === t.key ? "none" : "1px solid var(--border-card)",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Canchas */}
      {tab === "canchas" && (
        <>
          <div className="themed-card rounded-xl border px-3 py-2 flex items-center gap-2 mb-4 w-fit">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="w-4 h-4"
              style={{ color: "var(--accent)" }}
            >
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <input
              type="date"
              value={fechaSeleccionada}
              onChange={(e) => setFechaSeleccionada(e.target.value)}
              className="text-sm bg-transparent focus:outline-none"
              style={{ color: "var(--text-primary)" }}
            />
          </div>

          <div className="themed-card rounded-2xl border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border-card)" }}>
                    <th
                      className="sticky left-0 z-10 text-left py-3 px-4 font-semibold text-xs"
                      style={{
                        backgroundColor: "var(--bg-card)",
                        color: "var(--text-muted)",
                      }}
                    >
                      Hora
                    </th>
                    {canchas.map((cancha) => (
                      <th
                        key={cancha.id}
                        className="text-center py-3 px-3 min-w-[110px]"
                        style={{ backgroundColor: "var(--bg-card)" }}
                      >
                        <div
                          className="font-semibold text-xs"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {cancha.nombre}
                        </div>
                        <div
                          className="text-[10px] font-normal mt-0.5"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {cancha.superficie} ·{" "}
                          {cancha.techada ? "Techada" : "Aire libre"}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {horasDelDia.map((hora) => {
                    const algunaLibre = canchas.some((c) => {
                      const disp = (c.horariosDisponibles || []).includes(hora);
                      return (
                        disp &&
                        !estaOcupado(c.id, hora) &&
                        !esTurnoFijo(c.id, hora)
                      );
                    });
                    if (!algunaLibre) return null;
                    return (
                      <tr
                        key={hora}
                        style={{ borderBottom: "1px solid var(--border-card)" }}
                      >
                        <td
                          className="sticky left-0 z-10 py-3 px-4 font-medium text-xs"
                          style={{
                            backgroundColor: "var(--bg-card)",
                            color: "var(--text-muted)",
                            borderRight: "1px solid var(--border-card)",
                          }}
                        >
                          {hora}
                        </td>
                        {canchas.map((cancha) => {
                          const disponible = (
                            cancha.horariosDisponibles || []
                          ).includes(hora);
                          if (
                            !disponible ||
                            estaOcupado(cancha.id, hora) ||
                            esTurnoFijo(cancha.id, hora)
                          ) {
                            return (
                              <td
                                key={cancha.id}
                                className="text-center py-2 px-2"
                              >
                                <span
                                  className="text-xs"
                                  style={{
                                    color: "var(--text-muted)",
                                    opacity: 0.3,
                                  }}
                                >
                                  —
                                </span>
                              </td>
                            );
                          }
                          const precio =
                            (cancha.horarios || {})[hora] ??
                            cancha.precioBase ??
                            0;
                          return (
                            <td
                              key={cancha.id}
                              className="text-center py-2 px-2"
                            >
                              <button
                                onClick={() => abrirModal(cancha, hora, precio)}
                                className="w-full rounded-xl py-2.5 px-2 text-xs font-semibold transition-all duration-200 hover:scale-105"
                                style={{
                                  backgroundColor: "var(--accent-light)",
                                  color: "var(--accent)",
                                }}
                              >
                                Libre
                                <span className="block font-bold mt-0.5">
                                  ${precio}
                                </span>
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Tab: Info */}
      {tab === "info" && (
        <div className="flex flex-col gap-4">
          {/* Datos generales */}
          <div className="themed-card rounded-2xl border p-5">
            <h2
              className="font-semibold mb-3"
              style={{ color: "var(--text-primary)" }}
            >
              Información
            </h2>
            <div className="flex flex-col gap-3">
              {club.bio && (
                <p
                  className="text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {club.bio}
                </p>
              )}
              <div className="flex flex-col gap-2">
                {club.direccion && (
                  <div className="flex items-center gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="w-4 h-4 shrink-0"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                    <span
                      className="text-sm"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {club.direccion}, {club.ciudad}, {club.provincia}
                    </span>
                  </div>
                )}
                {club.telefono && (
                  <div className="flex items-center gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="w-4 h-4 shrink-0"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
                    </svg>
                    <span
                      className="text-sm"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {club.telefono}
                    </span>
                  </div>
                )}
                {club.email && (
                  <div className="flex items-center gap-2">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      className="w-4 h-4 shrink-0"
                      style={{ color: "var(--text-muted)" }}
                    >
                      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                      <polyline points="22,6 12,13 2,6" />
                    </svg>
                    <span
                      className="text-sm"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {club.email}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Horarios */}
          {(club.horarioApertura || club.horarioCierre) && (
            <div className="themed-card rounded-2xl border p-5">
              <h2
                className="font-semibold mb-3"
                style={{ color: "var(--text-primary)" }}
              >
                Horario de atención
              </h2>
              <div className="flex items-center gap-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="w-4 h-4"
                  style={{ color: "var(--text-muted)" }}
                >
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span
                  className="text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {club.horarioApertura || "08:00"} a{" "}
                  {club.horarioCierre || "23:00"}
                </span>
              </div>
              {club.diasAbiertos && (
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {club.diasAbiertos.map((d) => (
                    <span
                      key={d}
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor: "var(--accent-light)",
                        color: "var(--accent)",
                      }}
                    >
                      {d.slice(0, 3)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Redes sociales */}
          {(club.instagram ||
            club.facebook ||
            club.whatsapp ||
            club.website) && (
            <div className="themed-card rounded-2xl border p-5">
              <h2
                className="font-semibold mb-3"
                style={{ color: "var(--text-primary)" }}
              >
                Redes y contacto
              </h2>
              <div className="flex flex-col gap-2">
                {club.instagram && (
                  <a
                    href={`https://instagram.com/${club.instagram.replace("@", "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-sm transition hover:opacity-80"
                    style={{ color: "#e4405f" }}
                  >
                    <span className="font-semibold">Instagram</span>
                    <span style={{ color: "var(--text-secondary)" }}>
                      @{club.instagram.replace("@", "")}
                    </span>
                  </a>
                )}
                {club.facebook && (
                  <a
                    href={
                      club.facebook.startsWith("http")
                        ? club.facebook
                        : `https://facebook.com/${club.facebook}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-sm transition hover:opacity-80"
                    style={{ color: "#1877f2" }}
                  >
                    <span className="font-semibold">Facebook</span>
                    <span style={{ color: "var(--text-secondary)" }}>
                      {club.facebook}
                    </span>
                  </a>
                )}
                {club.whatsapp && (
                  <a
                    href={`https://wa.me/${club.whatsapp.replace(/[^0-9]/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-sm transition hover:opacity-80"
                    style={{ color: "#25d366" }}
                  >
                    <span className="font-semibold">WhatsApp</span>
                    <span style={{ color: "var(--text-secondary)" }}>
                      {club.whatsapp}
                    </span>
                  </a>
                )}
                {club.website && (
                  <a
                    href={
                      club.website.startsWith("http")
                        ? club.website
                        : `https://${club.website}`
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-2 text-sm transition hover:opacity-80"
                    style={{ color: "var(--accent)" }}
                  >
                    <span className="font-semibold">Web</span>
                    <span style={{ color: "var(--text-secondary)" }}>
                      {club.website}
                    </span>
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Canchas del club */}
          <div className="themed-card rounded-2xl border p-5">
            <h2
              className="font-semibold mb-3"
              style={{ color: "var(--text-primary)" }}
            >
              Canchas ({canchas.length})
            </h2>
            <div className="flex flex-col gap-2">
              {canchas.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-xl px-4 py-3"
                  style={{ backgroundColor: "var(--bg-card-hover)" }}
                >
                  <div>
                    <p
                      className="text-sm font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {c.nombre}
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {c.superficie} · {c.techada ? "Techada" : "Aire libre"}
                    </p>
                  </div>
                  <span
                    className="text-xs font-semibold"
                    style={{ color: "var(--accent)" }}
                  >
                    Desde ${c.precioBase || 0}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Galería placeholder */}
          <div className="themed-card rounded-2xl border p-5 text-center">
            <div className="text-3xl mb-2">📸</div>
            <p
              className="text-sm font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              Galería de fotos próximamente
            </p>
          </div>
        </div>
      )}

      {/* Tab: Reviews */}
      {tab === "reviews" && (
        <div className="flex flex-col gap-4">
          {/* Resumen */}
          <div className="themed-card rounded-2xl border p-5 text-center">
            {reviews.length > 0 ? (
              <>
                <p
                  className="text-4xl font-bold mb-1"
                  style={{ color: "var(--text-primary)" }}
                >
                  {promedioEstrellas.toFixed(1)}
                </p>
                <StarDisplay value={promedioEstrellas} size="w-5 h-5" />
                <p
                  className="text-xs mt-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  {reviews.length} review{reviews.length !== 1 ? "s" : ""}
                </p>
              </>
            ) : (
              <>
                <div className="text-3xl mb-2">⭐</div>
                <p
                  className="text-sm font-medium"
                  style={{ color: "var(--text-muted)" }}
                >
                  Este club aún no tiene reviews
                </p>
              </>
            )}
          </div>

          {/* Botón dejar review */}
          {puedeReview && !mostrarFormReview && (
            <button
              onClick={() => setMostrarFormReview(true)}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition"
              style={{ backgroundColor: "var(--accent)" }}
            >
              Dejar una review
            </button>
          )}

          {yaHizoReview && (
            <p
              className="text-xs text-center"
              style={{ color: "var(--text-muted)" }}
            >
              Ya dejaste tu review en este club
            </p>
          )}

          {!puedeReview && !yaHizoReview && user && (
            <p
              className="text-xs text-center"
              style={{ color: "var(--text-muted)" }}
            >
              Necesitás haber reservado en este club para dejar una review
            </p>
          )}

          {/* Formulario de review */}
          {mostrarFormReview && (
            <div className="themed-card rounded-2xl border p-5">
              <h3
                className="font-semibold mb-3"
                style={{ color: "var(--text-primary)" }}
              >
                Tu review
              </h3>
              <div className="flex flex-col gap-3">
                <div>
                  <label
                    className="text-xs font-semibold mb-2 block"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Puntuación
                  </label>
                  <StarRating
                    value={reviewForm.estrellas}
                    onChange={(v) =>
                      setReviewForm({ ...reviewForm, estrellas: v })
                    }
                  />
                </div>
                <div>
                  <label
                    className="text-xs font-semibold mb-1 block"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Comentario (opcional)
                  </label>
                  <textarea
                    value={reviewForm.comentario}
                    onChange={(e) =>
                      setReviewForm({
                        ...reviewForm,
                        comentario: e.target.value,
                      })
                    }
                    placeholder="Contá tu experiencia..."
                    rows={3}
                    className="themed-input w-full rounded-xl px-4 py-2.5 text-sm border resize-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setMostrarFormReview(false)}
                    className="flex-1 py-2 rounded-xl text-sm font-semibold transition"
                    style={{
                      backgroundColor: "var(--bg-card-hover)",
                      color: "var(--text-secondary)",
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleReview}
                    disabled={guardandoReview}
                    className="flex-1 py-2 rounded-xl text-sm font-semibold text-white transition disabled:opacity-50"
                    style={{ backgroundColor: "var(--accent)" }}
                  >
                    {guardandoReview ? "Enviando..." : "Enviar review"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Lista de reviews */}
          {reviews.length > 0 && (
            <div className="flex flex-col gap-3">
              {reviews
                .sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""))
                .map((r) => (
                  <div
                    key={r.id}
                    className="themed-card rounded-2xl border p-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
                          style={{ backgroundColor: "var(--accent)" }}
                        >
                          {(r.nombre || "A").charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p
                            className="text-sm font-semibold"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {r.nombre}
                          </p>
                          <p
                            className="text-[10px]"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {r.fecha}
                          </p>
                        </div>
                      </div>
                      <StarDisplay value={r.estrellas} size="w-3.5 h-3.5" />
                    </div>
                    {r.comentario && (
                      <p
                        className="text-sm"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {r.comentario}
                      </p>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Modal de reserva */}
      {mostrarModal && modalData && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="themed-card rounded-2xl max-w-md w-full p-6 border">
            <div className="flex items-center gap-3 mb-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: "var(--accent-light)" }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="w-5 h-5"
                  style={{ color: "var(--accent)" }}
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                </svg>
              </div>
              <div>
                <h2
                  className="font-bold"
                  style={{ color: "var(--text-primary)" }}
                >
                  Reservar cancha
                </h2>
                <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {club.nombre} · {modalData.cancha.nombre} · {modalData.hora}
                </p>
              </div>
            </div>
            <div
              className="rounded-xl p-3 mb-4 flex items-center justify-between"
              style={{ backgroundColor: "var(--accent-light)" }}
            >
              <span
                className="text-sm font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                Precio
              </span>
              <span
                className="text-lg font-bold"
                style={{ color: "var(--accent)" }}
              >
                ${modalData.precio}
              </span>
            </div>
            <form onSubmit={handleReservar} className="flex flex-col gap-3">
              <div>
                <label
                  className="text-xs font-semibold mb-1 block"
                  style={{ color: "var(--text-muted)" }}
                >
                  Nombre completo *
                </label>
                <input
                  type="text"
                  required
                  value={formReserva.nombreJugador}
                  onChange={(e) =>
                    setFormReserva({
                      ...formReserva,
                      nombreJugador: e.target.value,
                    })
                  }
                  className="themed-input w-full rounded-xl px-4 py-2.5 text-sm border"
                />
              </div>
              <div>
                <label
                  className="text-xs font-semibold mb-1 block"
                  style={{ color: "var(--text-muted)" }}
                >
                  Email
                </label>
                <input
                  type="email"
                  value={formReserva.email}
                  onChange={(e) =>
                    setFormReserva({ ...formReserva, email: e.target.value })
                  }
                  className="themed-input w-full rounded-xl px-4 py-2.5 text-sm border"
                />
              </div>
              <div>
                <label
                  className="text-xs font-semibold mb-1 block"
                  style={{ color: "var(--text-muted)" }}
                >
                  Teléfono
                </label>
                <input
                  type="tel"
                  value={formReserva.telefono}
                  onChange={(e) =>
                    setFormReserva({ ...formReserva, telefono: e.target.value })
                  }
                  className="themed-input w-full rounded-xl px-4 py-2.5 text-sm border"
                />
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setMostrarModal(false)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition"
                  style={{
                    backgroundColor: "var(--bg-card-hover)",
                    color: "var(--text-secondary)",
                  }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition disabled:opacity-50"
                  style={{ backgroundColor: "var(--accent)" }}
                >
                  {guardando ? "Reservando..." : "Confirmar reserva"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmación de reserva */}
      {reservaExitosa && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="themed-card rounded-2xl max-w-sm w-full p-6 border text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ backgroundColor: reservaExitosa.status === "confirmada" ? "rgba(34,197,94,0.1)" : "rgba(234,179,8,0.1)" }}>
              {reservaExitosa.status === "confirmada" ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="#eab308" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-8 h-8">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              )}
            </div>

            <h2 className="text-lg font-bold mb-1" style={{ color: "var(--text-primary)" }}>
              {reservaExitosa.status === "confirmada" ? "¡Reserva confirmada!" : "Reserva pendiente"}
            </h2>
            <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
              {reservaExitosa.status === "confirmada"
                ? "Tu cancha está reservada. ¡Nos vemos en la cancha!"
                : "Tu reserva fue enviada y está pendiente de aprobación por el club."}
            </p>

            <div className="rounded-xl p-4 mb-4 flex flex-col gap-1.5" style={{ backgroundColor: "var(--bg-card-hover)" }}>
              <div className="flex justify-between">
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>Club</span>
                <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{reservaExitosa.clubNombre}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>Cancha</span>
                <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{reservaExitosa.cancha}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>Fecha</span>
                <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{reservaExitosa.fecha}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>Hora</span>
                <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{reservaExitosa.hora}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>Precio</span>
                <span className="text-sm font-bold" style={{ color: "var(--accent)" }}>${reservaExitosa.precio}</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => setReservaExitosa(null)}
                className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition"
                style={{ backgroundColor: "var(--accent)" }}
              >
                Entendido
              </button>
              <button
                onClick={() => { setReservaExitosa(null); navigate("/mis-reservas"); }}
                className="w-full py-2.5 rounded-xl text-sm font-semibold transition"
                style={{ backgroundColor: "var(--bg-card-hover)", color: "var(--text-secondary)" }}
              >
                Ver mis reservas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
