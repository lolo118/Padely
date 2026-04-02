import { useEffect, useState } from "react";
import { useAuthStore } from "../../store/authStore";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../lib/firebase";

const inputClass =
  "themed-input rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full";
const labelClass = "text-xs font-semibold mb-1 block";

const roles = [
  {
    value: "co-organizador",
    label: "Co-organizador",
    desc: "Puede crear y gestionar torneos",
  },
  {
    value: "asistente",
    label: "Asistente",
    desc: "Puede cargar resultados y gestionar parejas",
  },
  {
    value: "arbitro",
    label: "Árbitro",
    desc: "Solo puede cargar resultados de partidos",
  },
];

export default function OrgEquipo() {
  const { user } = useAuthStore();
  const [entidad, setEntidad] = useState(null);
  const [equipo, setEquipo] = useState([]);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [nuevo, setNuevo] = useState({
    nombre: "",
    email: "",
    telefono: "",
    rol: "asistente",
  });

  useEffect(() => {
    if (!user) return;
    const cargar = async () => {
      try {
        const q = query(
          collection(db, "organizers"),
          where("ownerUid", "==", user.uid),
        );
        const snap = await getDocs(q);
        if (snap.docs.length > 0) {
          const data = { id: snap.docs[0].id, ...snap.docs[0].data() };
          setEntidad(data);
          setEquipo(data.equipo || []);
        }
      } catch (err) {
        console.error("Error:", err);
      }
      setLoading(false);
    };
    cargar();
  }, [user]);

  const guardar = async (equipoActualizado) => {
    if (!entidad) return;
    setGuardando(true);
    try {
      await updateDoc(doc(db, "organizers", entidad.id), {
        equipo: equipoActualizado,
      });
      setEquipo(equipoActualizado);
      setMensaje("Guardado");
      setTimeout(() => setMensaje(""), 3000);
    } catch (err) {
      console.error("Error:", err);
    }
    setGuardando(false);
  };

  const agregar = () => {
    if (!nuevo.nombre.trim() || !nuevo.email.trim()) return;
    const actualizado = [...equipo, { ...nuevo, id: Date.now().toString() }];
    guardar(actualizado);
    setNuevo({ nombre: "", email: "", telefono: "", rol: "asistente" });
  };

  const eliminar = (id) => {
    if (!window.confirm("¿Eliminar este miembro?")) return;
    guardar(equipo.filter((m) => m.id !== id));
  };

  if (loading)
    return <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>Cargando...</div>;

  return (
    <div>
      <h1 className="text-xl font-bold mb-6" style={{ color: "var(--text-primary)" }}>
        Equipo de trabajo
      </h1>

      {mensaje && (
        <div className="bg-emerald-50 text-emerald-600 text-sm p-3 rounded-lg mb-4 border border-emerald-200">
          {mensaje}
        </div>
      )}

      <div className="themed-card rounded-2xl p-6 border mb-4">
        <h2 className="font-semibold mb-4" style={{ color: "var(--text-primary)" }}>Agregar miembro</h2>
        <div className="flex flex-col gap-3">
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelClass} style={{ color: "var(--text-muted)" }}>Nombre</label>
              <input
                type="text"
                value={nuevo.nombre}
                onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="flex-1">
              <label className={labelClass} style={{ color: "var(--text-muted)" }}>Email</label>
              <input
                type="email"
                value={nuevo.email}
                onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelClass} style={{ color: "var(--text-muted)" }}>Teléfono</label>
              <input
                type="text"
                value={nuevo.telefono}
                onChange={(e) =>
                  setNuevo({ ...nuevo, telefono: e.target.value })
                }
                className={inputClass}
              />
            </div>
            <div className="flex-1">
              <label className={labelClass} style={{ color: "var(--text-muted)" }}>Rol</label>
              <select
                value={nuevo.rol}
                onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })}
                className={inputClass}
              >
                {roles.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={agregar}
            disabled={!nuevo.nombre.trim() || !nuevo.email.trim() || guardando}
            className="bg-blue-600 text-white font-semibold py-2 rounded-xl hover:bg-blue-700 transition disabled:opacity-50"
          >
            Agregar miembro
          </button>
        </div>
      </div>

      <div className="themed-card rounded-2xl p-6 border">
        <h2 className="font-semibold mb-4" style={{ color: "var(--text-primary)" }}>
          Miembros ({equipo.length + 1})
        </h2>

        <div className="flex items-center justify-between rounded-xl px-4 py-3 mb-3" style={{ backgroundColor: "rgba(59,130,246,0.1)" }}>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {user?.email}
            </p>
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Dueño / Organizador principal
            </p>
          </div>
          <span className="text-xs font-semibold px-2 py-1 rounded-full bg-blue-100 text-blue-700">
            Dueño
          </span>
        </div>

        {equipo.length === 0 ? (
          <p className="text-sm text-center py-4" style={{ color: "var(--text-muted)" }}>
            No hay otros miembros
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {equipo.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between rounded-xl px-4 py-3"
                style={{ backgroundColor: "var(--bg-card-hover)" }}
              >
                <div>
                  <p className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                    {m.nombre}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                    {m.email} {m.telefono && `· ${m.telefono}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-slate-200 text-slate-600 capitalize">
                    {m.rol}
                  </span>
                  <button
                    onClick={() => eliminar(m.id)}
                    className="text-xs text-red-400 hover:text-red-600 font-semibold"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4 pt-3 border-t" style={{ borderColor: "var(--border-card)" }}>
          <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>Roles:</p>
          {roles.map((r) => (
            <div key={r.value} className="flex gap-2 mb-1">
              <span className="text-xs font-semibold w-28" style={{ color: "var(--text-primary)" }}>
                {r.label}
              </span>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>{r.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
