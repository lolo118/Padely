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
    return <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>Cargando...</div>;

  if (!entidad)
    return (
      <div className="text-center py-16 themed-card rounded-2xl border">
        <p style={{ color: "var(--text-muted)" }}>No se encontró tu entidad organizadora</p>
      </div>
    );

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold" style={{ color: "var(--text-primary)" }}>Mi entidad</h1>
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

      <div className="themed-card rounded-2xl p-6 border">
        <div className="flex flex-col gap-4">
          <div>
            <label className={labelClass} style={{ color: "var(--text-muted)" }}>Nombre de la entidad</label>
            <input
              type="text"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} style={{ color: "var(--text-muted)" }}>Descripción / Bio</label>
            <textarea
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              rows={3}
              className={`${inputClass} resize-none`}
            />
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <label className={labelClass} style={{ color: "var(--text-muted)" }}>Teléfono</label>
              <input
                type="text"
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
                className={inputClass}
              />
            </div>
            <div className="flex-1">
              <label className={labelClass} style={{ color: "var(--text-muted)" }}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label className={labelClass} style={{ color: "var(--text-muted)" }}>Instagram</label>
            <input
              type="text"
              placeholder="@entidad"
              value={form.instagram}
              onChange={(e) => setForm({ ...form, instagram: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} style={{ color: "var(--text-muted)" }}>Facebook</label>
            <input
              type="text"
              value={form.facebook}
              onChange={(e) => setForm({ ...form, facebook: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass} style={{ color: "var(--text-muted)" }}>Sitio web</label>
            <input
              type="text"
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Logo de la entidad</label>
            <div className="border-2 border-dashed rounded-xl p-6 text-center" style={{ borderColor: "var(--border-input)" }}>
              <div className="w-16 h-16 rounded-xl mx-auto mb-2 flex items-center justify-center" style={{ backgroundColor: "var(--bg-card-hover)" }}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8" style={{ color: "var(--text-muted)" }}>
                  <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
                </svg>
              </div>
              <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>Subida de logo disponible próximamente</p>
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)", opacity: 0.6 }}>PNG o JPG, máximo 2MB</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
