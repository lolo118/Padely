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
  "border border-slate-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full";
const labelClass = "text-xs font-semibold text-slate-500 mb-1 block";

export default function OrgEntidad() {
  const { user } = useAuthStore();
  const [entidad, setEntidad] = useState(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [form, setForm] = useState({
    nombre: "",
    telefono: "",
    email: "",
    instagram: "",
    facebook: "",
    website: "",
    bio: "",
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
          setForm({
            nombre: data.nombre || "",
            telefono: data.telefono || "",
            email: data.email || "",
            instagram: data.instagram || "",
            facebook: data.facebook || "",
            website: data.website || "",
            bio: data.bio || "",
          });
        }
      } catch (err) {
        console.error("Error:", err);
      }
      setLoading(false);
    };
    cargar();
  }, [user]);

  const handleGuardar = async () => {
    if (!entidad) return;
    setGuardando(true);
    try {
      await updateDoc(doc(db, "organizers", entidad.id), form);
      setEntidad({ ...entidad, ...form });
      setMensaje("Guardado");
      setTimeout(() => setMensaje(""), 3000);
    } catch (err) {
      console.error("Error:", err);
    }
    setGuardando(false);
  };

  if (loading)
    return <div className="text-center text-slate-400 py-12">Cargando...</div>;

  if (!entidad)
    return (
      <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
        <p className="text-slate-500">No se encontró tu entidad organizadora</p>
      </div>
    );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-slate-800">Mi entidad</h1>
        <button
          onClick={handleGuardar}
          disabled={guardando}
          className="bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-blue-700 transition disabled:opacity-50"
        >
          {guardando ? "Guardando..." : "Guardar"}
        </button>
      </div>

      {mensaje && (
        <div className="bg-emerald-50 text-emerald-600 text-sm p-3 rounded-lg mb-4 border border-emerald-200">
          {mensaje}
        </div>
      )}

      <div className="bg-white rounded-2xl p-6 border border-slate-200">
        <div className="flex flex-col gap-4">
          <div>
            <label className={labelClass}>Nombre de la entidad</label>
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Descripción / Bio</label>
            <textarea
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelClass}>Teléfono</label>
              <input
                type="text"
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
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
          <div>
            <label className={labelClass}>Instagram</label>
            <input
              type="text"
              placeholder="@entidad"
              value={form.instagram}
              onChange={(e) => setForm({ ...form, instagram: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Facebook</label>
            <input
              type="text"
              value={form.facebook}
              onChange={(e) => setForm({ ...form, facebook: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Sitio web</label>
            <input
              type="text"
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              className={inputClass}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
