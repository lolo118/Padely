import { useEffect, useState } from "react";
import { useAuthStore } from "../../store/authStore";
import {
  getClubByOwner,
  actualizarClubConfig,
} from "../../services/canchaService";

const inputClass =
  "border border-slate-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 w-full";
const labelClass = "text-xs font-semibold text-slate-500 mb-1 block";
const tipClass =
  "text-xs text-blue-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mt-2";

const diasSemana = [
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
  "Domingo",
];

const rolesDisponibles = [
  { value: "admin", label: "Administrador", desc: "Acceso total" },
  {
    value: "encargado",
    label: "Encargado de turno",
    desc: "Gestionar canchas y reservas",
  },
  { value: "cajero", label: "Cajero", desc: "Solo ver reservas y cobrar" },
];

export default function Configuracion() {
  const { user } = useAuthStore();
  const [club, setClub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [tab, setTab] = useState("datos");
  const [mensaje, setMensaje] = useState("");

  const [form, setForm] = useState({
    nombre: "",
    direccion: "",
    ciudad: "",
    provincia: "",
    telefono: "",
    email: "",
    instagram: "",
    facebook: "",
    whatsapp: "",
    website: "",
    horarioApertura: "08:00",
    horarioCierre: "23:00",
    diasAbiertos: [
      "Lunes",
      "Martes",
      "Miércoles",
      "Jueves",
      "Viernes",
      "Sábado",
      "Domingo",
    ],
    cbu: "",
    alias: "",
    titularCuenta: "",
    cuit: "",
    razonSocial: "",
  });

  const [usuarios, setUsuarios] = useState([]);
  const [nuevoUsuario, setNuevoUsuario] = useState({
    email: "",
    nombre: "",
    rol: "encargado",
    telefono: "",
  });

  useEffect(() => {
    if (!user) return;
    const cargar = async () => {
      try {
        const clubData = await getClubByOwner(user.uid);
        if (clubData) {
          setClub(clubData);
          setForm({
            nombre: clubData.nombre || "",
            direccion: clubData.direccion || "",
            ciudad: clubData.ciudad || "",
            provincia: clubData.provincia || "",
            telefono: clubData.telefono || "",
            email: clubData.email || "",
            instagram: clubData.instagram || "",
            facebook: clubData.facebook || "",
            whatsapp: clubData.whatsapp || "",
            website: clubData.website || "",
            horarioApertura: clubData.horarioApertura || "08:00",
            horarioCierre: clubData.horarioCierre || "23:00",
            diasAbiertos: clubData.diasAbiertos || diasSemana,
            cbu: clubData.cbu || "",
            alias: clubData.alias || "",
            titularCuenta: clubData.titularCuenta || "",
            cuit: clubData.cuit || "",
            razonSocial: clubData.razonSocial || "",
          });
          setUsuarios(clubData.usuarios || []);
        }
      } catch (err) {
        console.error("Error al cargar config:", err);
      }
      setLoading(false);
    };
    cargar();
  }, [user]);

  const handleGuardar = async () => {
    if (!club) return;
    setGuardando(true);
    setMensaje("");
    try {
      await actualizarClubConfig(club.id, { ...form, usuarios });
      setClub({ ...club, ...form, usuarios });
      setMensaje("Configuración guardada");
      setTimeout(() => setMensaje(""), 3000);
    } catch (err) {
      console.error("Error al guardar:", err);
      setMensaje("Error al guardar");
    }
    setGuardando(false);
  };

  const toggleDia = (dia) => {
    const current = [...form.diasAbiertos];
    if (current.includes(dia)) {
      setForm({ ...form, diasAbiertos: current.filter((d) => d !== dia) });
    } else {
      setForm({ ...form, diasAbiertos: [...current, dia] });
    }
  };

  const agregarUsuario = () => {
    if (!nuevoUsuario.email.trim() || !nuevoUsuario.nombre.trim()) return;
    setUsuarios([...usuarios, { ...nuevoUsuario, id: Date.now().toString() }]);
    setNuevoUsuario({ email: "", nombre: "", rol: "encargado", telefono: "" });
  };

  const eliminarUsuario = (id) => {
    if (!window.confirm("¿Eliminar este usuario?")) return;
    setUsuarios(usuarios.filter((u) => u.id !== id));
  };

  const cambiarRolUsuario = (id, nuevoRol) => {
    setUsuarios(
      usuarios.map((u) => (u.id === id ? { ...u, rol: nuevoRol } : u)),
    );
  };

  if (loading) {
    return <div className="text-center text-slate-400 py-12">Cargando...</div>;
  }

  if (!club) {
    return (
      <div className="text-center py-16 bg-white rounded-2xl border border-slate-100 shadow-sm">
        <div className="text-5xl mb-4">⚙️</div>
        <p className="text-slate-500 font-medium">
          No tenés un club registrado
        </p>
      </div>
    );
  }

  const tabs = [
    { key: "datos", label: "Datos del club" },
    { key: "horarios", label: "Horarios" },
    { key: "redes", label: "Redes sociales" },
    { key: "facturacion", label: "Facturación" },
    { key: "usuarios", label: "Usuarios" },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-slate-800">Configuración</h1>
        <button
          onClick={handleGuardar}
          disabled={guardando}
          className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-50"
        >
          {guardando ? "Guardando..." : "Guardar cambios"}
        </button>
      </div>

      {mensaje && (
        <div
          className={`rounded-lg px-4 py-2 text-sm mb-4 ${
            mensaje.includes("Error")
              ? "bg-red-50 text-red-600 border border-red-200"
              : "bg-emerald-50 text-emerald-600 border border-emerald-200"
          }`}
        >
          {mensaje}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 overflow-x-auto pb-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition whitespace-nowrap ${
              tab === t.key
                ? "bg-emerald-600 text-white"
                : "bg-white text-slate-500 hover:bg-slate-100 border border-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Datos del club */}
      {tab === "datos" && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <h2 className="font-semibold text-slate-700 mb-4">Datos del club</h2>
          <div className="flex flex-col gap-4">
            <div>
              <label className={labelClass}>Nombre del club</label>
              <input
                type="text"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Dirección</label>
              <input
                type="text"
                placeholder="Ej: Av. Belgrano 1234"
                value={form.direccion}
                onChange={(e) =>
                  setForm({ ...form, direccion: e.target.value })
                }
                className={inputClass}
              />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className={labelClass}>Ciudad</label>
                <input
                  type="text"
                  value={form.ciudad}
                  onChange={(e) => setForm({ ...form, ciudad: e.target.value })}
                  className={inputClass}
                />
              </div>
              <div className="flex-1">
                <label className={labelClass}>Provincia</label>
                <input
                  type="text"
                  value={form.provincia}
                  onChange={(e) =>
                    setForm({ ...form, provincia: e.target.value })
                  }
                  className={inputClass}
                />
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className={labelClass}>Teléfono</label>
                <input
                  type="text"
                  placeholder="Ej: 385 1234567"
                  value={form.telefono}
                  onChange={(e) =>
                    setForm({ ...form, telefono: e.target.value })
                  }
                  className={inputClass}
                />
              </div>
              <div className="flex-1">
                <label className={labelClass}>Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className={inputClass}
                />
              </div>
            </div>

            {/* Logo placeholder */}
            <div>
              <label className={labelClass}>Logo del club</label>
              <div className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-xl mx-auto mb-2 flex items-center justify-center">
                  <span className="text-2xl text-slate-400">🏟️</span>
                </div>
                <p className="text-xs text-slate-400">
                  Subida de logo disponible próximamente
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Horarios */}
      {tab === "horarios" && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <h2 className="font-semibold text-slate-700 mb-4">
            Horario de atención
          </h2>
          <div className="flex flex-col gap-4">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className={labelClass}>Hora de apertura</label>
                <input
                  type="time"
                  value={form.horarioApertura}
                  onChange={(e) =>
                    setForm({ ...form, horarioApertura: e.target.value })
                  }
                  className={inputClass}
                />
              </div>
              <div className="flex-1">
                <label className={labelClass}>Hora de cierre</label>
                <input
                  type="time"
                  value={form.horarioCierre}
                  onChange={(e) =>
                    setForm({ ...form, horarioCierre: e.target.value })
                  }
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Días abiertos</label>
              <div className="flex flex-wrap gap-2">
                {diasSemana.map((dia) => (
                  <button
                    key={dia}
                    type="button"
                    onClick={() => toggleDia(dia)}
                    className={`px-3 py-2 rounded-xl text-sm font-semibold transition ${
                      form.diasAbiertos.includes(dia)
                        ? "bg-emerald-600 text-white"
                        : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                    }`}
                  >
                    {dia.slice(0, 3)}
                  </button>
                ))}
              </div>
            </div>

            <p className={tipClass}>
              💡 Estos horarios se muestran a los jugadores en el hub de
              canchas. Los horarios específicos de cada cancha se configuran en
              la sección Canchas.
            </p>
          </div>
        </div>
      )}

      {/* Redes sociales */}
      {tab === "redes" && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <h2 className="font-semibold text-slate-700 mb-4">Redes sociales</h2>
          <div className="flex flex-col gap-4">
            <div>
              <label className={labelClass}>Instagram</label>
              <input
                type="text"
                placeholder="@tuclub"
                value={form.instagram}
                onChange={(e) =>
                  setForm({ ...form, instagram: e.target.value })
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Facebook</label>
              <input
                type="text"
                placeholder="facebook.com/tuclub"
                value={form.facebook}
                onChange={(e) => setForm({ ...form, facebook: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>WhatsApp</label>
              <input
                type="text"
                placeholder="Ej: +54 385 1234567"
                value={form.whatsapp}
                onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Sitio web</label>
              <input
                type="text"
                placeholder="www.tuclub.com"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
        </div>
      )}

      {/* Facturación */}
      {tab === "facturacion" && (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <h2 className="font-semibold text-slate-700 mb-4">
            Datos de facturación
          </h2>
          <div className="flex flex-col gap-4">
            <div>
              <label className={labelClass}>Razón social</label>
              <input
                type="text"
                value={form.razonSocial}
                onChange={(e) =>
                  setForm({ ...form, razonSocial: e.target.value })
                }
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>CUIT</label>
              <input
                type="text"
                placeholder="Ej: 30-12345678-9"
                value={form.cuit}
                onChange={(e) => setForm({ ...form, cuit: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>CBU</label>
              <input
                type="text"
                placeholder="22 dígitos"
                value={form.cbu}
                onChange={(e) => setForm({ ...form, cbu: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Alias CBU</label>
              <input
                type="text"
                placeholder="Ej: CLUB.PADEL.SANTIAGO"
                value={form.alias}
                onChange={(e) => setForm({ ...form, alias: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Titular de la cuenta</label>
              <input
                type="text"
                value={form.titularCuenta}
                onChange={(e) =>
                  setForm({ ...form, titularCuenta: e.target.value })
                }
                className={inputClass}
              />
            </div>

            <p className={tipClass}>
              💡 Estos datos se usan para generar comprobantes y recibir pagos
              de inscripciones y reservas. Mantenelos actualizados.
            </p>
          </div>
        </div>
      )}

      {/* Usuarios */}
      {tab === "usuarios" && (
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <h2 className="font-semibold text-slate-700 mb-4">
              Agregar usuario
            </h2>
            <div className="flex flex-col gap-3">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={labelClass}>Nombre</label>
                  <input
                    type="text"
                    placeholder="Nombre completo"
                    value={nuevoUsuario.nombre}
                    onChange={(e) =>
                      setNuevoUsuario({
                        ...nuevoUsuario,
                        nombre: e.target.value,
                      })
                    }
                    className={inputClass}
                  />
                </div>
                <div className="flex-1">
                  <label className={labelClass}>Email</label>
                  <input
                    type="email"
                    placeholder="email@ejemplo.com"
                    value={nuevoUsuario.email}
                    onChange={(e) =>
                      setNuevoUsuario({
                        ...nuevoUsuario,
                        email: e.target.value,
                      })
                    }
                    className={inputClass}
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className={labelClass}>Teléfono</label>
                  <input
                    type="text"
                    placeholder="385 1234567"
                    value={nuevoUsuario.telefono}
                    onChange={(e) =>
                      setNuevoUsuario({
                        ...nuevoUsuario,
                        telefono: e.target.value,
                      })
                    }
                    className={inputClass}
                  />
                </div>
                <div className="flex-1">
                  <label className={labelClass}>Rol</label>
                  <select
                    value={nuevoUsuario.rol}
                    onChange={(e) =>
                      setNuevoUsuario({ ...nuevoUsuario, rol: e.target.value })
                    }
                    className={`${inputClass} bg-white`}
                  >
                    {rolesDisponibles.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                onClick={agregarUsuario}
                disabled={
                  !nuevoUsuario.email.trim() || !nuevoUsuario.nombre.trim()
                }
                className="bg-emerald-600 text-white font-semibold py-2 rounded-xl hover:bg-emerald-700 transition disabled:opacity-50"
              >
                Agregar usuario
              </button>
            </div>
          </div>

          {/* Lista de usuarios */}
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <h2 className="font-semibold text-slate-700 mb-4">
              Usuarios del club ({usuarios.length})
            </h2>

            {/* Dueño */}
            <div className="flex items-center justify-between bg-emerald-50 rounded-xl px-4 py-3 mb-3">
              <div>
                <p className="text-sm font-semibold text-slate-700">
                  {user?.email}
                </p>
                <p className="text-xs text-slate-400">Dueño del club</p>
              </div>
              <span className="text-xs font-semibold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">
                Dueño
              </span>
            </div>

            {usuarios.length === 0 ? (
              <p className="text-slate-400 text-sm text-center py-4">
                No hay otros usuarios agregados
              </p>
            ) : (
              <div className="flex flex-col gap-2">
                {usuarios.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-700">
                        {u.nombre}
                      </p>
                      <p className="text-xs text-slate-400">
                        {u.email} {u.telefono && `· ${u.telefono}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={u.rol}
                        onChange={(e) =>
                          cambiarRolUsuario(u.id, e.target.value)
                        }
                        className="border border-slate-200 rounded-lg px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      >
                        {rolesDisponibles.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => eliminarUsuario(u.id)}
                        className="text-xs font-semibold text-red-400 hover:text-red-600"
                      >
                        Eliminar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="mt-4 pt-3 border-t border-slate-100">
              <p className="text-xs text-slate-400 mb-2">Roles disponibles:</p>
              <div className="flex flex-col gap-1">
                {rolesDisponibles.map((r) => (
                  <div key={r.value} className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-slate-600 w-28">
                      {r.label}
                    </span>
                    <span className="text-xs text-slate-400">{r.desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <p className={tipClass}>
            💡 Recordá hacer clic en "Guardar cambios" arriba para que los
            usuarios y roles se guarden correctamente.
          </p>
        </div>
      )}
    </div>
  );
}
