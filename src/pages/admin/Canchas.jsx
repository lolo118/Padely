import { useEffect, useState } from "react";
import { useAuthStore } from "../../store/authStore";
import {
  getClubByOwner,
  getCanchas,
  crearCancha,
  actualizarCancha,
  eliminarCancha,
  getReservas,
  actualizarReserva,
  eliminarReserva,
  actualizarClubConfig,
  getTurnosFijos,
} from "../../services/canchaService";
import TabTurnosFijos from "./TabTurnosFijos";

const superficies = ["Cemento", "Sintético", "Césped", "Otro"];

const horasDelDia = Array.from({ length: 24 }, (_, i) => {
  const h = i.toString().padStart(2, "0");
  return `${h}:00`;
});

const inputClass =
  "border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-full";
const selectClass =
  "border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 w-full bg-white";
const labelClass = "text-xs font-semibold text-gray-500 mb-1 block";

export default function Canchas() {
  const { user } = useAuthStore();
  const [club, setClub] = useState(null);
  const [canchas, setCanchas] = useState([]);
  const [reservas, setReservas] = useState([]);
  const [turnosFijos, setTurnosFijos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tabCanchas, setTabCanchas] = useState("Canchas");
  const [fechaSeleccionada, setFechaSeleccionada] = useState(
    new Date().toISOString().split("T")[0],
  );

  // Form nueva cancha
  const [mostrarForm, setMostrarForm] = useState(false);
  const [formCancha, setFormCancha] = useState({
    nombre: "",
    superficie: "Cemento",
    techada: false,
    precioBase: 0,
    horarios: {},
  });
  const [guardando, setGuardando] = useState(false);

  // Edición cancha
  const [editandoCancha, setEditandoCancha] = useState(null);
  const [editForm, setEditForm] = useState(null);

  // Config club
  const [mostrarConfig, setMostrarConfig] = useState(false);
  const [configForm, setConfigForm] = useState({
    reservaDirecta: true,
    diasAnticipacion: 7,
  });

  useEffect(() => {
    if (!user) return;
    const cargar = async () => {
      try {
        const clubData = await getClubByOwner(user.uid);
        if (clubData) {
          setClub(clubData);
          const [canchasData, reservasData, turnosData] = await Promise.all([
            getCanchas(clubData.id),
            getReservas(clubData.id, fechaSeleccionada),
            getTurnosFijos(clubData.id),
          ]);
          setCanchas(canchasData);
          setReservas(reservasData);
          setTurnosFijos(turnosData);
          setConfigForm({
            reservaDirecta: clubData.reservaDirecta ?? true,
            diasAnticipacion: clubData.diasAnticipacion ?? 7,
          });
        }
      } catch (err) {
        console.error("Error al cargar canchas:", err);
      }
      setLoading(false);
    };
    cargar();
  }, [user]);

  useEffect(() => {
    if (!club) return;
    getReservas(club.id, fechaSeleccionada).then(setReservas);
  }, [fechaSeleccionada, club]);
  const toggleHorario = (hora) => {
    const current = { ...formCancha.horarios };
    if (current[hora] !== undefined) {
      delete current[hora];
    } else {
      current[hora] = formCancha.precioBase || 0;
    }
    setFormCancha({ ...formCancha, horarios: current });
  };

  const setPrecioHorario = (hora, precio) => {
    setFormCancha({
      ...formCancha,
      horarios: { ...formCancha.horarios, [hora]: Number(precio) },
    });
  };
  const toggleHorarioEdit = (hora) => {
    const current = { ...(editForm.horarios || {}) };
    if (current[hora] !== undefined) {
      delete current[hora];
    } else {
      current[hora] = editForm.precioBase || 0;
    }
    setEditForm({ ...editForm, horarios: current });
  };

  const setPrecioHorarioEdit = (hora, precio) => {
    setEditForm({
      ...editForm,
      horarios: { ...(editForm.horarios || {}), [hora]: Number(precio) },
    });
  };

  const handleCrearCancha = async (e) => {
    e.preventDefault();
    if (!formCancha.nombre.trim() || !club) return;
    setGuardando(true);
    try {
      const datos = {
        nombre: formCancha.nombre,
        superficie: formCancha.superficie,
        techada: formCancha.techada,
        precioBase: Number(formCancha.precioBase),
        horarios: formCancha.horarios,
        horariosDisponibles: Object.keys(formCancha.horarios).sort(),
      };
      const nuevaId = await crearCancha(club.id, datos);
      setCanchas([...canchas, { id: nuevaId, ...datos }]);
      setFormCancha({
        nombre: "",
        superficie: "Cemento",
        techada: false,
        precioBase: 0,
        horarios: {},
      });
      setMostrarForm(false);
    } catch (err) {
      console.error("Error al crear cancha:", err);
    }
    setGuardando(false);
  };

  const handleGuardarEdicion = async () => {
    if (!editForm || !club) return;
    try {
      const { id: canchaId, createdAt, ...datos } = editForm;
      const datosActualizar = {
        ...datos,
        precioBase: Number(datos.precioBase),
        horariosDisponibles: Object.keys(datos.horarios || {}).sort(),
      };
      await actualizarCancha(club.id, canchaId, datosActualizar);
      setCanchas(
        canchas.map((c) =>
          c.id === canchaId ? { ...c, ...datosActualizar } : c,
        ),
      );
      setEditandoCancha(null);
      setEditForm(null);
    } catch (err) {
      console.error("Error al editar cancha:", err);
    }
  };

  const handleEliminarCancha = async (canchaId) => {
    if (!window.confirm("¿Eliminar esta cancha?")) return;
    try {
      await eliminarCancha(club.id, canchaId);
      setCanchas(canchas.filter((c) => c.id !== canchaId));
    } catch (err) {
      console.error("Error al eliminar cancha:", err);
    }
  };

  const handleGuardarConfig = async () => {
    if (!club) return;
    try {
      await actualizarClubConfig(club.id, configForm);
      setClub({ ...club, ...configForm });
      setMostrarConfig(false);
    } catch (err) {
      console.error("Error al guardar config:", err);
    }
  };

  const getReservaParaSlot = (canchaId, hora) => {
    return reservas.find(
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
    const diaHoy = diasMap[hoy.getDay()];
    return turnosFijos.some(
      (t) =>
        t.canchaId === canchaId &&
        t.dia === diaHoy &&
        (t.horas || [t.hora]).includes(hora) &&
        t.status === "activo",
    );
  };

  const handleCancelarReserva = async (reservaId) => {
    if (!window.confirm("¿Cancelar esta reserva?")) return;
    try {
      await eliminarReserva(club.id, reservaId);
      setReservas(reservas.filter((r) => r.id !== reservaId));
    } catch (err) {
      console.error("Error al cancelar reserva:", err);
    }
  };

  const handleConfirmarReserva = async (reservaId) => {
    try {
      await actualizarReserva(club.id, reservaId, { status: "confirmada" });
      setReservas(
        reservas.map((r) =>
          r.id === reservaId ? { ...r, status: "confirmada" } : r,
        ),
      );
    } catch (err) {
      console.error("Error al confirmar reserva:", err);
    }
  };

  if (loading) {
    return <div className="text-center text-gray-400 py-12">Cargando...</div>;
  }

  if (!club) {
    return (
      <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm">
        <div className="text-5xl mb-4">🏟️</div>
        <p className="text-gray-500 font-medium">No tenés un club registrado</p>
        <p className="text-gray-400 text-sm mt-1">
          Registrate como club para gestionar canchas y turnos
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-gray-800">Canchas y turnos</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setMostrarConfig(!mostrarConfig)}
            className="px-3 py-2 rounded-xl text-sm font-semibold bg-gray-100 text-gray-500 hover:bg-gray-200 transition"
          >
            ⚙ Config
          </button>
          <button
            onClick={() => setMostrarForm(!mostrarForm)}
            className="bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-green-700 transition"
          >
            + Nueva cancha
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {["Canchas", "Turnos fijos"].map((t) => (
          <button
            key={t}
            onClick={() => setTabCanchas(t)}
            className={`px-4 py-2 text-sm font-semibold transition border-b-2 -mb-px ${
              tabCanchas === t
                ? "border-green-600 text-green-600"
                : "border-transparent text-gray-400 hover:text-gray-600"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tabCanchas === "Canchas" && (
        <>
          {/* Configuración del club */}
          {mostrarConfig && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 mb-4">
              <h2 className="font-semibold text-gray-700 mb-3">
                Configuración de reservas
              </h2>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={configForm.reservaDirecta}
                    onChange={(e) =>
                      setConfigForm({
                        ...configForm,
                        reservaDirecta: e.target.checked,
                      })
                    }
                    className="w-4 h-4 accent-green-600"
                  />
                  <span className="text-sm text-gray-600">
                    Reserva directa (sin aprobación del club)
                  </span>
                </div>
                <div>
                  <label className={labelClass}>
                    Días de anticipación máxima
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={configForm.diasAnticipacion}
                    onChange={(e) =>
                      setConfigForm({
                        ...configForm,
                        diasAnticipacion: Number(e.target.value),
                      })
                    }
                    className={inputClass}
                  />
                </div>
                <button
                  onClick={handleGuardarConfig}
                  className="bg-green-600 text-white font-semibold py-2 rounded-xl hover:bg-green-700 transition"
                >
                  Guardar configuración
                </button>
              </div>
            </div>
          )}

          {/* Formulario nueva cancha */}
          {mostrarForm && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-green-200 mb-4">
              <h2 className="font-semibold text-green-700 mb-3">
                Nueva cancha
              </h2>
              <form
                onSubmit={handleCrearCancha}
                className="flex flex-col gap-3"
              >
                <div>
                  <label className={labelClass}>Nombre</label>
                  <input
                    type="text"
                    placeholder="Ej: Cancha 1"
                    value={formCancha.nombre}
                    onChange={(e) =>
                      setFormCancha({ ...formCancha, nombre: e.target.value })
                    }
                    className={inputClass}
                    required
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className={labelClass}>Superficie</label>
                    <select
                      value={formCancha.superficie}
                      onChange={(e) =>
                        setFormCancha({
                          ...formCancha,
                          superficie: e.target.value,
                        })
                      }
                      className={selectClass}
                    >
                      {superficies.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className={labelClass}>
                      Precio base por turno ($)
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formCancha.precioBase}
                      onChange={(e) =>
                        setFormCancha({
                          ...formCancha,
                          precioBase: Number(e.target.value),
                        })
                      }
                      className={inputClass}
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Se aplica al seleccionar horarios nuevos
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={formCancha.techada}
                    onChange={(e) =>
                      setFormCancha({
                        ...formCancha,
                        techada: e.target.checked,
                      })
                    }
                    className="w-4 h-4 accent-green-600"
                  />
                  <span className="text-sm text-gray-600">Cancha techada</span>
                </div>
                <div>
                  <label className={labelClass}>Horarios y precios</label>
                  <div className="flex flex-wrap gap-1 mb-2">
                    {horasDelDia.map((hora) => (
                      <button
                        key={hora}
                        type="button"
                        onClick={() => toggleHorario(hora)}
                        className={`px-2 py-1 rounded-lg text-xs font-semibold transition ${
                          formCancha.horarios[hora] !== undefined
                            ? "bg-green-600 text-white"
                            : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                        }`}
                      >
                        {hora}
                      </button>
                    ))}
                  </div>
                  {Object.keys(formCancha.horarios).length > 0 && (
                    <div className="bg-gray-50 rounded-xl p-3 flex flex-col gap-1">
                      <p className="text-xs font-semibold text-gray-500 mb-1">
                        Precio por horario
                      </p>
                      {Object.keys(formCancha.horarios)
                        .sort()
                        .map((hora) => (
                          <div key={hora} className="flex items-center gap-2">
                            <span className="text-xs text-gray-600 w-14">
                              {hora}
                            </span>
                            <input
                              type="number"
                              min="0"
                              value={formCancha.horarios[hora]}
                              onChange={(e) =>
                                setPrecioHorario(hora, e.target.value)
                              }
                              className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-xs text-center focus:outline-none focus:ring-2 focus:ring-green-500"
                            />
                            <span className="text-xs text-gray-400">$</span>
                          </div>
                        ))}
                    </div>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {Object.keys(formCancha.horarios).length} horarios
                    seleccionados
                  </p>
                </div>
                <button
                  type="submit"
                  disabled={guardando || !formCancha.nombre.trim()}
                  className="bg-green-600 text-white font-semibold py-2 rounded-xl hover:bg-green-700 transition disabled:opacity-50"
                >
                  {guardando ? "Creando..." : "Crear cancha"}
                </button>
              </form>
            </div>
          )}

          {/* Lista de canchas */}
          {canchas.length === 0 && !mostrarForm && (
            <div className="text-center py-16 bg-white rounded-2xl border border-gray-100 shadow-sm mb-4">
              <div className="text-5xl mb-4">🏸</div>
              <p className="text-gray-500 font-medium">
                No tenés canchas creadas
              </p>
              <p className="text-gray-400 text-sm mt-1">
                Hacé clic en "+ Nueva cancha" para empezar
              </p>
            </div>
          )}

          {canchas.length > 0 && (
            <div className="flex flex-col gap-3 mb-6">
              {canchas.map((cancha) => (
                <div
                  key={cancha.id}
                  className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100"
                >
                  {editandoCancha === cancha.id && editForm ? (
                    <div className="flex flex-col gap-3">
                      <div className="flex items-center justify-between mb-1">
                        <h3 className="font-semibold text-green-700">
                          Editando cancha
                        </h3>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditandoCancha(null);
                              setEditForm(null);
                            }}
                            className="text-xs font-semibold text-gray-400 hover:text-gray-600"
                          >
                            Cancelar
                          </button>
                          <button
                            onClick={handleGuardarEdicion}
                            className="text-xs font-semibold text-green-600 hover:underline"
                          >
                            Guardar
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className={labelClass}>Nombre</label>
                        <input
                          type="text"
                          value={editForm.nombre}
                          onChange={(e) =>
                            setEditForm({ ...editForm, nombre: e.target.value })
                          }
                          className={inputClass}
                        />
                      </div>
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className={labelClass}>Superficie</label>
                          <select
                            value={editForm.superficie}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                superficie: e.target.value,
                              })
                            }
                            className={selectClass}
                          >
                            {superficies.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="flex-1">
                          <label className={labelClass}>Precio base ($)</label>
                          <input
                            type="number"
                            min="0"
                            value={editForm.precioBase || 0}
                            onChange={(e) =>
                              setEditForm({
                                ...editForm,
                                precioBase: Number(e.target.value),
                              })
                            }
                            className={inputClass}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={editForm.techada || false}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              techada: e.target.checked,
                            })
                          }
                          className="w-4 h-4 accent-green-600"
                        />
                        <span className="text-sm text-gray-600">Techada</span>
                      </div>
                      <div>
                        <label className={labelClass}>Horarios y precios</label>
                        <div className="flex flex-wrap gap-1 mb-2">
                          {horasDelDia.map((hora) => (
                            <button
                              key={hora}
                              type="button"
                              onClick={() => toggleHorarioEdit(hora)}
                              className={`px-2 py-1 rounded-lg text-xs font-semibold transition ${
                                (editForm.horarios || {})[hora] !== undefined
                                  ? "bg-green-600 text-white"
                                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                              }`}
                            >
                              {hora}
                            </button>
                          ))}
                        </div>
                        {Object.keys(editForm.horarios || {}).length > 0 && (
                          <div className="bg-gray-50 rounded-xl p-3 flex flex-col gap-1">
                            <p className="text-xs font-semibold text-gray-500 mb-1">
                              Precio por horario
                            </p>
                            {Object.keys(editForm.horarios || {})
                              .sort()
                              .map((hora) => (
                                <div
                                  key={hora}
                                  className="flex items-center gap-2"
                                >
                                  <span className="text-xs text-gray-600 w-14">
                                    {hora}
                                  </span>
                                  <input
                                    type="number"
                                    min="0"
                                    value={(editForm.horarios || {})[hora]}
                                    onChange={(e) =>
                                      setPrecioHorarioEdit(hora, e.target.value)
                                    }
                                    className="w-24 border border-gray-200 rounded-lg px-2 py-1 text-xs text-center focus:outline-none focus:ring-2 focus:ring-green-500"
                                  />
                                  <span className="text-xs text-gray-400">
                                    $
                                  </span>
                                </div>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-gray-800">
                            {cancha.nombre}
                          </h3>
                          <div className="flex gap-2 mt-1 flex-wrap">
                            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                              {cancha.superficie}
                            </span>
                            <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
                              {cancha.techada ? "Techada" : "Al aire libre"}
                            </span>
                            <span className="text-xs bg-green-100 text-green-600 px-2 py-0.5 rounded-full">
                              Desde $
                              {cancha.precioBase ||
                                Math.min(
                                  ...Object.values(cancha.horarios || { 0: 0 }),
                                )}
                              /turno
                            </span>
                            <span className="text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">
                              {(cancha.horariosDisponibles || []).length}{" "}
                              horarios
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => {
                              setEditandoCancha(cancha.id);
                              setEditForm({ ...cancha });
                            }}
                            className="text-xs font-semibold text-green-600 hover:underline"
                          >
                            Editar
                          </button>
                          <button
                            onClick={() => handleEliminarCancha(cancha.id)}
                            className="text-xs font-semibold text-red-400 hover:text-red-600"
                          >
                            Eliminar
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Grilla de turnos del día */}
          {canchas.length > 0 && (
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-semibold text-gray-700">Turnos del día</h2>
                <input
                  type="date"
                  value={fechaSeleccionada}
                  onChange={(e) => setFechaSeleccionada(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 pr-3 text-gray-400 text-xs">
                        Hora
                      </th>
                      {canchas.map((c) => (
                        <th
                          key={c.id}
                          className="text-center py-2 px-2 text-gray-400 text-xs"
                        >
                          {c.nombre}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {horasDelDia.map((hora) => {
                      const algunaCanchaDisponible = canchas.some((c) =>
                        (c.horariosDisponibles || []).includes(hora),
                      );
                      if (!algunaCanchaDisponible) return null;

                      return (
                        <tr key={hora} className="border-b border-gray-50">
                          <td className="py-2 pr-3 text-gray-500 font-medium">
                            {hora}
                          </td>
                          {canchas.map((cancha) => {
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

                            const reserva = getReservaParaSlot(cancha.id, hora);
                            if (reserva) {
                              return (
                                <td
                                  key={cancha.id}
                                  className="text-center py-2 px-2"
                                >
                                  <div
                                    className={`rounded-lg px-2 py-1 text-xs ${
                                      reserva.status === "pendiente"
                                        ? "bg-yellow-100 text-yellow-700"
                                        : "bg-green-100 text-green-700"
                                    }`}
                                  >
                                    <p className="font-semibold truncate">
                                      {reserva.nombreJugador || "Reservado"}
                                    </p>
                                    <div className="flex gap-1 justify-center mt-1">
                                      {reserva.status === "pendiente" && (
                                        <button
                                          onClick={() =>
                                            handleConfirmarReserva(reserva.id)
                                          }
                                          className="text-green-600 hover:underline"
                                        >
                                          ✓
                                        </button>
                                      )}
                                      <button
                                        onClick={() =>
                                          handleCancelarReserva(reserva.id)
                                        }
                                        className="text-red-400 hover:underline"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  </div>
                                </td>
                              );
                            }

                            const turnoFijo = esTurnoFijo(cancha.id, hora);
                            if (turnoFijo) {
                              const tf = turnosFijos.find(
                                (t) =>
                                  t.canchaId === cancha.id &&
                                  (t.horas || [t.hora]).includes(hora) &&
                                  t.status === "activo",
                              );
                              return (
                                <td
                                  key={cancha.id}
                                  className="text-center py-2 px-2"
                                >
                                  <div className="rounded-lg px-2 py-1 text-xs bg-purple-100 text-purple-700">
                                    <p className="font-semibold truncate">
                                      {tf?.nombreJugador || "Turno fijo"}
                                    </p>
                                    <p className="text-purple-500">Fijo</p>
                                  </div>
                                </td>
                              );
                            }

                            const precioHora =
                              (cancha.horarios || {})[hora] ??
                              cancha.precioBase ??
                              0;
                            return (
                              <td
                                key={cancha.id}
                                className="text-center py-2 px-2"
                              >
                                <div>
                                  <span className="text-xs text-green-500 font-semibold block">
                                    Libre
                                  </span>
                                  <span className="text-xs text-gray-400">
                                    ${precioHora}
                                  </span>
                                </div>
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
          )}
        </>
      )}

      {tabCanchas === "Turnos fijos" && club && (
        <TabTurnosFijos clubId={club.id} />
      )}
    </div>
  );
}
