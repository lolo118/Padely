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
import { uploadOrgLogo } from "../../services/storageService";

const inputClass =
  "themed-input rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-full";
const labelClass = "text-xs font-semibold mb-1 block";

export default function OrgEntidad() {
  const { user } = useAuthStore();
  const [entidad, setEntidad] = useState(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [logoUrl, setLogoUrl] = useState(null);
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
          if (data.logoUrl) setLogoUrl(data.logoUrl);
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

  const handleSubirLogo = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert("La imagen no puede superar los 5MB"); return; }
    setSubiendoLogo(true);
    try {
      const url = await uploadOrgLogo(entidad.id, file);
      await updateDoc(doc(db, "organizers", entidad.id), { logoUrl: url });
      setLogoUrl(url);
    } catch (err) { console.error("Error subiendo logo:", err); }
    setSubiendoLogo(false);
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
            <div className="flex flex-col items-center justify-center py-6 rounded-xl border-2 border-dashed" style={{ borderColor: "var(--border-input)" }}>
              {logoUrl ? (
                <div className="relative group">
                  <img src={logoUrl} alt="Logo de la entidad" className="h-24 max-w-[200px] object-contain rounded-lg" />
                  <label className="absolute inset-0 flex items-center justify-center rounded-lg cursor-pointer bg-black/40 opacity-0 group-hover:opacity-100 transition">
                    <span className="text-white text-xs font-semibold">{subiendoLogo ? "Subiendo..." : "Cambiar logo"}</span>
                    <input type="file" accept="image/*" onChange={handleSubirLogo} disabled={subiendoLogo} className="hidden" />
                  </label>
                </div>
              ) : (
                <label className="flex flex-col items-center cursor-pointer">
                  <div className="text-4xl mb-2">🏆</div>
                  <span className="text-sm font-semibold" style={{ color: "var(--accent)" }}>
                    {subiendoLogo ? "Subiendo logo..." : "Subir logo de la entidad"}
                  </span>
                  <span className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>PNG, JPG o SVG (máx. 5MB)</span>
                  <input type="file" accept="image/*" onChange={handleSubirLogo} disabled={subiendoLogo} className="hidden" />
                </label>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
