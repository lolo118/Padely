import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import {
  getClubesConCanchas,
  getReservas,
  getTurnosFijos,
} from "../services/canchaService";
import { doc, updateDoc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";

export default function Hub() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [clubes, setClubes] = useState([]);
  const [fechaSeleccionada, setFechaSeleccionada] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [reservasPorClub, setReservasPorClub] = useState({});
  const [turnosFijosPorClub, setTurnosFijosPorClub] = useState({});
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtroSuperficie, setFiltroSuperficie] = useState("");
  const [filtroTechada, setFiltroTechada] = useState("");
  const [favoritos, setFavoritos] = useState([]);

  useEffect(() => {
    const cargarFavoritos = async () => {
      if (!user) return;
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) setFavoritos(snap.data().favoritos || []);
      } catch {}
    };
    cargarFavoritos();
  }, [user]);

  useEffect(() => {
    const cargar = async () => {
      setCargando(true);
      try {
        const data = await getClubesConCanchas();
        setClubes(data);
        const reservasMap = {};
        const turnosMap = {};
        for (const club of data) {
          try {
            const [reservas, tf] = await Promise.all([
              getReservas(club.id, fechaSeleccionada),
              getTurnosFijos(club.id),
            ]);
            reservasMap[club.id] = reservas;
            turnosMap[club.id] = tf;
          } catch {
            reservasMap[club.id] = [];
            turnosMap[club.id] = [];
          }
        }
        setReservasPorClub(reservasMap);
        setTurnosFijosPorClub(turnosMap);
      } catch (err) {
        console.error("Error al cargar clubes:", err);
      }
      setCargando(false);
    };
    cargar();
  }, [fechaSeleccionada]);

  const estaOcupado = (clubId, canchaId, hora) => {
    const reservas = reservasPorClub[clubId] || [];
    return reservas.some(
      (r) => r.canchaId === canchaId && r.hora === hora && r.status !== "cancelada"
    );
  };

  const esTurnoFijoHub = (clubId, canchaId, hora) => {
    const partes = fechaSeleccionada.split("-");
    const hoy = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
    const diasMap = { 0: "Domingo", 1: "Lunes", 2: "Martes", 3: "Miércoles", 4: "Jueves", 5: "Viernes", 6: "Sábado" };
    const diaHoy = diasMap[hoy.getDay()];
    const turnos = turnosFijosPorClub[clubId] || [];
    return turnos.some(
      (t) => t.canchaId === canchaId && t.dia === diaHoy && (t.horas || [t.hora]).includes(hora) && t.status === "activo"
    );
  };

  const getInfoClub = (club) => {
    let libres = 0;
    let precioMin = Infinity;
    const canchasInfo = [];
    const superficies = new Set();
    let tieneTechada = false;
    let tieneAireLibre = false;

    (club.canchas || []).forEach((cancha) => {
      superficies.add(cancha.superficie);
      if (cancha.techada) tieneTechada = true;
      else tieneAireLibre = true;

      let canchaLibres = 0;
      const horasLibres = [];
      (cancha.horariosDisponibles || []).forEach((hora) => {
        if (!estaOcupado(club.id, cancha.id, hora) && !esTurnoFijoHub(club.id, cancha.id, hora)) {
          canchaLibres++;
          libres++;
          horasLibres.push(hora);
          const precio = (cancha.horarios || {})[hora] ?? cancha.precioBase ?? 0;
          if (precio < precioMin) precioMin = precio;
        }
      });
      canchasInfo.push({ ...cancha, canchaLibres, horasLibres });
    });

    return { libres, precioMin: precioMin === Infinity ? 0 : precioMin, canchasInfo, superficies: [...superficies], tieneTechada, tieneAireLibre };
  };

  const toggleFavorito = async (clubId) => {
    if (!user) return;
    const nuevo = favoritos.includes(clubId)
      ? favoritos.filter((id) => id !== clubId)
      : [...favoritos, clubId];
    setFavoritos(nuevo);
    try {
      await updateDoc(doc(db, "users", user.uid), { favoritos: nuevo });
    } catch (err) {
      console.error("Error al actualizar favoritos:", err);
    }
  };

  // Filtrar clubes
  let clubesFiltrados = clubes.filter((club) =>
    club.nombre.toLowerCase().includes(busqueda.toLowerCase())
  );

  if (filtroSuperficie) {
    clubesFiltrados = clubesFiltrados.filter((club) =>
      (club.canchas || []).some((c) => c.superficie === filtroSuperficie)
    );
  }

  if (filtroTechada) {
    clubesFiltrados = clubesFiltrados.filter((club) =>
      (club.canchas || []).some((c) =>
        filtroTechada === "techada" ? c.techada : !c.techada
      )
    );
  }

  // Ordenar: favoritos primero, después por horarios libres
  const clubesConInfo = clubesFiltrados.map((club) => ({
    ...club,
    ...getInfoClub(club),
    esFavorito: favoritos.includes(club.id),
  }));

  clubesConInfo.sort((a, b) => {
    if (a.esFavorito && !b.esFavorito) return -1;
    if (!a.esFavorito && b.esFavorito) return 1;
    return b.libres - a.libres;
  });

  // Obtener superficies únicas
  const todasSuperficies = [...new Set(clubes.flatMap((c) => (c.canchas || []).map((ca) => ca.superficie)).filter(Boolean))];

  if (cargando) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <div className="w-10 h-10 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3" />
        <p style={{ color: "var(--text-muted)" }} className="text-sm">Cargando canchas...</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
          Canchas disponibles
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Encontrá y reservá tu cancha
        </p>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <div className="themed-card rounded-xl border px-3 py-2 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4" style={{ color: "var(--accent)" }}>
            <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <input type="date" value={fechaSeleccionada} onChange={(e) => setFechaSeleccionada(e.target.value)}
            className="text-sm bg-transparent focus:outline-none" style={{ color: "var(--text-primary)" }} />
        </div>
        <div className="themed-card rounded-xl border px-3 py-2 flex items-center gap-2 flex-1 min-w-[150px]">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4" style={{ color: "var(--text-muted)" }}>
            <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input type="text" placeholder="Buscar club..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
            className="text-sm bg-transparent focus:outline-none w-full" style={{ color: "var(--text-primary)" }} />
        </div>
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {todasSuperficies.length > 0 && (
          <select value={filtroSuperficie} onChange={(e) => setFiltroSuperficie(e.target.value)}
            className="themed-card rounded-xl border px-3 py-2 text-xs bg-transparent" style={{ color: "var(--text-secondary)" }}>
            <option value="">Superficie</option>
            {todasSuperficies.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
        <select value={filtroTechada} onChange={(e) => setFiltroTechada(e.target.value)}
          className="themed-card rounded-xl border px-3 py-2 text-xs bg-transparent" style={{ color: "var(--text-secondary)" }}>
          <option value="">Cobertura</option>
          <option value="techada">Techada</option>
          <option value="airelibre">Aire libre</option>
        </select>
        {(filtroSuperficie || filtroTechada) && (
          <button onClick={() => { setFiltroSuperficie(""); setFiltroTechada(""); }}
            className="text-xs font-semibold px-3 py-2 rounded-xl transition"
            style={{ color: "var(--accent)" }}>
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Sin resultados */}
      {clubesConInfo.length === 0 && (
        <div className="themed-card text-center py-16 rounded-2xl border">
          <div className="text-5xl mb-4">🏟️</div>
          <p className="font-medium" style={{ color: "var(--text-secondary)" }}>No hay canchas disponibles</p>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>Probá cambiando la fecha o los filtros</p>
        </div>
      )}

      {/* Tarjetas de clubes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {clubesConInfo.map((club) => (
          <div
            key={club.id}
            className="themed-card rounded-2xl border overflow-hidden card-hover cursor-pointer"
            onClick={() => navigate(`/club/${club.id}`, { state: { fecha: fechaSeleccionada } })}
          >
            {/* Header del club */}
            <div className="px-4 pt-4 pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h2 className="font-bold" style={{ color: "var(--text-primary)" }}>{club.nombre}</h2>
                  <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                    {club.ciudad}{club.direccion && ` · ${club.direccion}`}
                  </p>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); toggleFavorito(club.id); }}
                  className="p-1.5 rounded-lg transition hover:scale-110"
                >
                  {club.esFavorito ? (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#f59e0b" stroke="#f59e0b" strokeWidth="1.5" className="w-5 h-5">
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-5 h-5" style={{ color: "var(--text-muted)" }}>
                      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                    </svg>
                  )}
                </button>
              </div>

              {/* Badges */}
              <div className="flex gap-1.5 mt-2 flex-wrap">
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: "var(--accent-light)", color: "var(--accent)" }}>
                  {club.canchasInfo.length} cancha{club.canchasInfo.length !== 1 ? "s" : ""}
                </span>
                {club.superficies.map((s) => (
                  <span key={s} className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: "rgba(59,130,246,0.1)", color: "#3b82f6" }}>
                    {s}
                  </span>
                ))}
                {club.tieneTechada && (
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: "rgba(139,92,246,0.1)", color: "#8b5cf6" }}>
                    Techada
                  </span>
                )}
              </div>
            </div>

            {/* Canchas resumen */}
            <div className="px-4 pb-3">
              <div className="flex flex-col gap-1.5">
                {club.canchasInfo.map((cancha) => (
                  <div key={cancha.id} className="flex items-center justify-between rounded-lg px-3 py-2"
                    style={{ backgroundColor: "var(--bg-card-hover)" }}>
                    <div>
                      <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{cancha.nombre}</span>
                      <span className="text-[10px] ml-1.5" style={{ color: "var(--text-muted)" }}>
                        {cancha.superficie} · {cancha.techada ? "Techada" : "Aire libre"}
                      </span>
                    </div>
                    <div className="text-right">
                      {cancha.canchaLibres > 0 ? (
                        <span className="text-xs font-bold" style={{ color: "var(--accent)" }}>
                          {cancha.canchaLibres} libre{cancha.canchaLibres !== 1 ? "s" : ""}
                        </span>
                      ) : (
                        <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Completa</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderTop: "1px solid var(--border-card)" }}>
              <div>
                {club.libres > 0 ? (
                  <>
                    <span className="text-sm font-bold" style={{ color: "var(--accent)" }}>{club.libres}</span>
                    <span className="text-xs ml-1" style={{ color: "var(--text-muted)" }}>
                      horario{club.libres !== 1 ? "s" : ""} disponible{club.libres !== 1 ? "s" : ""}
                    </span>
                  </>
                ) : (
                  <span className="text-xs font-medium" style={{ color: "var(--text-muted)" }}>Sin disponibilidad</span>
                )}
              </div>
              {club.precioMin > 0 && (
                <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
                  Desde <span style={{ color: "var(--accent)" }}>${club.precioMin.toLocaleString()}</span>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
