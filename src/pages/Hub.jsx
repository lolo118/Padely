import { useEffect, useState } from "react";
import { useAuthStore } from "../store/authStore";
import {
  getClubesConCanchas,
  crearReserva,
  getReservas,
  getTurnosFijos,
} from "../services/canchaService";

const horasDelDia = Array.from({ length: 24 }, (_, i) => {
  const h = i.toString().padStart(2, "0");
  return `${h}:00`;
});

export default function Hub() {
  const { user } = useAuthStore();
  const [clubes, setClubes] = useState([]);
  const [fechaSeleccionada, setFechaSeleccionada] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [reservasPorClub, setReservasPorClub] = useState({});
  const [turnosFijosPorClub, setTurnosFijosPorClub] = useState({});
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");

  const [mostrarModal, setMostrarModal] = useState(false);
  const [modalData, setModalData] = useState(null);
  const [formReserva, setFormReserva] = useState({
    nombreJugador: "",
    email: "",
    telefono: "",
  });
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    const cargar = async () => {
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
        console.log("Turnos fijos cargados:", turnosMap);
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
      (r) =>
        r.canchaId === canchaId && r.hora === hora && r.status !== "cancelada",
    );
  };

  const esTurnoFijoHub = (clubId, canchaId, hora) => {
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
    const diaHoy = diasMap[hoy.getDay()];
    const turnos = turnosFijosPorClub[clubId] || [];
    return turnos.some(
      (t) =>
        t.canchaId === canchaId &&
        t.dia === diaHoy &&
        (t.horas || [t.hora]).includes(hora) &&
        t.status === "activo",
    );
  };

  const abrirModalReserva = (club, cancha, hora, precio) => {
    setModalData({ club, cancha, hora, precio });
    setFormReserva({ nombreJugador: "", email: "", telefono: "" });
    setMostrarModal(true);
  };

  const handleReservar = async (e) => {
    e.preventDefault();
    if (!modalData) return;
    setGuardando(true);
    try {
      const { club, cancha, hora, precio } = modalData;
      await crearReserva(club.id, {
        canchaId: cancha.id,
        canchaName: cancha.nombre,
        fecha: fechaSeleccionada,
        hora,
        precio,
        jugadorUid: user?.uid || null,
        nombreJugador: formReserva.nombreJugador,
        email: formReserva.email,
        telefono: formReserva.telefono,
        status: club.reservaDirecta ? "confirmada" : "pendiente",
      });
      const reservasActualizadas = await getReservas(
        club.id,
        fechaSeleccionada,
      );
      setReservasPorClub((prev) => ({
        ...prev,
        [club.id]: reservasActualizadas,
      }));
      setMostrarModal(false);
    } catch (err) {
      console.error("Error al reservar:", err);
    }
    setGuardando(false);
  };

  const clubesFiltrados = clubes.filter((club) =>
    club.nombre.toLowerCase().includes(busqueda.toLowerCase()),
  );

  if (cargando) {
    return (
      <div className="text-center text-gray-400 py-12">Cargando canchas...</div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-bold text-gray-800 mb-3">
          Canchas disponibles
        </h1>
        <div className="flex gap-3 flex-wrap">
          <input
            type="date"
            value={fechaSeleccionada}
            onChange={(e) => setFechaSeleccionada(e.target.value)}
            className="border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <input
            type="text"
            placeholder="Buscar club..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="border border-gray-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 flex-1"
          />
        </div>
      </div>

      {clubesFiltrados.length === 0 && (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <div className="text-5xl mb-4">🏟️</div>
          <p className="text-gray-500">No hay canchas disponibles</p>
        </div>
      )}

      <div className="flex flex-col gap-6">
        {clubesFiltrados.map((club) => (
          <div
            key={club.id}
            className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden"
          >
            <div className="bg-gray-50 px-5 py-3 border-b border-gray-100">
              <h2 className="font-semibold text-gray-800">{club.nombre}</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {club.direccion && `${club.direccion} — `}
                {club.ciudad}
                {club.telefono && ` — Tel: ${club.telefono}`}
              </p>
              {club.reservaDirecta !== undefined && (
                <p className="text-xs text-gray-400">
                  {club.reservaDirecta
                    ? "Reserva directa"
                    : "Requiere aprobación del club"}
                </p>
              )}
            </div>

            {club.canchas?.length === 0 ? (
              <div className="p-5 text-center text-gray-400 text-sm">
                Este club aún no tiene canchas cargadas
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-white border-b border-gray-100">
                      <th className="sticky left-0 bg-white z-10 text-left py-3 px-4 text-gray-500 font-semibold">
                        Hora
                      </th>
                      {club.canchas.map((cancha) => (
                        <th
                          key={cancha.id}
                          className="text-center py-3 px-3 text-gray-500 font-semibold min-w-[100px]"
                        >
                          <div>{cancha.nombre}</div>
                          <div className="text-xs text-gray-400 font-normal">
                            {cancha.superficie} ·{" "}
                            {cancha.techada ? "Techada" : "Aire libre"}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {horasDelDia.map((hora) => {
                      const algunaLibre = club.canchas.some((cancha) => {
                        const disponible = (
                          cancha.horariosDisponibles || []
                        ).includes(hora);
                        if (!disponible) return false;
                        if (estaOcupado(club.id, cancha.id, hora)) return false;
                        if (esTurnoFijoHub(club.id, cancha.id, hora))
                          return false;
                        return true;
                      });
                      if (!algunaLibre) return null;

                      return (
                        <tr
                          key={hora}
                          className="border-b border-gray-50 hover:bg-gray-50/50"
                        >
                          <td className="sticky left-0 bg-white z-10 py-3 px-4 text-gray-500 font-medium border-r border-gray-100">
                            {hora}
                          </td>
                          {club.canchas.map((cancha) => {
                            const disponible = (
                              cancha.horariosDisponibles || []
                            ).includes(hora);
                            if (!disponible) {
                              return (
                                <td
                                  key={cancha.id}
                                  className="text-center py-2 px-2"
                                >
                                  <span className="text-xs text-gray-300">
                                    —
                                  </span>
                                </td>
                              );
                            }

                            if (estaOcupado(club.id, cancha.id, hora))
                              return (
                                <td
                                  key={cancha.id}
                                  className="text-center py-2 px-2"
                                >
                                  <span className="text-xs text-gray-300">
                                    —
                                  </span>
                                </td>
                              );
                            if (esTurnoFijoHub(club.id, cancha.id, hora))
                              return (
                                <td
                                  key={cancha.id}
                                  className="text-center py-2 px-2"
                                >
                                  <span className="text-xs text-gray-300">
                                    —
                                  </span>
                                </td>
                              );

                            const precioHora =
                              (cancha.horarios || {})[hora] ??
                              cancha.precioBase ??
                              0;

                            return (
                              <td
                                key={cancha.id}
                                className="text-center py-2 px-2"
                              >
                                <button
                                  onClick={() =>
                                    abrirModalReserva(
                                      club,
                                      cancha,
                                      hora,
                                      precioHora,
                                    )
                                  }
                                  className="w-full bg-green-50 hover:bg-green-100 text-green-700 rounded-lg py-2 px-2 text-xs font-semibold transition"
                                >
                                  Libre
                                  <span className="block text-green-600 text-xs">
                                    ${precioHora}
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
            )}
          </div>
        ))}
      </div>

      {/* Modal de reserva */}
      {mostrarModal && modalData && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-1">
              Reservar cancha
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              {modalData.club.nombre} — {modalData.cancha.nombre} —{" "}
              {modalData.hora} — ${modalData.precio}
            </p>
            <form onSubmit={handleReservar} className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">
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
                  className="w-full border border-gray-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">
                  Email
                </label>
                <input
                  type="email"
                  value={formReserva.email}
                  onChange={(e) =>
                    setFormReserva({ ...formReserva, email: e.target.value })
                  }
                  className="w-full border border-gray-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">
                  Teléfono
                </label>
                <input
                  type="tel"
                  value={formReserva.telefono}
                  onChange={(e) =>
                    setFormReserva({ ...formReserva, telefono: e.target.value })
                  }
                  className="w-full border border-gray-300 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div className="flex gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setMostrarModal(false)}
                  className="flex-1 py-2 rounded-xl text-sm font-semibold bg-gray-100 text-gray-500 hover:bg-gray-200 transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={guardando}
                  className="flex-1 bg-green-600 text-white py-2 rounded-xl font-semibold hover:bg-green-700 transition disabled:opacity-50"
                >
                  {guardando ? "Reservando..." : "Reservar"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
