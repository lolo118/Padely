import { useEffect, useState } from "react";
import { Check, Trash2 } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { confirmar } from "../../components/ConfirmDialog";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { Badge, Button, Card, Field, Input, Select } from "../../components/ui";

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

const rolLabel = (valor) => roles.find((r) => r.value === valor)?.label || valor;

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

  const eliminar = async (id) => {
    const ok = await confirmar({ titulo: "Eliminar miembro", mensaje: "¿Eliminar este miembro del equipo?", confirmText: "Eliminar", danger: true });
    if (!ok) return;
    guardar(equipo.filter((m) => m.id !== id));
  };

  if (loading)
    return (
      <div className="flex flex-col gap-6" aria-busy="true" aria-label="Cargando">
        <div className="pd-skeleton h-8 w-48" />
        <div className="pd-skeleton h-64 rounded-lg!" />
        <div className="pd-skeleton h-48 rounded-lg!" />
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="heading-lg m-0">Equipo de trabajo</h1>

      {mensaje && (
        <p className="flex items-center gap-2 body-sm text-success m-0" role="status">
          <Check className="pd-icon" size={20} aria-hidden="true" />
          {mensaje}
        </p>
      )}

      <Card>
        <Card.Title as="h2">Agregar miembro</Card.Title>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Nombre">
            <Input
              type="text"
              value={nuevo.nombre}
              onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
            />
          </Field>
          <Field label="Email">
            <Input
              type="email"
              value={nuevo.email}
              onChange={(e) => setNuevo({ ...nuevo, email: e.target.value })}
            />
          </Field>
          <Field label="Teléfono">
            <Input
              type="text"
              inputMode="tel"
              value={nuevo.telefono}
              onChange={(e) =>
                setNuevo({ ...nuevo, telefono: e.target.value })
              }
            />
          </Field>
          <Field label="Rol">
            <Select
              value={nuevo.rol}
              onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })}
            >
              {roles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Card.Foot>
          <Button
            variant="primary"
            onClick={agregar}
            disabled={!nuevo.nombre.trim() || !nuevo.email.trim() || guardando}
          >
            Agregar miembro
          </Button>
        </Card.Foot>
      </Card>

      <div className="pd-table-wrap">
        <div className="pd-table-head">
          <h3>
            Miembros <span className="pd-count text-ink-3 font-medium">{equipo.length + 1}</span>
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="pd-table">
            <thead>
              <tr>
                <th>Miembro</th>
                <th>Contacto</th>
                <th>Rol</th>
                <th>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <span className="font-semibold">{user?.email}</span>
                </td>
                <td className="body-sm text-ink-2!">Dueño / Organizador principal</td>
                <td>
                  <Badge tone="court">Dueño</Badge>
                </td>
                <td />
              </tr>
              {equipo.length === 0 ? (
                <tr>
                  <td colSpan={4} className="body-sm text-ink-3! text-center py-6!">
                    No hay otros miembros. Agregalos con el formulario de arriba.
                  </td>
                </tr>
              ) : (
                equipo.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <span className="font-semibold">{m.nombre}</span>
                    </td>
                    <td className="body-sm text-ink-2!">
                      {m.email} {m.telefono && `· ${m.telefono}`}
                    </td>
                    <td>
                      <Badge>{rolLabel(m.rol)}</Badge>
                    </td>
                    <td className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        iconOnly
                        icon={<Trash2 className="pd-icon" size={20} aria-hidden="true" />}
                        aria-label={`Eliminar a ${m.nombre}`}
                        onClick={() => eliminar(m.id)}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 border-t border-line">
          <p className="pd-eyebrow mb-2!">Roles</p>
          <dl className="m-0 flex flex-col gap-1">
            {roles.map((r) => (
              <div key={r.value} className="flex gap-2 body-sm">
                <dt className="font-semibold w-28 shrink-0">{r.label}</dt>
                <dd className="m-0 text-ink-2">{r.desc}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}
