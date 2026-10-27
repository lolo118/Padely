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
import { Check, Upload } from "lucide-react";
import { db } from "../../lib/firebase";
import { uploadOrgLogo } from "../../services/storageService";
import { toast } from "../../components/Toast";
import { Button, Card, Field, Input, Textarea } from "../../components/ui";
import MpOrganizadorCard from "../../components/pagos/MpOrganizadorCard";

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
    if (file.size > 5 * 1024 * 1024) { toast.error("La imagen no puede superar los 5MB"); return; }
    setSubiendoLogo(true);
    try {
      const url = await uploadOrgLogo(entidad.id, file);
      await updateDoc(doc(db, "organizers", entidad.id), { logoUrl: url });
      setLogoUrl(url);
      toast.success("Logo actualizado");
    } catch (err) {
      console.error("Error subiendo logo:", err);
      toast.error("No pudimos subir el logo. Intentá de nuevo.");
    }
    setSubiendoLogo(false);
  };

  if (loading)
    return (
      <div className="flex flex-col gap-6" aria-busy="true" aria-label="Cargando">
        <div className="pd-skeleton h-8 w-40" />
        <div className="pd-skeleton h-[520px] rounded-lg!" />
      </div>
    );

  if (!entidad)
    return (
      <Card className="text-center py-12!">
        <span className="pd-ball mx-auto mb-3 block!" aria-hidden="true" />
        <p className="heading-sm m-0">No se encontró tu entidad organizadora</p>
      </Card>
    );

  const textoLogo = subiendoLogo ? "Subiendo logo…" : logoUrl ? "Cambiar logo" : "Subir logo de la entidad";

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-4">
        <h1 className="heading-lg m-0">Mi entidad</h1>
        <Button variant="primary" onClick={handleGuardar} cargando={guardando ? "Guardando…" : ""}>
          Guardar
        </Button>
      </div>

      <MpOrganizadorCard entidad={entidad} onCambio={() => setEntidad((e) => (e ? { ...e, mercadoPago: { ...(e.mercadoPago || {}), conectado: false } } : e))} />

      {mensaje && (
        <p className="flex items-center gap-2 body-sm text-success m-0" role="status">
          <Check className="pd-icon" size={20} aria-hidden="true" />
          {mensaje}
        </p>
      )}

      <Card>
        <div className="flex flex-col gap-4">
          <Field label="Nombre de la entidad">
            <Input
              type="text"
              value={form.nombre}
              onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            />
          </Field>
          <Field label="Descripción / Bio">
            <Textarea
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              rows={3}
            />
          </Field>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Teléfono">
              <Input
                type="text"
                inputMode="tel"
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: e.target.value })}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
          </div>
          <Field label="Instagram">
            <Input
              type="text"
              placeholder="@entidad"
              value={form.instagram}
              onChange={(e) => setForm({ ...form, instagram: e.target.value })}
            />
          </Field>
          <Field label="Facebook">
            <Input
              type="text"
              value={form.facebook}
              onChange={(e) => setForm({ ...form, facebook: e.target.value })}
            />
          </Field>
          <Field label="Sitio web">
            <Input
              type="text"
              value={form.website}
              onChange={(e) => setForm({ ...form, website: e.target.value })}
            />
          </Field>
          <Field as="div" label="Logo de la entidad" help="PNG, JPG o SVG (máx. 5MB)">
            <div className="flex flex-wrap items-center gap-4">
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt="Logo de la entidad"
                  className="h-24 max-w-[200px] object-contain rounded-sm border border-line bg-surface-sunken p-2"
                />
              )}
              <label className="pd-btn" aria-disabled={subiendoLogo || undefined}>
                <Upload className="pd-icon" size={20} aria-hidden="true" />
                {textoLogo}
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleSubirLogo}
                  disabled={subiendoLogo}
                  className="sr-only"
                />
              </label>
            </div>
          </Field>
        </div>
      </Card>
    </div>
  );
}
