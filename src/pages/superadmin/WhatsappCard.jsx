import { useEffect, useState } from "react";
import { Badge, Button, Card, Field, Input, Select } from "../../components/ui";
import { toast } from "../../components/Toast";
import { confirmar } from "../../components/ConfirmDialog";
import { conectarWhatsapp, desconectarWhatsapp, getConexionesWhatsapp } from "../../services/whatsappService";

// Super-admin → Planes: conectar el número de WhatsApp (Cloud API de Meta) de un club al bot de reservas. Por ahora
// con los datos que da Meta (Phone number ID, WhatsApp Business Account ID y un token); más adelante el dueño lo hará
// solo con "Conectar WhatsApp" (Embedded Signup). Pasos de Meta: docs/WHATSAPP.md.
const VACIO = { clubId: "", phoneNumberId: "", wabaId: "", token: "" };

export default function WhatsappCard({ clubes }) {
  const [conexiones, setConexiones] = useState(null);
  const [form, setForm] = useState(VACIO);
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [quitando, setQuitando] = useState("");

  const cargar = () =>
    getConexionesWhatsapp()
      .then(setConexiones)
      .catch((err) => {
        console.error("Error cargando las conexiones de WhatsApp:", err);
        setConexiones([]);
      });
  useEffect(() => {
    cargar();
  }, []);

  const campo = (k) => ({ value: form[k], onChange: (e) => setForm((f) => ({ ...f, [k]: e.target.value })) });
  const nombreClub = (id) => (clubes || []).find((c) => c.id === id)?.nombre || id;

  const conectar = async (e) => {
    e.preventDefault();
    const err = {};
    if (!form.clubId) err.clubId = "Elegí el club";
    if (!/^\d{5,30}$/.test(form.phoneNumberId.trim())) err.phoneNumberId = "Es un número largo (Phone number ID de Meta)";
    if (!/^\d{5,30}$/.test(form.wabaId.trim())) err.wabaId = "Es un número largo (WhatsApp Business Account ID)";
    if (form.token.trim().length < 20) err.token = "Pegá el token de acceso de Meta";
    setErrores(err);
    if (Object.keys(err).length) return;
    setGuardando(true);
    try {
      const r = await conectarWhatsapp(form);
      toast.success(`WhatsApp conectado${r?.numeroVisible ? ` (${r.numeroVisible})` : ""}`);
      setForm(VACIO);
      cargar();
    } catch (error) {
      console.error("Error conectando WhatsApp:", error);
      toast.error(error?.message || "No pudimos conectar el número.");
    } finally {
      setGuardando(false);
    }
  };

  const desconectar = async (c) => {
    const ok = await confirmar({ titulo: "Desconectar WhatsApp", mensaje: `El bot deja de responder en el número de ${nombreClub(c.clubId)} y se borra el token guardado.`, confirmText: "Desconectar", danger: true });
    if (!ok) return;
    setQuitando(c.clubId);
    try {
      await desconectarWhatsapp(c.clubId);
      toast.success("WhatsApp desconectado");
      cargar();
    } catch (error) {
      console.error("Error desconectando WhatsApp:", error);
      toast.error("No pudimos desconectar el número.");
    } finally {
      setQuitando("");
    }
  };

  return (
    <Card as="form" onSubmit={conectar} noValidate>
      <Card.Title as="h2">WhatsApp de los clubes</Card.Title>
      <Card.Meta className="mt-1!">Bot de reservas en el número de cada club. Se prende con “Bot de reservas por WhatsApp” en Funciones de la plataforma.</Card.Meta>

      {conexiones === null ? (
        <p className="body-sm text-ink-2 mt-3">Cargando…</p>
      ) : conexiones.length === 0 ? (
        <p className="body-sm text-ink-2 mt-3">Todavía no hay números conectados.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {conexiones.map((c) => (
            <li key={c.phoneNumberId} className="flex flex-wrap items-center gap-2 body-sm">
              <span className="font-medium">{c.clubNombre || nombreClub(c.clubId)}</span>
              <span className="text-ink-2 pd-tnum">{c.numeroVisible || c.phoneNumberId}</span>
              <Badge tone={c.estado === "conectado" ? "success" : "neutral"}>{c.estado === "conectado" ? "Conectado" : c.estado || "—"}</Badge>
              <Button type="button" variant="ghost" size="sm" onClick={() => desconectar(c)} cargando={quitando === c.clubId ? "Desconectando…" : ""} className="ml-auto">
                Desconectar
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Club" error={errores.clubId}>
          <Select {...campo("clubId")}>
            <option value="">Elegí un club</option>
            {(clubes || []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre || c.id}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Phone number ID" help="Meta → WhatsApp → API Setup" error={errores.phoneNumberId}>
          <Input {...campo("phoneNumberId")} inputMode="numeric" autoComplete="off" className="pd-tnum" />
        </Field>
        <Field label="WhatsApp Business Account ID" error={errores.wabaId}>
          <Input {...campo("wabaId")} inputMode="numeric" autoComplete="off" className="pd-tnum" />
        </Field>
        <Field label="Token de acceso" help="Se guarda cifrado en el servidor y no se vuelve a mostrar." error={errores.token}>
          <Input {...campo("token")} type="password" autoComplete="off" spellCheck={false} />
        </Field>
      </div>
      <div className="mt-4">
        <Button type="submit" variant="primary" cargando={guardando ? "Conectando…" : ""}>
          Conectar número
        </Button>
      </div>
    </Card>
  );
}
