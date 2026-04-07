import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import {
  getTorneoById,
  getParejas,
  getGrupos,
  getBracket,
  crearSolicitudInscripcion,
  getInscripciones,
  puedeInscribirse,
  crearReclamo,
  getReclamos,
  adherirseAReclamo,
  dejarDescargo,
} from "../services/torneoService";
import { getUserData } from "../services/authService";

const estadoBadge = {
  inscripcion: "bg-blue-100 text-blue-700",
  en_curso: "bg-green-100 text-green-700",
  finalizado: "bg-[var(--bg-card-hover)] text-[var(--text-muted)]",
  cancelado: "bg-red-100 text-red-500",
};

const estadoLabel = {
  inscripcion: "Inscripción abierta",
  en_curso: "En curso",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
};

const formatoLabel = {
  mini: "Mini torneo",
  normal: "Torneo normal",
  liga: "Liga",
  eliminacion: "Eliminación directa",
};

function getNombrePareja(p) {
  if (!p) return "Por definir";
  return p.nombrePareja || `${p.jugador1} / ${p.jugador2}`;
}

const tabs = ["Info", "Parejas", "Grupos", "Bracket"];

export default function DetalleTorneoPublico() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [torneo, setTorneo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("Info");
  const [parejas, setParejas] = useState([]);
  const [grupos, setGrupos] = useState([]);
  const [bracket, setBracket] = useState(null);
  const [inscripciones, setInscripciones] = useState([]);

  // Formulario inscripción
  const [mostrarFormInsc, setMostrarFormInsc] = useState(false);
  const [nombre1, setNombre1] = useState("");
  const [apellido1, setApellido1] = useState("");
  const [email1, setEmail1] = useState("");
  const [whatsapp1, setWhatsapp1] = useState("");
  const [nombre2, setNombre2] = useState("");
  const [apellido2, setApellido2] = useState("");
  const [email2, setEmail2] = useState("");
  const [whatsapp2, setWhatsapp2] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [inscripcionEnviada, setInscripcionEnviada] = useState(false);
  const [linkInvitacion, setLinkInvitacion] = useState("");
  const [restriccionCategoria, setRestriccionCategoria] = useState(null);
  const [categoriaJugador, setCategoriaJugador] = useState("");

  const [reclamos, setReclamos] = useState([]);
  const [mostrarFormReclamo, setMostrarFormReclamo] = useState(null);
  const [motivoReclamo, setMotivoReclamo] = useState("categoria_incorrecta");
  const [comentarioReclamo, setComentarioReclamo] = useState("");
  const [enviandoReclamo, setEnviandoReclamo] = useState(false);
  const [descargoTexto, setDescargoTexto] = useState("");

  useEffect(() => {
    if (!user) return;
    getUserData(user.uid).then((data) => {
      if (data) {
        setNombre1(data.nombre?.split(" ")[0] || "");
        setApellido1(data.nombre?.split(" ").slice(1).join(" ") || "");
        setEmail1(data.email || user.email || "");
        setWhatsapp1(data.telefono || "");
      }
    });
  }, [user]);

  // Reclamos
  useEffect(() => {
    const cargar = async () => {
      try {
        const [torneoData, parejasData, gruposData, bracketData, inscData] =
          await Promise.all([
            getTorneoById(id),
            getParejas(id),
            getGrupos(id),
            getBracket(id),
            getInscripciones(id),
          ]);
        setTorneo(torneoData);
        setParejas(parejasData);
        setGrupos(
          gruposData.sort((a, b) =>
            (a.nombre || "").localeCompare(b.nombre || ""),
          ),
        );
        if (bracketData) setBracket(bracketData);
        setInscripciones(inscData);

        // Si el torneo está en curso, mostrar grupos por defecto
        if (
          torneoData &&
          torneoData.status === "en_curso" &&
          gruposData.length > 0
        ) {
          setTab("Grupos");
        }

        // Cargar reclamos
        try {
          const reclamosData = await getReclamos(id);
          setReclamos(reclamosData);
        } catch (e) {
          console.error("Error al cargar reclamos:", e);
        }

        // Verificar restricción de categoría
        if (user && torneoData) {
          const userData = await getUserData(user.uid);
          if (userData) {
            setCategoriaJugador(userData.nivel || "");
            const categoriasTorneo = torneoData.categoriasConfig
              ? Object.values(torneoData.categoriasConfig).flat()
              : [];
            if (userData.nivel && categoriasTorneo.length > 0) {
              const puedeEnAlguna = categoriasTorneo.some((cat) =>
                puedeInscribirse(userData.nivel, cat),
              );
              if (!puedeEnAlguna) {
                setRestriccionCategoria(
                  `Tu categoría (${userData.nivel}) es superior a las categorías de este torneo. No podés inscribirte en una categoría menor.`,
                );
              }
            }
          }
        }
      } catch (err) {
        console.error("Error al cargar torneo:", err);
      }
      setLoading(false);
    };
    cargar();
  }, [id, user]);

  const miPareja = parejas.find(
    (p) => p.jugador1Uid === user?.uid || p.jugador2Uid === user?.uid,
  );

  const handleReclamo = async (partido, grupoNombre) => {
    if (!miPareja) return;
    setEnviandoReclamo(true);
    try {
      const parejaDenunciada =
        partido.pareja1.id === miPareja.id ? partido.pareja2 : partido.pareja1;
      await crearReclamo(id, {
        parejaDenunciante: {
          id: miPareja.id,
          nombrePareja: miPareja.nombrePareja,
          jugador1: miPareja.jugador1,
          jugador2: miPareja.jugador2,
        },
        parejaDenunciada: {
          id: parejaDenunciada.id,
          nombrePareja: parejaDenunciada.nombrePareja,
          jugador1: parejaDenunciada.jugador1,
          jugador2: parejaDenunciada.jugador2,
        },
        motivo: motivoReclamo,
        comentario: comentarioReclamo,
        grupoNombre,
      });
      const reclamosData = await getReclamos(id);
      setReclamos(reclamosData);
      setMostrarFormReclamo(null);
      setComentarioReclamo("");
      alert("Reclamo enviado correctamente");
    } catch (err) {
      console.error("Error:", err);
    }
    setEnviandoReclamo(false);
  };

  const handleAdherirse = async (reclamoId) => {
    if (!miPareja) return;
    try {
      await adherirseAReclamo(id, reclamoId, {
        id: miPareja.id,
        nombrePareja: miPareja.nombrePareja,
        jugador1: miPareja.jugador1,
        jugador2: miPareja.jugador2,
      });
      const reclamosData = await getReclamos(id);
      setReclamos(reclamosData);
    } catch (err) {
      console.error("Error:", err);
    }
  };

  const handleDescargo = async (reclamoId) => {
    if (!descargoTexto.trim()) return;
    try {
      await dejarDescargo(id, reclamoId, descargoTexto);
      const reclamosData = await getReclamos(id);
      setReclamos(reclamosData);
      setDescargoTexto("");
    } catch (err) {
      console.error("Error:", err);
    }
  };

  const yaInscripto = user
    ? inscripciones.some(
        (i) =>
          (i.jugador1Uid === user.uid || i.jugador2Uid === user.uid) &&
          i.status !== "rechazada",
      )
    : false;

  const handleInscripcion = async (e) => {
    e.preventDefault();
    if (!apellido1.trim() || !apellido2.trim()) return;
    if (!email2.trim() && !whatsapp2.trim()) return;
    setEnviando(true);
    try {
      const inscId = await crearSolicitudInscripcion(id, {
        nombre1: nombre1.trim(),
        apellido1: apellido1.trim(),
        email1: email1.trim() || user?.email || "",
        whatsapp1: whatsapp1.trim(),
        jugador1Uid: user?.uid || null,
        nombre2: nombre2.trim(),
        apellido2: apellido2.trim(),
        email2: email2.trim(),
        whatsapp2: whatsapp2.trim(),
        jugador2Uid: null,
      });
      const link = `${window.location.origin}/invitacion/${id}/${inscId}`;
      setLinkInvitacion(link);
      setInscripcionEnviada(true);
      setMostrarFormInsc(false);
    } catch (err) {
      console.error("Error al crear inscripción:", err);
    }
    setEnviando(false);
  };

  if (loading)
    return (
      <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>
        Cargando...
      </div>
    );

  if (!torneo)
    return (
      <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>
        Torneo no encontrado
      </div>
    );

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => navigate("/torneos")}
          className="text-xl hover:opacity-70 transition"
          style={{ color: "var(--text-muted)" }}
        >
          ←
        </button>
        <div className="flex-1">
          <h1
            className="text-xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            {torneo.nombre}
          </h1>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {torneo.sede} — {torneo.ciudad}, {torneo.provincia}
          </p>
        </div>
        <span
          className={`text-xs font-semibold px-3 py-1 rounded-full ${estadoBadge[torneo.status]}`}
        >
          {estadoLabel[torneo.status]}
        </span>
      </div>

      {/* Botón inscripción */}
      {torneo.status === "inscripcion" &&
        torneo.inscripcionAbierta &&
        !yaInscripto &&
        !inscripcionEnviada && (
          <>
            {restriccionCategoria ? (
              <div
                className="rounded-xl p-4 mb-4 border"
                style={{
                  backgroundColor: "rgba(239,68,68,0.08)",
                  borderColor: "rgba(239,68,68,0.2)",
                }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-100">
                    <span className="text-lg">🚫</span>
                  </div>
                  <div>
                    <p className="font-semibold text-sm text-red-600">
                      No podés inscribirte
                    </p>
                    <p className="text-xs text-red-500 mt-0.5">
                      {restriccionCategoria}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setMostrarFormInsc(true)}
                className="w-full text-white font-semibold py-3 rounded-xl transition mb-4"
                style={{ backgroundColor: "var(--accent)" }}
              >
                Inscribirme a este torneo
              </button>
            )}
          </>
        )}

      {yaInscripto && !inscripcionEnviada && (
        <div
          className="rounded-xl p-4 mb-4 border"
          style={{
            backgroundColor: "var(--accent-light)",
            borderColor: "var(--accent)",
          }}
        >
          <p
            className="text-sm font-semibold text-center"
            style={{ color: "var(--accent)" }}
          >
            Ya estás inscripto en este torneo
          </p>
        </div>
      )}

      {/* Solicitud enviada */}
      {inscripcionEnviada && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4">
          <p className="text-green-700 font-semibold text-center">
            Solicitud creada
          </p>
          <p className="text-green-600 text-sm mt-1 text-center">
            Enviá este link a tu compañero/a para que acepte la invitación:
          </p>
          <div
            className="themed-card border border-green-300 rounded-lg mt-3 p-3 text-sm break-all"
            style={{ color: "var(--text-primary)" }}
          >
            {linkInvitacion}
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => {
                navigator.clipboard.writeText(linkInvitacion);
              }}
              className="flex-1 px-3 py-2 bg-green-600 text-white rounded-xl text-sm font-semibold hover:bg-green-700 transition"
            >
              Copiar link
            </button>
            {whatsapp2.trim() && (
              <a
                href={`https://wa.me/${whatsapp2.trim().replace(/\D/g, "")}?text=${encodeURIComponent(
                  `¡Hola! Te invité a jugar como pareja en el torneo "${torneo.nombre}". Aceptá la invitación acá: ${linkInvitacion}`,
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 px-3 py-2 bg-green-500 text-white rounded-xl text-sm font-semibold hover:bg-green-600 transition text-center"
              >
                Enviar por WhatsApp
              </a>
            )}
          </div>
        </div>
      )}

      {/* Formulario inscripción */}
      {mostrarFormInsc && (
        <div className="themed-card rounded-2xl p-5 border border-green-200 mb-4">
          <h2 className="font-semibold text-green-700 mb-3">Inscripción</h2>
          <form onSubmit={handleInscripcion} className="flex flex-col gap-3">
            <p
              className="text-xs font-semibold"
              style={{ color: "var(--text-muted)" }}
            >
              Tus datos (Jugador 1)
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Nombre"
                value={nombre1}
                onChange={(e) => setNombre1(e.target.value)}
                className="themed-input flex-1 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                required
              />
              <input
                type="text"
                placeholder="Apellido"
                value={apellido1}
                onChange={(e) => setApellido1(e.target.value)}
                className="themed-input flex-1 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                required
              />
            </div>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Email"
                value={email1}
                onChange={(e) => setEmail1(e.target.value)}
                className="themed-input flex-1 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <input
                type="text"
                placeholder="WhatsApp"
                value={whatsapp1}
                onChange={(e) => setWhatsapp1(e.target.value)}
                className="themed-input flex-1 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <p
              className="text-xs font-semibold mt-2"
              style={{ color: "var(--text-muted)" }}
            >
              Datos de tu compañero/a (Jugador 2)
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Nombre"
                value={nombre2}
                onChange={(e) => setNombre2(e.target.value)}
                className="themed-input flex-1 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                required
              />
              <input
                type="text"
                placeholder="Apellido"
                value={apellido2}
                onChange={(e) => setApellido2(e.target.value)}
                className="themed-input flex-1 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                required
              />
            </div>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Email"
                value={email2}
                onChange={(e) => setEmail2(e.target.value)}
                className="themed-input flex-1 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <input
                type="text"
                placeholder="WhatsApp"
                value={whatsapp2}
                onChange={(e) => setWhatsapp2(e.target.value)}
                className="themed-input flex-1 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Se necesita al menos email o WhatsApp del compañero para enviar la
              invitación
            </p>

            {apellido1.trim() && apellido2.trim() && (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Nombre de pareja:{" "}
                <span className="font-semibold">
                  {apellido1.trim()}-{apellido2.trim()}
                </span>
              </p>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMostrarFormInsc(false)}
                className="flex-1 px-4 py-2 rounded-xl text-sm font-semibold transition"
                style={{
                  backgroundColor: "var(--bg-card-hover)",
                  color: "var(--text-muted)",
                }}
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={
                  enviando ||
                  !apellido1.trim() ||
                  !apellido2.trim() ||
                  (!email2.trim() && !whatsapp2.trim())
                }
                className="flex-1 bg-green-600 text-white font-semibold py-2 rounded-xl hover:bg-green-700 transition disabled:opacity-50"
              >
                {enviando ? "Enviando..." : "Enviar solicitud"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tabs */}
      <div
        className="flex gap-2 mb-6 border-b"
        style={{ borderColor: "var(--border-card)" }}
      >
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-semibold transition border-b-2 -mb-px ${
              tab === t
                ? "border-green-600 text-green-600"
                : "border-transparent hover:opacity-80"
            }`}
            style={tab !== t ? { color: "var(--text-muted)" } : {}}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Info */}
      {tab === "Info" && (
        <div className="flex flex-col gap-4">
          <div className="themed-card rounded-2xl p-5 border">
            <h2
              className="font-semibold mb-3"
              style={{ color: "var(--text-primary)" }}
            >
              Detalles
            </h2>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="block" style={{ color: "var(--text-muted)" }}>
                  Formato
                </span>
                <span
                  className="font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {formatoLabel[torneo.formato]}
                </span>
              </div>
              <div>
                <span className="block" style={{ color: "var(--text-muted)" }}>
                  Categoría Género
                </span>
                <span
                  className="font-medium capitalize"
                  style={{ color: "var(--text-primary)" }}
                >
                  {Array.isArray(torneo.categoriaGenero)
                    ? torneo.categoriaGenero.join(", ")
                    : "—"}
                </span>
              </div>
              <div>
                <span className="block" style={{ color: "var(--text-muted)" }}>
                  Categoría Nivel
                </span>
                <span
                  className="font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {torneo.categoriasConfig
                    ? Object.entries(torneo.categoriasConfig)
                        .map(
                          ([g, niveles]) =>
                            `${g.charAt(0).toUpperCase() + g.slice(1)}: ${niveles.join(", ")}`,
                        )
                        .join(" | ")
                    : "—"}
                </span>
                {categoriaJugador && (
                  <div
                    className="mt-2 rounded-lg p-2"
                    style={{ backgroundColor: "var(--bg-card-hover)" }}
                  >
                    <p
                      className="text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Tu categoría:{" "}
                      <span
                        className="font-semibold"
                        style={{ color: "var(--accent)" }}
                      >
                        {categoriaJugador}
                      </span>
                    </p>
                  </div>
                )}
              </div>
              <div>
                <span className="block" style={{ color: "var(--text-muted)" }}>
                  Máx. parejas
                </span>
                <span
                  className="font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {torneo.maxParejas}
                </span>
              </div>
              <div>
                <span className="block" style={{ color: "var(--text-muted)" }}>
                  Inscripción
                </span>
                <span
                  className="font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {torneo.inscripcion > 0
                    ? `$${torneo.inscripcion}`
                    : "Gratuita"}
                </span>
              </div>
              <div>
                <span className="block" style={{ color: "var(--text-muted)" }}>
                  Fechas
                </span>
                <span
                  className="font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {torneo.fechaInicio} → {torneo.fechaFin}
                </span>
              </div>
            </div>

            {torneo.direccionSede && (
              <div
                className="mt-3 pt-3 border-t text-sm"
                style={{ borderColor: "var(--border-card)" }}
              >
                <span className="block" style={{ color: "var(--text-muted)" }}>
                  Dirección
                </span>
                <span
                  className="font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  {torneo.direccionSede}
                </span>
              </div>
            )}

            {torneo.descripcion && (
              <div
                className="mt-3 pt-3 border-t"
                style={{ borderColor: "var(--border-card)" }}
              >
                <span
                  className="text-sm block mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Descripción
                </span>
                <p className="text-sm" style={{ color: "var(--text-primary)" }}>
                  {torneo.descripcion}
                </p>
              </div>
            )}

            {torneo.reglamento && (
              <div
                className="mt-3 pt-3 border-t"
                style={{ borderColor: "var(--border-card)" }}
              >
                <span
                  className="text-sm block mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Reglamento
                </span>
                <p
                  className="text-sm whitespace-pre-line"
                  style={{ color: "var(--text-primary)" }}
                >
                  {torneo.reglamento}
                </p>
              </div>
            )}

            {(torneo.instagramOrganizador || torneo.whatsappOrganizador) && (
              <div
                className="mt-3 pt-3 border-t text-sm"
                style={{ borderColor: "var(--border-card)" }}
              >
                <span
                  className="block mb-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  Contacto
                </span>
                {torneo.instagramOrganizador && (
                  <p style={{ color: "var(--text-primary)" }}>
                    IG: {torneo.instagramOrganizador}
                  </p>
                )}
                {torneo.whatsappOrganizador && (
                  <p style={{ color: "var(--text-primary)" }}>
                    WA: {torneo.whatsappOrganizador}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Premios */}
          {torneo.premios && (
            <div className="themed-card rounded-2xl p-5 border">
              <h2
                className="font-semibold mb-2"
                style={{ color: "var(--text-primary)" }}
              >
                🏆 Premios
              </h2>
              <p
                className="text-sm whitespace-pre-line"
                style={{ color: "var(--text-secondary)" }}
              >
                {torneo.premios}
              </p>
            </div>
          )}

          {/* Inscripción incluye */}
          {torneo.inscripcionIncluye && (
            <div className="themed-card rounded-2xl p-5 border">
              <h2
                className="font-semibold mb-2"
                style={{ color: "var(--text-primary)" }}
              >
                📋 La inscripción incluye
              </h2>
              <p
                className="text-sm whitespace-pre-line"
                style={{ color: "var(--text-secondary)" }}
              >
                {torneo.inscripcionIncluye}
              </p>
            </div>
          )}

          {/* Administradores/Contacto */}
          {torneo.administradores &&
            torneo.administradores.length > 0 &&
            torneo.administradores[0].nombre && (
              <div className="themed-card rounded-2xl p-5 border">
                <h2
                  className="font-semibold mb-2"
                  style={{ color: "var(--text-primary)" }}
                >
                  📞 Contacto del torneo
                </h2>
                <div className="flex flex-col gap-2">
                  {torneo.administradores
                    .filter((a) => a.nombre)
                    .map((admin, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-xl px-4 py-3"
                        style={{ backgroundColor: "var(--bg-card-hover)" }}
                      >
                        <span
                          className="text-sm font-medium"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {admin.nombre}
                        </span>
                        {admin.whatsapp && (
                          <a
                            href={`https://wa.me/${admin.whatsapp.replace(/\D/g, "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs font-semibold px-3 py-1 rounded-full bg-green-100 text-green-700 hover:bg-green-200 transition"
                          >
                            📱 {admin.whatsapp}
                          </a>
                        )}
                      </div>
                    ))}
                </div>
              </div>
            )}

          {/* Compartir */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                navigator.clipboard.writeText(
                  `${window.location.origin}/torneos/${id}`,
                );
                alert("Link copiado");
              }}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2"
              style={{
                backgroundColor: "var(--bg-card-hover)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-card)",
              }}
            >
              🔗 Copiar link
            </button>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`🏆 ${torneo.nombre}\n📍 ${torneo.sede} - ${torneo.ciudad}\n📅 ${torneo.fechaInicio} → ${torneo.fechaFin}\n${torneo.inscripcion > 0 ? `💰 $${torneo.inscripcion}` : "🆓 Gratis"}\n\n${window.location.origin}/torneos/${id}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition flex items-center justify-center gap-2 bg-green-600 text-white hover:bg-green-700"
            >
              📱 Compartir
            </a>
          </div>
        </div>
      )}

      {/* Parejas */}
      {tab === "Parejas" && (
        <div className="themed-card rounded-2xl p-5 border">
          <h2
            className="font-semibold mb-3"
            style={{ color: "var(--text-primary)" }}
          >
            Parejas inscriptas ({parejas.length}/{torneo.maxParejas})
          </h2>
          {parejas.length === 0 ? (
            <p
              className="text-sm text-center py-4"
              style={{ color: "var(--text-muted)" }}
            >
              No hay parejas inscriptas todavía
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {parejas.map((p, index) => (
                <div
                  key={p.id}
                  className="flex items-center gap-3 rounded-xl px-4 py-3"
                  style={{ backgroundColor: "var(--bg-card-hover)" }}
                >
                  <span
                    className="text-xs font-bold w-6"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {index + 1}
                  </span>
                  <div>
                    <p
                      className="text-sm font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {p.nombrePareja || `${p.jugador1} / ${p.jugador2}`}
                    </p>
                    <p
                      className="text-xs"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {p.jugador1} — {p.jugador2}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Grupos */}
      {tab === "Grupos" && (
        <div className="flex flex-col gap-4">
          {grupos.length === 0 ? (
            <div className="themed-card rounded-2xl p-5 border text-center py-12">
              <p style={{ color: "var(--text-muted)" }}>
                Los grupos aún no fueron generados
              </p>
            </div>
          ) : (
            grupos.map((grupo, gi) => (
              <div
                key={grupo.id || gi}
                className="themed-card rounded-2xl p-5 border"
              >
                <h2
                  className="font-semibold mb-3"
                  style={{ color: "var(--text-primary)" }}
                >
                  {grupo.nombre}
                </h2>
                <div className="flex flex-col gap-1 mb-3">
                  {grupo.parejas.map((p, pi) => (
                    <div
                      key={pi}
                      className="text-sm rounded-lg px-3 py-2"
                      style={{
                        color: "var(--text-primary)",
                        backgroundColor: "var(--bg-card-hover)",
                      }}
                    >
                      {getNombrePareja(p)}
                    </div>
                  ))}
                </div>

                {/* Partidos */}
                {(grupo.partidos || []).length > 0 && (
                  <div>
                    <h3
                      className="text-sm font-semibold mb-2"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Partidos
                    </h3>
                    <div className="flex flex-col gap-2">
                      {grupo.partidos.map((p, pi) => {
                        const esPartidoMio =
                          miPareja &&
                          (p.pareja1.id === miPareja.id ||
                            p.pareja2.id === miPareja.id);
                        const parejaDenunciada = esPartidoMio
                          ? p.pareja1.id === miPareja.id
                            ? p.pareja2
                            : p.pareja1
                          : null;
                        const yaReclamo = reclamos.some(
                          (r) =>
                            r.parejaDenunciante?.id === miPareja?.id &&
                            r.parejaDenunciada?.id === parejaDenunciada?.id,
                        );
                        const partidoKey = `${gi}-${pi}`;

                        return (
                          <div key={pi}>
                            <div
                              className="flex items-center justify-between rounded-xl px-4 py-3"
                              style={{
                                backgroundColor: "var(--bg-card-hover)",
                              }}
                            >
                              <div className="flex-1">
                                <p
                                  className="text-sm font-medium"
                                  style={{ color: "var(--text-primary)" }}
                                >
                                  {getNombrePareja(p.pareja1)} vs{" "}
                                  {getNombrePareja(p.pareja2)}
                                </p>
                                {p.hora && (
                                  <p
                                    className="text-xs mt-0.5"
                                    style={{ color: "var(--text-muted)" }}
                                  >
                                    🕐 {p.hora}{" "}
                                    {p.cancha && `· Cancha ${p.cancha}`}
                                  </p>
                                )}
                              </div>
                              <div className="text-right">
                                {p.resultado ? (
                                  <span
                                    className="text-sm font-bold"
                                    style={{ color: "var(--text-primary)" }}
                                  >
                                    {p.resultado.sets
                                      .map((s) => `${s.g1}-${s.g2}`)
                                      .join(" / ")}
                                  </span>
                                ) : (
                                  <span
                                    className="text-xs"
                                    style={{ color: "var(--text-muted)" }}
                                  >
                                    Pendiente
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Botón de reclamo */}
                            {esPartidoMio &&
                              torneo.status === "en_curso" &&
                              torneo.habilitarReclamos &&
                              !yaReclamo && (
                                <div className="mt-1 ml-4">
                                  {mostrarFormReclamo === partidoKey ? (
                                    <div className="themed-card rounded-xl p-3 border mt-1">
                                      <p
                                        className="text-xs font-semibold mb-2"
                                        style={{ color: "var(--text-primary)" }}
                                      >
                                        Reclamo contra{" "}
                                        {getNombrePareja(parejaDenunciada)}
                                      </p>
                                      <select
                                        value={motivoReclamo}
                                        onChange={(e) =>
                                          setMotivoReclamo(e.target.value)
                                        }
                                        className="themed-input w-full rounded-lg px-3 py-2 text-xs border mb-2"
                                      >
                                        <option value="categoria_incorrecta">
                                          Categoría incorrecta
                                        </option>
                                        <option value="conducta_antideportiva">
                                          Conducta antideportiva
                                        </option>
                                      </select>
                                      <textarea
                                        value={comentarioReclamo}
                                        onChange={(e) =>
                                          setComentarioReclamo(e.target.value)
                                        }
                                        placeholder="Comentario (opcional)"
                                        rows={2}
                                        className="themed-input w-full rounded-lg px-3 py-2 text-xs border mb-2 resize-none"
                                      />
                                      <div className="flex gap-2">
                                        <button
                                          onClick={() =>
                                            setMostrarFormReclamo(null)
                                          }
                                          className="flex-1 py-1.5 rounded-lg text-xs font-semibold transition"
                                          style={{
                                            backgroundColor:
                                              "var(--bg-card-hover)",
                                            color: "var(--text-muted)",
                                          }}
                                        >
                                          Cancelar
                                        </button>
                                        <button
                                          onClick={() =>
                                            handleReclamo(p, grupo.nombre)
                                          }
                                          disabled={enviandoReclamo}
                                          className="flex-1 py-1.5 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-700 transition disabled:opacity-50"
                                        >
                                          {enviandoReclamo
                                            ? "Enviando..."
                                            : "Enviar reclamo"}
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <button
                                      onClick={() =>
                                        setMostrarFormReclamo(partidoKey)
                                      }
                                      className="text-xs font-semibold text-red-500 hover:text-red-600 transition"
                                    >
                                      ⚠️ Abrir reclamo
                                    </button>
                                  )}
                                </div>
                              )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))
          )}

          {/* Reclamos abiertos visibles para todos */}
          {reclamos.filter((r) => r.estado === "abierto").length > 0 && (
            <div className="themed-card rounded-2xl p-5 border border-red-200">
              <h2 className="font-semibold mb-3 text-red-600">
                Reclamos abiertos
              </h2>
              <div className="flex flex-col gap-3">
                {reclamos
                  .filter((r) => r.estado === "abierto")
                  .map((r) => {
                    const yaAdherido =
                      miPareja &&
                      (r.adheridos || []).some((a) => a.id === miPareja?.id);
                    const esDenunciante =
                      miPareja && r.parejaDenunciante?.id === miPareja?.id;
                    const esDenunciado =
                      miPareja && r.parejaDenunciada?.id === miPareja?.id;

                    return (
                      <div
                        key={r.id}
                        className="rounded-xl p-4"
                        style={{
                          backgroundColor: "rgba(239,68,68,0.05)",
                          border: "1px solid rgba(239,68,68,0.15)",
                        }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold px-2 py-1 rounded-full bg-red-100 text-red-600">
                            {r.motivo === "categoria_incorrecta"
                              ? "Categoría incorrecta"
                              : "Conducta antideportiva"}
                          </span>
                          <span
                            className="text-xs"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {(r.adheridos || []).length} adherido
                            {(r.adheridos || []).length !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <p
                          className="text-sm"
                          style={{ color: "var(--text-primary)" }}
                        >
                          {getNombrePareja(r.parejaDenunciante)} →{" "}
                          {getNombrePareja(r.parejaDenunciada)}
                        </p>
                        {r.comentario && (
                          <p
                            className="text-xs mt-1"
                            style={{ color: "var(--text-muted)" }}
                          >
                            {r.comentario}
                          </p>
                        )}

                        {/* Adherirse */}
                        {miPareja &&
                          !esDenunciante &&
                          !esDenunciado &&
                          !yaAdherido && (
                            <button
                              onClick={() => handleAdherirse(r.id)}
                              className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg bg-red-100 text-red-600 hover:bg-red-200 transition"
                            >
                              Unirme al reclamo
                            </button>
                          )}
                        {yaAdherido && (
                          <p className="text-xs mt-2 text-red-500">
                            Ya te adheriste a este reclamo
                          </p>
                        )}

                        {/* Descargo */}
                        {esDenunciado && !r.descargo && (
                          <div className="mt-2">
                            <textarea
                              value={descargoTexto}
                              onChange={(e) => setDescargoTexto(e.target.value)}
                              placeholder="Escribí tu descargo..."
                              rows={2}
                              className="themed-input w-full rounded-lg px-3 py-2 text-xs border mb-1 resize-none"
                            />
                            <button
                              onClick={() => handleDescargo(r.id)}
                              className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white transition"
                              style={{ backgroundColor: "var(--accent)" }}
                            >
                              Enviar descargo
                            </button>
                          </div>
                        )}
                        {esDenunciado && r.descargo && (
                          <p
                            className="text-xs mt-2"
                            style={{ color: "var(--accent)" }}
                          >
                            Descargo enviado: {r.descargo}
                          </p>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Bracket */}
      {tab === "Bracket" && (
        <div className="flex flex-col gap-4">
          {!bracket || !bracket.rondas ? (
            <div className="themed-card rounded-2xl p-5 border text-center py-12">
              <p style={{ color: "var(--text-muted)" }}>
                El bracket aún no fue generado
              </p>
            </div>
          ) : (
            bracket.rondas.map((ronda, ri) => {
              const totalRondas = bracket.rondas.length;
              const faltantes = totalRondas - ri;
              let nombreRonda = `Ronda ${ri + 1}`;
              if (faltantes === 1) nombreRonda = "Final";
              else if (faltantes === 2) nombreRonda = "Semifinales";
              else if (faltantes === 3) nombreRonda = "Cuartos de final";
              else if (faltantes === 4) nombreRonda = "Octavos de final";

              return (
                <div key={ri} className="themed-card rounded-2xl p-5 border">
                  <h2
                    className="font-semibold mb-3"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {nombreRonda}
                  </h2>
                  <div className="flex flex-col gap-2">
                    {ronda.map((p, pi) => (
                      <div
                        key={pi}
                        className="flex items-center justify-between rounded-xl px-4 py-3"
                        style={{ backgroundColor: "var(--bg-card-hover)" }}
                      >
                        <div className="flex-1">
                          <p
                            className="text-sm font-medium"
                            style={{
                              color: p.pareja1
                                ? "var(--text-primary)"
                                : "var(--text-muted)",
                              opacity: p.pareja1 ? 1 : 0.4,
                            }}
                          >
                            {getNombrePareja(p.pareja1)}
                          </p>
                          <p
                            className="text-xs"
                            style={{ color: "var(--text-muted)" }}
                          >
                            vs
                          </p>
                          <p
                            className="text-sm font-medium"
                            style={{
                              color: p.pareja2
                                ? "var(--text-primary)"
                                : "var(--text-muted)",
                              opacity: p.pareja2 ? 1 : 0.4,
                            }}
                          >
                            {getNombrePareja(p.pareja2)}
                          </p>
                        </div>
                        {p.resultado && (
                          <span
                            className="text-sm font-bold"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {p.resultado.sets
                              .map((s) => {
                                let txt = `${s.g1}-${s.g2}`;
                                if (s.tb1 !== undefined && s.tb2 !== undefined)
                                  txt += ` (TB ${s.tb1}-${s.tb2})`;
                                return txt;
                              })
                              .join(" / ")}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
