import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { getUserData } from "../services/authService";
import {
  doc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";
import { db, auth } from "../lib/firebase";
import { sendEmailVerification, deleteUser, signOut } from "firebase/auth";
import {
  getInscripcionesByJugador,
  getTorneosByOrganizer,
  getHistorialPartidos,
} from "../services/torneoService";
import { getClubByOwner } from "../services/canchaService";
import { uploadProfilePhoto } from "../services/storageService";

const categoriasNivel = [
  "8va",
  "7ma",
  "6ta",
  "5ta",
  "4ta",
  "3era",
  "2da",
  "1era",
];
const inputClass =
  "themed-input rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-full";
const labelClass = "text-xs font-semibold mb-1 block";

export default function Perfil() {
  const { user, setUser } = useAuthStore();
  const navigate = useNavigate();
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [verificandoEmail, setVerificandoEmail] = useState(false);
  const [emailEnviado, setEmailEnviado] = useState(false);
  const [rol, setRol] = useState("jugador");

  // Jugador
  const [inscripciones, setInscripciones] = useState([]);
  const [historial, setHistorial] = useState([]);
  const [cargandoHistorial, setCargandoHistorial] = useState(false);
  const [mostrarHistorial, setMostrarHistorial] = useState(false);
  const [subiendoFoto, setSubiendoFoto] = useState(false);
  const [fotoUrl, setFotoUrl] = useState(null);
  const [perfilModificado, setPerfilModificado] = useState(false);
  const [mostrarInfoPuntos, setMostrarInfoPuntos] = useState(false);
  const [editForm, setEditForm] = useState({
    nombre: "",
    telefono: "",
    provincia: "",
    nacimiento: "",
    genero: "",
    nivel: "",
    manoHabil: "",
    posicionPreferida: "",
  });

  // Club
  const [club, setClub] = useState(null);

  // Organizador
  const [entidad, setEntidad] = useState(null);
  const [torneosOrg, setTorneosOrg] = useState([]);

  useEffect(() => {
    if (!user) return;
    const cargar = async () => {
      try {
        const data = await getUserData(user.uid);
        if (data) {
          setUserData(data);
          if (data.fotoUrl) setFotoUrl(data.fotoUrl);
          const roles = data.role || ["jugador"];

          if (roles.includes("club")) {
            setRol("club");
            const clubData = await getClubByOwner(user.uid);
            if (clubData) setClub(clubData);
          } else if (roles.includes("organizador")) {
            setRol("organizador");
            const q = query(
              collection(db, "organizers"),
              where("ownerUid", "==", user.uid),
            );
            const snap = await getDocs(q);
            if (snap.docs.length > 0)
              setEntidad({ id: snap.docs[0].id, ...snap.docs[0].data() });
            const torneos = await getTorneosByOrganizer(user.uid);
            setTorneosOrg(torneos);
          } else {
            setRol("jugador");
            setEditForm({
              nombre: data.nombre || "",
              telefono: data.telefono || "",
              provincia: data.provincia || "",
              nacimiento: data.nacimiento || "",
              genero: data.genero || "",
              nivel: data.nivel || "",
              manoHabil: data.manoHabil || "",
              posicionPreferida: data.posicionPreferida || "",
            });
            const insc = await getInscripcionesByJugador(user.uid);
            setInscripciones(insc);
          }
        }
      } catch (err) {
        console.error("Error al cargar perfil:", err);
      }
      setLoading(false);
    };
    cargar();
  }, [user]);

  const handleGuardar = async () => {
    if (!user) return;
    setGuardando(true);
    try {
      await updateDoc(doc(db, "users", user.uid), editForm);
      setUserData({ ...userData, ...editForm });
      setEditando(false);
      setPerfilModificado(false);
    } catch (err) {
      console.error("Error al guardar:", err);
    }
    setGuardando(false);
  };

  const setEditField = (field, value) => {
    setEditForm({ ...editForm, [field]: value });
    setPerfilModificado(true);
  };

  const handleVerificarEmail = async () => {
    if (!auth.currentUser) return;
    setVerificandoEmail(true);
    try {
      await sendEmailVerification(auth.currentUser);
      setEmailEnviado(true);
    } catch (err) {
      console.error("Error:", err);
    }
    setVerificandoEmail(false);
  };

  const handleCerrarSesion = async () => {
    try {
      await signOut(auth);
      setUser(null);
      navigate("/login");
    } catch (err) {
      console.error("Error:", err);
    }
  };

  const handleEliminarCuenta = async () => {
    if (!window.confirm("¿Estás seguro? Esta acción es irreversible.")) return;
    if (
      !window.confirm("¿Realmente querés eliminar tu cuenta permanentemente?")
    )
      return;
    try {
      await deleteDoc(doc(db, "users", user.uid));
      await deleteUser(auth.currentUser);
      setUser(null);
      navigate("/login");
    } catch (err) {
      console.error("Error:", err);
      if (err.code === "auth/requires-recent-login")
        alert(
          "Necesitás cerrar sesión e iniciar sesión de nuevo antes de eliminar tu cuenta.",
        );
    }
  };

  const handleSubirFoto = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert("La imagen no puede superar los 5MB"); return; }
    if (!file.type.startsWith("image/")) { alert("Solo se permiten archivos de imagen"); return; }
    setSubiendoFoto(true);
    try {
      const url = await uploadProfilePhoto(user.uid, file);
      await updateDoc(doc(db, "users", user.uid), { fotoUrl: url });
      setFotoUrl(url);
    } catch (err) {
      console.error("Error subiendo foto:", err);
      alert("Error al subir la foto. Intentá de nuevo.");
    }
    setSubiendoFoto(false);
  };

  if (loading)
    return (
      <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>
        Cargando perfil...
      </div>
    );
  if (!userData)
    return (
      <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>
        No se encontró tu perfil
      </div>
    );

  const emailVerificado = auth.currentUser?.emailVerified || false;
  const inscPendientes = inscripciones.filter(
    (i) => i.status !== "confirmada" && i.status !== "rechazada",
  );
  const inscConfirmadas = inscripciones.filter(
    (i) => i.status === "confirmada",
  );

  return (
    <div className="max-w-2xl mx-auto">
      <h1
        className="text-xl font-bold mb-1"
        style={{ color: "var(--text-primary)" }}
      >
        Mi perfil
      </h1>
      <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
        {rol === "jugador"
          ? "Jugador"
          : rol === "club"
            ? "Administrador de club"
            : "Organizador de torneos"}
      </p>

      {/* Verificación de email */}
      {!emailVerificado && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-yellow-700 font-semibold text-sm">
                Email no verificado
              </p>
              <p className="text-yellow-600 text-xs mt-0.5">
                Verificá tu email para mayor seguridad
              </p>
            </div>
            {emailEnviado ? (
              <span className="text-xs text-green-600 font-semibold">
                Email enviado ✓
              </span>
            ) : (
              <button
                onClick={handleVerificarEmail}
                disabled={verificandoEmail}
                className="px-3 py-1 rounded-lg text-xs font-semibold bg-yellow-500 text-white hover:bg-yellow-600 transition disabled:opacity-50"
              >
                {verificandoEmail ? "Enviando..." : "Verificar email"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ========== PERFIL JUGADOR ========== */}
      {rol === "jugador" && (
        <>
          {/* Foto de perfil */}
          <div className="flex flex-col items-center mb-4">
            <div className="relative group">
              {fotoUrl ? (
                <img src={fotoUrl} alt="Foto de perfil" className="w-20 h-20 rounded-full object-cover ring-2" style={{ ringColor: "var(--accent)" }} />
              ) : (
                <div className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white" style={{ backgroundColor: "var(--accent)" }}>
                  {(userData?.nombre || user?.email || "J").charAt(0).toUpperCase()}
                </div>
              )}
              <label className="absolute inset-0 flex items-center justify-center rounded-full cursor-pointer bg-black/40 opacity-0 group-hover:opacity-100 transition">
                <span className="text-white text-xs font-semibold">{subiendoFoto ? "..." : "📷"}</span>
                <input type="file" accept="image/*" onChange={handleSubirFoto} disabled={subiendoFoto} className="hidden" />
              </label>
            </div>
            <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
              {subiendoFoto ? "Subiendo foto..." : "Tocá para cambiar foto"}
            </p>
          </div>

          {userData &&
            (!userData.telefono ||
              !userData.nivel ||
              !userData.genero ||
              !userData.nacimiento) && (
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-4">
                <p className="text-blue-700 font-semibold text-sm">
                  Completá tu perfil
                </p>
                <p className="text-blue-600 text-xs mt-0.5">
                  Necesitamos tus datos para inscribirte a torneos.
                  {!userData.telefono && " Falta: teléfono."}
                  {!userData.nivel && " Falta: categoría."}
                  {!userData.genero && " Falta: género."}
                  {!userData.nacimiento && " Falta: nacimiento."}
                </p>
                <button
                  onClick={() => setEditando(true)}
                  className="mt-2 px-3 py-1 rounded-lg text-xs font-semibold bg-blue-500 text-white hover:bg-blue-600 transition"
                >
                  Completar ahora
                </button>
              </div>
            )}

          {/* Datos personales */}
          <div className="themed-card rounded-2xl p-5 border mb-4">
            <div className="flex items-center justify-between mb-4">
              <h2
                className="font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                Datos personales
              </h2>
              {!editando ? (
                <button
                  onClick={() => setEditando(true)}
                  className="text-xs font-semibold hover:underline"
                  style={{ color: "var(--accent)" }}
                >
                  Editar
                </button>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditando(false)}
                    className="text-xs font-semibold"
                    style={{ color: "var(--text-muted)" }}
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleGuardar}
                    disabled={guardando}
                    className="text-xs font-semibold hover:underline disabled:opacity-50"
                    style={{ color: "var(--accent)" }}
                  >
                    {guardando ? "Guardando..." : "Guardar"}
                  </button>
                </div>
              )}
            </div>
            {!editando ? (
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Nombre", userData.nombre],
                  ["Email", userData.email],
                  ["Teléfono", userData.telefono],
                  ["Provincia", userData.provincia],
                  ["Nacimiento", userData.nacimiento],
                  ["Género", userData.genero],
                ].map(([label, val]) => (
                  <div key={label}>
                    <span
                      className="block"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {label}
                    </span>
                    <span
                      className="font-medium capitalize"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {val || "—"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div>
                  <label
                    className={labelClass}
                    style={{ color: "var(--text-muted)" }}
                  >
                    Nombre
                  </label>
                  <input
                    type="text"
                    value={editForm.nombre}
                    onChange={(e) =>
                      setEditField("nombre", e.target.value)
                    }
                    className={inputClass}
                  />
                </div>
                <div>
                  <label
                    className={labelClass}
                    style={{ color: "var(--text-muted)" }}
                  >
                    Teléfono
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: 385 1234567"
                    value={editForm.telefono}
                    onChange={(e) =>
                      setEditField("telefono", e.target.value)
                    }
                    className={inputClass}
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label
                      className={labelClass}
                      style={{ color: "var(--text-muted)" }}
                    >
                      Provincia
                    </label>
                    <input
                      type="text"
                      value={editForm.provincia}
                      onChange={(e) =>
                        setEditField("provincia", e.target.value)
                      }
                      className={inputClass}
                    />
                  </div>
                  <div className="flex-1">
                    <label
                      className={labelClass}
                      style={{ color: "var(--text-muted)" }}
                    >
                      Nacimiento
                    </label>
                    <input
                      type="date"
                      value={editForm.nacimiento}
                      onChange={(e) =>
                        setEditField("nacimiento", e.target.value)
                      }
                      className={inputClass}
                    />
                  </div>
                </div>
                <div>
                  <label
                    className={labelClass}
                    style={{ color: "var(--text-muted)" }}
                  >
                    Género
                  </label>
                  <select
                    value={editForm.genero}
                    onChange={(e) =>
                      setEditField("genero", e.target.value)
                    }
                    className={inputClass}
                  >
                    <option value="">Seleccionar</option>
                    <option value="masculino">Masculino</option>
                    <option value="femenino">Femenino</option>
                    <option value="otro">Otro</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Datos de juego */}
          <div className="themed-card rounded-2xl p-5 border mb-4">
            <h2
              className="font-semibold mb-4"
              style={{ color: "var(--text-primary)" }}
            >
              Datos de juego
            </h2>
            {!editando ? (
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Categoría", userData.nivel || "Sin asignar"],
                  ["Mano hábil", userData.manoHabil],
                  ["Posición", userData.posicionPreferida],
                  ["Puntos", userData.puntos || 0],
                ].map(([l, v]) => (
                  <div key={l}>
                    <span
                      className="block"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {l}
                    </span>
                    <span
                      className="font-medium capitalize"
                      style={{
                        color:
                          l === "Puntos"
                            ? "var(--accent)"
                            : "var(--text-primary)",
                      }}
                    >
                      {v || "—"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <div>
                  <label
                    className={labelClass}
                    style={{ color: "var(--text-muted)" }}
                  >
                    Categoría
                  </label>
                  <select
                    value={editForm.nivel}
                    onChange={(e) =>
                      setEditField("nivel", e.target.value)
                    }
                    className={inputClass}
                  >
                    <option value="">Sin asignar</option>
                    {categoriasNivel.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    className={labelClass}
                    style={{ color: "var(--text-muted)" }}
                  >
                    Mano hábil
                  </label>
                  <select
                    value={editForm.manoHabil}
                    onChange={(e) =>
                      setEditField("manoHabil", e.target.value)
                    }
                    className={inputClass}
                  >
                    <option value="">Seleccionar</option>
                    <option value="derecha">Derecha</option>
                    <option value="izquierda">Izquierda</option>
                    <option value="ambidiestro">Ambidiestro</option>
                  </select>
                </div>
                <div>
                  <label
                    className={labelClass}
                    style={{ color: "var(--text-muted)" }}
                  >
                    Posición preferida
                  </label>
                  <select
                    value={editForm.posicionPreferida}
                    onChange={(e) =>
                      setEditField("posicionPreferida", e.target.value)
                    }
                    className={inputClass}
                  >
                    <option value="">Seleccionar</option>
                    <option value="drive">Drive (derecha)</option>
                    <option value="reves">Revés (izquierda)</option>
                    <option value="ambas">Ambas</option>
                  </select>
                </div>
              </div>
            )}

            <button
              onClick={() => setMostrarInfoPuntos(!mostrarInfoPuntos)}
              className="text-xs font-semibold px-2 py-1 rounded-lg transition mt-3"
              style={{ backgroundColor: "var(--bg-card-hover)", color: "var(--accent)" }}
            >
              {mostrarInfoPuntos ? "Cerrar" : "¿Cómo funciona?"}
            </button>

            {mostrarInfoPuntos && (
              <div className="rounded-xl p-4 mt-3 border" style={{ backgroundColor: "var(--bg-card-hover)", borderColor: "var(--border-card)" }}>
                <h3 className="text-sm font-semibold mb-2" style={{ color: "var(--text-primary)" }}>Sistema de puntos y categorías</h3>
                <div className="flex flex-col gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
                  <div>
                    <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Puntos por partido:</p>
                    <p>Ganar partido: +10 pts · Ganar set: +3 pts · Perder partido: +2 pts</p>
                  </div>
                  <div>
                    <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Bonus por torneo:</p>
                    <p>Campeón: +50 pts · Subcampeón: +25 pts</p>
                  </div>
                  <div>
                    <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Multiplicador por categoría:</p>
                    <p>Jugar en categoría superior: x1.5 o x2</p>
                  </div>
                  <div>
                    <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Ascenso automático:</p>
                    <p>A) 150 pts + 2 victorias · B) 300 pts + 1 victoria · C) 500 pts (experiencia)</p>
                  </div>
                  <div>
                    <p className="font-semibold" style={{ color: "var(--text-primary)" }}>Categorías:</p>
                    <p>8va → 7ma → 6ta → 5ta → 4ta → 3era → 2da → 1era → Libre</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Estadísticas */}
          <div className="themed-card rounded-2xl p-5 border mb-4">
            <h2
              className="font-semibold mb-3"
              style={{ color: "var(--text-primary)" }}
            >
              Estadísticas
            </h2>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                ["Torneos jugados", userData.torneosJugados || 0, "#3b82f6"],
                [
                  "Torneos ganados",
                  userData.torneosGanados || 0,
                  "var(--accent)",
                ],
                ["Puntos", userData.puntos || 0, "#8b5cf6"],
              ].map(([l, v, c]) => (
                <div
                  key={l}
                  className="rounded-xl p-4"
                  style={{ backgroundColor: "var(--bg-card-hover)" }}
                >
                  <p className="text-2xl font-bold" style={{ color: c }}>
                    {v}
                  </p>
                  <p
                    className="text-xs mt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {l}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Inscripciones y torneos */}
          {inscPendientes.length > 0 && (
            <div className="themed-card rounded-2xl p-5 border border-orange-200 mb-4">
              <h2 className="font-semibold text-orange-700 mb-3">
                Inscripciones pendientes ({inscPendientes.length})
              </h2>
              <div className="flex flex-col gap-2">
                {inscPendientes.map((i) => (
                  <div
                    key={i.id}
                    className="flex items-center justify-between rounded-xl px-4 py-3"
                    style={{ backgroundColor: "var(--bg-card-hover)" }}
                  >
                    <div>
                      <p
                        className="text-sm font-semibold"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {i.torneoNombre}
                      </p>
                    </div>
                    <span className="text-xs font-semibold px-2 py-1 rounded-full bg-orange-100 text-orange-600 capitalize">
                      {(i.status || "").replace(/_/g, " ")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {inscConfirmadas.length > 0 && (
            <div className="themed-card rounded-2xl p-5 border mb-4">
              <h2
                className="font-semibold mb-3"
                style={{ color: "var(--text-primary)" }}
              >
                Mis torneos ({inscConfirmadas.length})
              </h2>
              <div className="flex flex-col gap-2">
                {inscConfirmadas.map((i) => (
                  <div
                    key={i.id}
                    onClick={() => navigate(`/torneos/${i.torneoId}`)}
                    className="flex items-center justify-between rounded-xl px-4 py-3 cursor-pointer transition"
                    style={{ backgroundColor: "var(--bg-card-hover)" }}
                  >
                    <p
                      className="text-sm font-semibold"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {i.torneoNombre}
                    </p>
                    <span
                      className="text-xs font-semibold px-2 py-1 rounded-full"
                      style={{
                        backgroundColor: "var(--accent-light)",
                        color: "var(--accent)",
                      }}
                    >
                      Confirmada
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Historial de partidos */}
          <div className="themed-card rounded-2xl p-5 border mb-4">
            <div className="flex items-center justify-between">
              <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>Historial de partidos</h2>
              {!mostrarHistorial && (
                <button
                  onClick={async () => {
                    setCargandoHistorial(true);
                    setMostrarHistorial(true);
                    try {
                      const data = await getHistorialPartidos(user.uid);
                      setHistorial(data);
                    } catch (err) { console.error("Error cargando historial:", err); }
                    setCargandoHistorial(false);
                  }}
                  className="text-xs font-semibold px-3 py-1.5 rounded-lg transition"
                  style={{ backgroundColor: "var(--accent)", color: "white" }}
                >
                  Ver historial
                </button>
              )}
            </div>

            {mostrarHistorial && cargandoHistorial && (
              <div className="text-center py-6" style={{ color: "var(--text-muted)" }}>
                <p className="text-sm">Cargando historial...</p>
              </div>
            )}

            {mostrarHistorial && !cargandoHistorial && historial.length === 0 && (
              <div className="text-center py-6">
                <div className="text-3xl mb-2">🎾</div>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Todavía no tenés partidos registrados
                </p>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  Participá en un torneo para ver tu historial acá
                </p>
              </div>
            )}

            {mostrarHistorial && !cargandoHistorial && historial.length > 0 && (
              <div className="flex flex-col gap-2 mt-3">
                <div className="flex gap-3 mb-2">
                  <div className="flex-1 rounded-xl p-3 text-center" style={{ backgroundColor: "rgba(34,197,94,0.08)" }}>
                    <p className="text-lg font-bold text-green-600">{historial.filter(h => h.gane).length}</p>
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Victorias</p>
                  </div>
                  <div className="flex-1 rounded-xl p-3 text-center" style={{ backgroundColor: "rgba(239,68,68,0.08)" }}>
                    <p className="text-lg font-bold text-red-400">{historial.filter(h => !h.gane).length}</p>
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Derrotas</p>
                  </div>
                  <div className="flex-1 rounded-xl p-3 text-center" style={{ backgroundColor: "var(--bg-card-hover)" }}>
                    <p className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{historial.length}</p>
                    <p className="text-[10px]" style={{ color: "var(--text-muted)" }}>Partidos</p>
                  </div>
                </div>

                {historial.map((m, i) => (
                  <div key={i} className="rounded-xl px-4 py-3" style={{ backgroundColor: "var(--bg-card-hover)" }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold" style={{ color: "var(--accent)" }}>{m.torneoNombre}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ backgroundColor: "var(--bg-card)", color: "var(--text-muted)" }}>
                        {m.fase}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <p className="text-xs" style={{ color: "var(--text-muted)" }}>vs</p>
                        <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{m.rival}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs font-bold px-2 py-1 rounded-lg ${m.gane ? "bg-green-100 text-green-700" : "bg-red-100 text-red-400"}`}>
                          {m.gane ? "Victoria" : "Derrota"}
                        </span>
                        <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                          {m.resultado.sets.map(s => `${s.g1}-${s.g2}`).join(" / ")}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Sticky save bar */}
          {editando && perfilModificado && (
            <div className="fixed bottom-20 left-0 right-0 z-30 px-4">
              <div className="max-w-2xl mx-auto">
                <button
                  onClick={handleGuardar}
                  disabled={guardando}
                  className="w-full py-3 rounded-xl text-sm font-semibold text-white shadow-lg transition disabled:opacity-50"
                  style={{ backgroundColor: "var(--accent)" }}
                >
                  {guardando ? "Guardando..." : "Guardar cambios"}
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* ========== PERFIL CLUB ========== */}
      {rol === "club" && (
        <>
          <div className="themed-card rounded-2xl p-5 border mb-4">
            <h2
              className="font-semibold mb-4"
              style={{ color: "var(--text-primary)" }}
            >
              Datos del club
            </h2>
            {club ? (
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Nombre", club.nombre],
                  ["Dirección", club.direccion],
                  ["Ciudad", club.ciudad],
                  ["Provincia", club.provincia],
                  ["Teléfono", club.telefono],
                  ["Email", club.email],
                ].map(([l, v]) => (
                  <div key={l}>
                    <span
                      className="block"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {l}
                    </span>
                    <span
                      className="font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {v || "—"}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ color: "var(--text-muted)" }} className="text-sm">
                No se encontraron datos del club
              </p>
            )}
          </div>

          {club && (
            <div className="themed-card rounded-2xl p-5 border mb-4">
              <h2
                className="font-semibold mb-3"
                style={{ color: "var(--text-primary)" }}
              >
                Redes sociales
              </h2>
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["Instagram", club.instagram],
                  ["Facebook", club.facebook],
                  ["WhatsApp", club.whatsapp],
                  ["Web", club.website],
                ].map(([l, v]) => (
                  <div key={l}>
                    <span
                      className="block"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {l}
                    </span>
                    <span
                      className="font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {v || "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button
            onClick={() => navigate("/admin")}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white transition hover:opacity-90 mb-4"
            style={{ backgroundColor: "var(--accent)" }}
          >
            Ir al panel de administración
          </button>
        </>
      )}

      {/* ========== PERFIL ORGANIZADOR ========== */}
      {rol === "organizador" && (
        <>
          <div className="themed-card rounded-2xl p-5 border mb-4">
            <h2
              className="font-semibold mb-4"
              style={{ color: "var(--text-primary)" }}
            >
              Datos de la entidad
            </h2>
            {entidad ? (
              <div className="flex flex-col gap-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  {[
                    ["Nombre", entidad.nombre],
                    ["Teléfono", entidad.telefono],
                    ["Email", entidad.email],
                    ["Ciudad", entidad.ciudad],
                    ["Provincia", entidad.provincia],
                  ].map(([l, v]) => (
                    <div key={l}>
                      <span
                        className="block"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {l}
                      </span>
                      <span
                        className="font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {v || "—"}
                      </span>
                    </div>
                  ))}
                </div>
                {entidad.bio && (
                  <div>
                    <span
                      className="block"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Descripción
                    </span>
                    <p
                      className="text-sm mt-1"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {entidad.bio}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p style={{ color: "var(--text-muted)" }} className="text-sm">
                No se encontró la entidad
              </p>
            )}
          </div>

          {/* Estadísticas org */}
          <div className="themed-card rounded-2xl p-5 border mb-4">
            <h2
              className="font-semibold mb-3"
              style={{ color: "var(--text-primary)" }}
            >
              Mis torneos
            </h2>
            <div className="grid grid-cols-3 gap-3 text-center mb-3">
              {[
                ["Total", torneosOrg.length, "#3b82f6"],
                [
                  "Activos",
                  torneosOrg.filter(
                    (t) =>
                      t.status === "inscripcion" || t.status === "en_curso",
                  ).length,
                  "var(--accent)",
                ],
                [
                  "Finalizados",
                  torneosOrg.filter((t) => t.status === "finalizado").length,
                  "#8b5cf6",
                ],
              ].map(([l, v, c]) => (
                <div
                  key={l}
                  className="rounded-xl p-4"
                  style={{ backgroundColor: "var(--bg-card-hover)" }}
                >
                  <p className="text-2xl font-bold" style={{ color: c }}>
                    {v}
                  </p>
                  <p
                    className="text-xs mt-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {l}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={() => navigate("/org")}
            className="w-full py-3 rounded-xl text-sm font-semibold text-white transition hover:opacity-90 mb-4 bg-blue-600 hover:bg-blue-700"
          >
            Ir al panel de organizador
          </button>
        </>
      )}

      {/* Acciones de cuenta — todos los roles */}
      <div className="themed-card rounded-2xl p-5 border mb-8">
        <h2
          className="font-semibold mb-3"
          style={{ color: "var(--text-primary)" }}
        >
          Cuenta
        </h2>
        <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
          {userData.email}
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={handleCerrarSesion}
            className="w-full py-2 rounded-xl text-sm font-semibold transition"
            style={{
              backgroundColor: "var(--bg-card-hover)",
              color: "var(--text-secondary)",
            }}
          >
            Cerrar sesión
          </button>
          <button
            onClick={handleEliminarCuenta}
            className="w-full py-2 rounded-xl text-sm font-semibold bg-red-50 text-red-500 hover:bg-red-100 transition"
          >
            Eliminar cuenta
          </button>
        </div>
      </div>
    </div>
  );
}
