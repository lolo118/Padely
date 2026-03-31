import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { getUserData } from "../services/authService";
import { doc, updateDoc, deleteDoc } from "firebase/firestore";
import { db, auth } from "../lib/firebase";
import { sendEmailVerification, deleteUser, signOut } from "firebase/auth";
import { getInscripcionesByJugador } from "../services/torneoService";

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
  const [inscripciones, setInscripciones] = useState([]);
  const [verificandoEmail, setVerificandoEmail] = useState(false);
  const [emailEnviado, setEmailEnviado] = useState(false);

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

  useEffect(() => {
    if (!user) return;
    const cargar = async () => {
      try {
        const data = await getUserData(user.uid);
        if (data) {
          setUserData(data);
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
        }
        const insc = await getInscripcionesByJugador(user.uid);
        setInscripciones(insc);
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
      console.error("Error al enviar verificación:", err);
    }
    setVerificandoEmail(false);
  };

  const handleCerrarSesion = async () => {
    try {
      await signOut(auth);
      setUser(null);
      navigate("/login");
    } catch (err) {
      console.error("Error al cerrar sesión:", err);
    }
  };

  const handleEliminarCuenta = async () => {
    if (
      !window.confirm(
        "¿Estás seguro? Esta acción es irreversible. Se eliminarán todos tus datos.",
      )
    )
      return;
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
      console.error("Error al eliminar cuenta:", err);
      if (err.code === "auth/requires-recent-login") {
        alert(
          "Por seguridad, necesitás cerrar sesión e iniciar sesión de nuevo antes de eliminar tu cuenta.",
        );
      }
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>Cargando perfil...</div>
    );
  }

  if (!userData) {
    return (
      <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>
        No se encontró tu perfil
      </div>
    );
  }

  const emailVerificado = auth.currentUser?.emailVerified || false;

  const inscPendientes = inscripciones.filter(
    (i) => i.status !== "confirmada" && i.status !== "rechazada",
  );
  const inscConfirmadas = inscripciones.filter(
    (i) => i.status === "confirmada",
  );

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-bold mb-6" style={{ color: "var(--text-primary)" }}>Mi perfil</h1>

      {/* Verificación de email */}
      {!emailVerificado && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 mb-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-yellow-700 font-semibold text-sm">
                Email no verificado
              </p>
              <p className="text-yellow-600 text-xs mt-0.5">
                Verificá tu email para acceder a todas las funcionalidades
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

      {emailVerificado && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-3 mb-4 flex items-center gap-2">
          <span className="text-green-600 text-sm">✓</span>
          <span className="text-green-700 text-sm font-semibold">
            Cuenta verificada
          </span>
        </div>
      )}

      {/* Recordatorio completar perfil */}
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
              Necesitamos tus datos completos para que puedas inscribirte a
              torneos y acceder a todas las funciones.
              {!userData.telefono && " Falta: teléfono."}
              {!userData.nivel && " Falta: categoría."}
              {!userData.genero && " Falta: género."}
              {!userData.nacimiento && " Falta: fecha de nacimiento."}
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
          <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>Datos personales</h2>
          {!editando ? (
            <button
              onClick={() => setEditando(true)}
              className="text-xs font-semibold text-green-600 hover:underline"
            >
              Editar
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setEditando(false)}
                className="text-xs font-semibold hover:opacity-80"
                style={{ color: "var(--text-muted)" }}
              >
                Cancelar
              </button>
              <button
                onClick={handleGuardar}
                disabled={guardando}
                className="text-xs font-semibold text-green-600 hover:underline disabled:opacity-50"
              >
                {guardando ? "Guardando..." : "Guardar"}
              </button>
            </div>
          )}
        </div>

        {!editando ? (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="block" style={{ color: "var(--text-muted)" }}>Nombre</span>
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                {userData.nombre || "—"}
              </span>
            </div>
            <div>
              <span className="block" style={{ color: "var(--text-muted)" }}>Email</span>
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                {userData.email}
              </span>
            </div>
            <div>
              <span className="block" style={{ color: "var(--text-muted)" }}>Teléfono</span>
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                {userData.telefono || "—"}
              </span>
            </div>
            <div>
              <span className="block" style={{ color: "var(--text-muted)" }}>Provincia</span>
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                {userData.provincia || "—"}
              </span>
            </div>
            <div>
              <span className="block" style={{ color: "var(--text-muted)" }}>Fecha de nacimiento</span>
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                {userData.nacimiento || "—"}
              </span>
            </div>
            <div>
              <span className="block" style={{ color: "var(--text-muted)" }}>Género</span>
              <span className="font-medium capitalize" style={{ color: "var(--text-primary)" }}>
                {userData.genero || "—"}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <label className={labelClass} style={{ color: "var(--text-muted)" }}>Nombre</label>
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
              <label className={labelClass} style={{ color: "var(--text-muted)" }}>Teléfono</label>
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
                <label className={labelClass} style={{ color: "var(--text-muted)" }}>Provincia</label>
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
                <label className={labelClass} style={{ color: "var(--text-muted)" }}>Fecha de nacimiento</label>
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
              <label className={labelClass} style={{ color: "var(--text-muted)" }}>Género</label>
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
        <h2 className="font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Datos de juego</h2>
        {!editando ? (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="block" style={{ color: "var(--text-muted)" }}>Categoría/Nivel</span>
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                {userData.nivel || "Sin asignar"}
              </span>
            </div>
            <div>
              <span className="block" style={{ color: "var(--text-muted)" }}>Mano hábil</span>
              <span className="font-medium capitalize" style={{ color: "var(--text-primary)" }}>
                {userData.manoHabil || "—"}
              </span>
            </div>
            <div>
              <span className="block" style={{ color: "var(--text-muted)" }}>Posición preferida</span>
              <span className="font-medium capitalize" style={{ color: "var(--text-primary)" }}>
                {userData.posicionPreferida || "—"}
              </span>
            </div>
            <div>
              <span className="block" style={{ color: "var(--text-muted)" }}>Puntos acumulados</span>
              <span className="font-medium text-green-600 text-lg">
                {userData.puntos || 0}
              </span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div>
              <label className={labelClass} style={{ color: "var(--text-muted)" }}>Categoría/Nivel</label>
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
              <label className={labelClass} style={{ color: "var(--text-muted)" }}>Mano hábil</label>
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
              <label className={labelClass} style={{ color: "var(--text-muted)" }}>Posición preferida</label>
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
        <h2 className="font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Estadísticas</h2>
        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-blue-50 rounded-xl p-4">
            <p className="text-2xl font-bold text-blue-600">
              {userData.torneosJugados || 0}
            </p>
            <p className="text-xs text-blue-500 mt-1">Torneos jugados</p>
          </div>
          <div className="bg-green-50 rounded-xl p-4">
            <p className="text-2xl font-bold text-green-600">
              {userData.torneosGanados || 0}
            </p>
            <p className="text-xs text-green-500 mt-1">Torneos ganados</p>
          </div>
          <div className="bg-purple-50 rounded-xl p-4">
            <p className="text-2xl font-bold text-purple-600">
              {userData.puntos || 0}
            </p>
            <p className="text-xs text-purple-500 mt-1">Puntos</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3 text-center">
          <div className="bg-green-50 rounded-xl p-3">
            <p className="text-xl font-bold text-green-600">
              {userData.partidosGanados || 0}
            </p>
            <p className="text-xs text-green-500">Partidos ganados</p>
          </div>
          <div className="bg-red-50 rounded-xl p-3">
            <p className="text-xl font-bold text-red-400">
              {userData.partidosPerdidos || 0}
            </p>
            <p className="text-xs text-red-400">Partidos perdidos</p>
          </div>
        </div>
      </div>

      {/* Inscripciones pendientes */}
      {inscPendientes.length > 0 && (
        <div className="themed-card rounded-2xl p-5 border border-orange-200 mb-4">
          <h2 className="font-semibold text-orange-700 mb-3">
            Inscripciones pendientes ({inscPendientes.length})
          </h2>
          <div className="flex flex-col gap-2">
            {inscPendientes.map((insc) => (
              <div
                key={insc.id}
                className="flex items-center justify-between rounded-xl px-4 py-3"
                style={{ backgroundColor: "var(--bg-card-hover)" }}
              >
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {insc.torneoNombre}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {insc.apellido1}-{insc.apellido2}
                  </p>
                </div>
                <span className="text-xs font-semibold px-2 py-1 rounded-full bg-orange-100 text-orange-600 capitalize">
                  {insc.status.replace(/_/g, " ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Torneos confirmados */}
      {inscConfirmadas.length > 0 && (
        <div className="themed-card rounded-2xl p-5 border mb-4">
          <h2 className="font-semibold mb-3" style={{ color: "var(--text-primary)" }}>
            Mis torneos ({inscConfirmadas.length})
          </h2>
          <div className="flex flex-col gap-2">
            {inscConfirmadas.map((insc) => (
              <div
                key={insc.id}
                onClick={() => navigate(`/torneos/${insc.torneoId}`)}
                className="flex items-center justify-between rounded-xl px-4 py-3 cursor-pointer transition"
                style={{ backgroundColor: "var(--bg-card-hover)" }}
              >
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {insc.torneoNombre}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {insc.apellido1}-{insc.apellido2}
                  </p>
                </div>
                <span className="text-xs font-semibold px-2 py-1 rounded-full bg-green-100 text-green-600">
                  Confirmada
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Acciones de cuenta */}
      <div className="themed-card rounded-2xl p-5 border mb-8">
        <h2 className="font-semibold mb-3" style={{ color: "var(--text-primary)" }}>Cuenta</h2>
        <div className="flex flex-col gap-2">
          <button
            onClick={handleCerrarSesion}
            className="w-full py-2 rounded-xl text-sm font-semibold transition"
            style={{ backgroundColor: "var(--bg-card-hover)", color: "var(--text-secondary)" }}
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
