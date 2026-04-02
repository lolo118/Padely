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
} from "../services/torneoService";
import { getClubByOwner } from "../services/canchaService";

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
    } catch (err) {
      console.error("Error al guardar:", err);
    }
    setGuardando(false);
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
                      setEditForm({ ...editForm, nombre: e.target.value })
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
                      setEditForm({ ...editForm, telefono: e.target.value })
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
                        setEditForm({ ...editForm, provincia: e.target.value })
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
                        setEditForm({ ...editForm, nacimiento: e.target.value })
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
                      setEditForm({ ...editForm, genero: e.target.value })
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
                      setEditForm({ ...editForm, nivel: e.target.value })
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
                      setEditForm({ ...editForm, manoHabil: e.target.value })
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
                      setEditForm({
                        ...editForm,
                        posicionPreferida: e.target.value,
                      })
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
