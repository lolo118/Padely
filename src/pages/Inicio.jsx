import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { getUserData } from "../services/authService";
import { getInscripcionesByJugador } from "../services/torneoService";

export default function Inicio() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [userData, setUserData] = useState(null);
  const [inscripciones, setInscripciones] = useState([]);
  const [loading, setLoading] = useState(true);

  const nombre = user?.displayName || user?.email?.split("@")[0] || "Jugador";

  useEffect(() => {
    if (!user) return;
    const cargar = async () => {
      try {
        const [data, insc] = await Promise.all([
          getUserData(user.uid),
          getInscripcionesByJugador(user.uid),
        ]);
        if (data) setUserData(data);
        setInscripciones(insc);
      } catch (err) {
        console.error("Error:", err);
      }
      setLoading(false);
    };
    cargar();
  }, [user]);

  if (loading) {
    return <div className="text-center text-slate-400 py-12">Cargando...</div>;
  }

  const inscPendientes = inscripciones.filter(
    (i) => i.status !== "confirmada" && i.status !== "rechazada",
  );
  const inscConfirmadas = inscripciones.filter(
    (i) => i.status === "confirmada",
  );
  const perfilIncompleto =
    userData && (!userData.telefono || !userData.nivel || !userData.genero);

  const hora = new Date().getHours();
  const saludo =
    hora < 12 ? "Buenos días" : hora < 19 ? "Buenas tardes" : "Buenas noches";

  return (
    <div>
      {/* Saludo */}
      <div className="mb-6">
        <p className="text-slate-400 text-sm">{saludo}</p>
        <h1 className="text-2xl font-bold text-slate-800">{nombre}</h1>
      </div>

      {/* Perfil incompleto */}
      {perfilIncompleto && (
        <div
          onClick={() => navigate("/perfil")}
          className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-2xl p-4 mb-4 cursor-pointer hover:shadow-md transition"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center">
              <span className="text-lg">⚠️</span>
            </div>
            <div>
              <p className="text-amber-800 font-semibold text-sm">
                Completá tu perfil
              </p>
              <p className="text-amber-600 text-xs">
                Necesitamos tus datos para inscribirte a torneos
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Accesos rápidos */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <div
          onClick={() => navigate("/hub")}
          className="bg-white rounded-2xl p-5 border border-slate-200 cursor-pointer card-hover"
        >
          <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center mb-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#059669"
              strokeWidth="1.8"
              className="w-5 h-5"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="12" y1="3" x2="12" y2="21" />
              <line x1="3" y1="12" x2="21" y2="12" />
            </svg>
          </div>
          <p className="font-semibold text-slate-700 text-sm">
            Reservar cancha
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            Ver canchas disponibles
          </p>
        </div>

        <div
          onClick={() => navigate("/torneos")}
          className="bg-white rounded-2xl p-5 border border-slate-200 cursor-pointer card-hover"
        >
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mb-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#3b82f6"
              strokeWidth="1.8"
              className="w-5 h-5"
            >
              <path d="M6 9H4.5a2.5 2.5 0 010-5H6" />
              <path d="M18 9h1.5a2.5 2.5 0 000-5H18" />
              <path d="M4 22h16" />
              <path d="M18 2H6v7a6 6 0 0012 0V2Z" />
            </svg>
          </div>
          <p className="font-semibold text-slate-700 text-sm">Torneos</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Inscribite o mirá resultados
          </p>
        </div>

        <div
          onClick={() => navigate("/perfil")}
          className="bg-white rounded-2xl p-5 border border-slate-200 cursor-pointer card-hover"
        >
          <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center mb-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#8b5cf6"
              strokeWidth="1.8"
              className="w-5 h-5"
            >
              <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
          <p className="font-semibold text-slate-700 text-sm">Mi perfil</p>
          <p className="text-xs text-slate-400 mt-0.5">Datos y estadísticas</p>
        </div>

        <div
          onClick={() => navigate("/marketplace")}
          className="bg-white rounded-2xl p-5 border border-slate-200 cursor-pointer card-hover"
        >
          <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center mb-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#f97316"
              strokeWidth="1.8"
              className="w-5 h-5"
            >
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <path d="M16 10a4 4 0 01-8 0" />
            </svg>
          </div>
          <p className="font-semibold text-slate-700 text-sm">Tienda</p>
          <p className="text-xs text-slate-400 mt-0.5">
            Equipamiento y accesorios
          </p>
        </div>
      </div>

      {/* Inscripciones pendientes */}
      {inscPendientes.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-amber-200 mb-4">
          <h2 className="font-semibold text-slate-700 text-sm mb-3">
            Inscripciones pendientes ({inscPendientes.length})
          </h2>
          <div className="flex flex-col gap-2">
            {inscPendientes.map((insc) => (
              <div
                key={insc.id}
                onClick={() => navigate(`/torneos/${insc.torneoId}`)}
                className="flex items-center justify-between bg-amber-50 rounded-xl px-4 py-3 cursor-pointer hover:bg-amber-100 transition"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    {insc.torneoNombre}
                  </p>
                  <p className="text-xs text-slate-400">
                    {insc.apellido1}-{insc.apellido2}
                  </p>
                </div>
                <span className="text-xs font-semibold px-2 py-1 rounded-full bg-amber-100 text-amber-700 capitalize">
                  {(insc.status || "").replace(/_/g, " ")}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mis torneos */}
      {inscConfirmadas.length > 0 && (
        <div className="bg-white rounded-2xl p-5 border border-slate-200 mb-4">
          <h2 className="font-semibold text-slate-700 text-sm mb-3">
            Mis torneos activos
          </h2>
          <div className="flex flex-col gap-2">
            {inscConfirmadas.slice(0, 3).map((insc) => (
              <div
                key={insc.id}
                onClick={() => navigate(`/torneos/${insc.torneoId}`)}
                className="flex items-center justify-between bg-emerald-50 rounded-xl px-4 py-3 cursor-pointer hover:bg-emerald-100 transition"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-700">
                    {insc.torneoNombre}
                  </p>
                  <p className="text-xs text-slate-400">
                    {insc.apellido1}-{insc.apellido2}
                  </p>
                </div>
                <span className="text-xs font-semibold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">
                  Inscripto
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Estado vacío */}
      {inscPendientes.length === 0 && inscConfirmadas.length === 0 && (
        <div className="bg-white rounded-2xl p-8 border border-slate-200 text-center">
          <div className="text-4xl mb-3">🏸</div>
          <p className="text-slate-600 font-semibold">¡Bienvenido a Padely!</p>
          <p className="text-slate-400 text-sm mt-1">
            Reservá una cancha o inscribite a un torneo para empezar
          </p>
        </div>
      )}
    </div>
  );
}
