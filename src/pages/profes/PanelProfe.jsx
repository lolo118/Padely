import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarDays, Camera, Clock, ExternalLink } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import useTituloPagina from "../../hooks/useTituloPagina";
import { cambiarMiVinculo, borrarVinculo, getProfe, guardarPerfilProfe, pedirSumarme, subirFotoProfe, useFlagProfes } from "../../services/profesService";
import { getClubesPublicos } from "../../services/canchaService";
import { DURACIONES_CLASE, EDADES_PROFE, ESPECIALIDADES_PROFE, NIVELES_PROFE, TIPOS_CLASE, normalizarPerfil } from "../../utils/profes";
import { provinciasArgentina } from "../../utils/provincias";
import { toast } from "../../components/Toast";
import { confirmar } from "../../components/ConfirmDialog";
import { AvatarProfe, ProfesApagado } from "../../components/profes/ProfeCard";
import DisponibilidadEditor from "../../components/profes/DisponibilidadEditor";
import { Alert, Badge, Button, Card, Field, Input, Pills, Select, Textarea } from "../../components/ui";

const LABEL_VINCULO = { pendiente: "Pedido enviado", invitado: "Te invitaron", activo: "Activo" };
const TONO_VINCULO = { pendiente: "warning", invitado: "court", activo: "success" };

const formInicial = (p, perfilUsuario) => ({
  nombre: p?.nombre || perfilUsuario?.nombre || "",
  foto: p?.foto || null,
  bio: p?.bio || "",
  experienciaAnios: p?.experienciaAnios ?? "",
  niveles: p?.niveles || [],
  edades: p?.edades || [],
  especialidades: p?.especialidades || [],
  ciudad: p?.ciudad || perfilUsuario?.ciudad || "",
  provincia: p?.provincia || perfilUsuario?.provincia || "",
  clases: TIPOS_CLASE.map((t) => {
    const c = (p?.clases || []).find((x) => x.tipo === t.id);
    return { tipo: t.id, activa: !!c?.activa, precio: c?.precio ? String(c.precio) : "", duracion: c?.duracion || 60, capacidad: c?.capacidad || t.capacidadDefecto };
  }),
  mostrarWhatsapp: !!p?.mostrarWhatsapp,
  whatsapp: p?.whatsapp || "",
  activo: p ? p.activo !== false : true,
});

// /profe/panel (flags.profes): cualquier jugador con cuenta activa su perfil de profe; acá lo edita, pide sumarse a
// clubes (o acepta invitaciones) y carga sus horarios por club.
export default function PanelProfe() {
  useTituloPagina("Mi perfil de profe");
  const flag = useFlagProfes();
  const user = useAuthStore((s) => s.user);
  const perfilUsuario = useAuthStore((s) => s.perfil);
  const [params] = useSearchParams();
  const [profe, setProfe] = useState(undefined);
  const [form, setForm] = useState(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [clubes, setClubes] = useState([]);
  const [clubPedir, setClubPedir] = useState(params.get("club") || "");
  const [pidiendo, setPidiendo] = useState(false);
  const [horariosDe, setHorariosDe] = useState(null); // { clubId, nombre }
  const [version, setVersion] = useState(0);
  const fotoInput = useRef(null);

  useEffect(() => {
    if (flag !== true || !user?.uid) return undefined;
    let vivo = true;
    getProfe(user.uid)
      .then((p) => {
        if (!vivo) return;
        setProfe(p);
        setForm((f) => f || formInicial(p, perfilUsuario));
      })
      .catch(() => vivo && setProfe(null));
    return () => {
      vivo = false;
    };
  }, [flag, user?.uid, version, perfilUsuario]);
  useEffect(() => {
    if (flag !== true) return undefined;
    let vivo = true;
    getClubesPublicos()
      .then((c) => vivo && setClubes(c))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [flag]);

  const misClubes = useMemo(() => Object.entries(profe?.clubes || {}).map(([id, c]) => ({ id, ...c })), [profe]);
  const clubesParaPedir = clubes.filter((c) => !misClubes.some((m) => m.id === c.id));

  if (flag === null || (flag && (profe === undefined || !form))) return <div className="pd-skeleton h-60 rounded-lg" aria-busy="true" aria-label="Cargando" />;
  if (!flag) return <ProfesApagado />;

  const campo = (k) => ({ value: form[k] ?? "", onChange: (e) => setForm((f) => ({ ...f, [k]: e.target.value })) });
  const cambiarClase = (tipo, k, v) => setForm((f) => ({ ...f, clases: f.clases.map((c) => (c.tipo === tipo ? { ...c, [k]: v } : c)) }));
  const alternar = (k) => (v) => setForm((f) => ({ ...f, [k]: f[k].includes(v) ? f[k].filter((x) => x !== v) : [...f[k], v] }));

  const guardar = async (e) => {
    e.preventDefault();
    setError("");
    const p = normalizarPerfil(form);
    if (p.error) return setError(p.error);
    setGuardando(true);
    try {
      await guardarPerfilProfe(user.uid, p, { nuevo: !profe });
      toast.success(profe ? "Perfil guardado" : "¡Listo! Ya tenés tu perfil de profe");
      setVersion((v) => v + 1);
    } catch (err) {
      console.error("Error guardando el perfil de profe:", err);
      setError("No pudimos guardar el perfil. Revisá los datos y probá de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  const subirFoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return toast.error("La foto tiene que pesar menos de 5 MB");
    setSubiendo(true);
    try {
      const url = await subirFotoProfe(user.uid, file);
      setForm((f) => ({ ...f, foto: url }));
      if (profe) await guardarPerfilProfe(user.uid, { foto: url });
      toast.success(profe ? "Foto actualizada" : "Foto lista: guardá el perfil para publicarla");
    } catch (err) {
      console.error("Error subiendo la foto:", err);
      toast.error("No pudimos subir la foto.");
    } finally {
      setSubiendo(false);
      if (fotoInput.current) fotoInput.current.value = "";
    }
  };

  const pedir = async () => {
    const club = clubes.find((c) => c.id === clubPedir);
    if (!club) return;
    setPidiendo(true);
    try {
      await pedirSumarme(club.id, user.uid, profe.nombre);
      toast.success(`Le pediste a ${club.nombre} sumarte como profe`);
      setClubPedir("");
      setTimeout(() => setVersion((v) => v + 1), 1500);
    } catch (err) {
      console.error("Error pidiendo sumarse:", err);
      toast.error("No pudimos enviar el pedido. ¿Ya lo pediste antes?");
    } finally {
      setPidiendo(false);
    }
  };
  const vinculo = async (c, accion) => {
    try {
      if (accion === "aceptar") await cambiarMiVinculo(c.id, user.uid, "activo");
      else if (accion === "cancelar") await borrarVinculo(c.id, user.uid);
      else {
        const ok = await confirmar({ titulo: "Dejar el club", mensaje: `Dejás de figurar como profe en ${c.nombre}. Las clases ya reservadas siguen en tu agenda.`, confirmText: "Dejar el club", danger: true });
        if (!ok) return;
        await cambiarMiVinculo(c.id, user.uid, "baja");
      }
      toast.success(accion === "aceptar" ? `Ya das clases en ${c.nombre}` : "Listo");
      setTimeout(() => setVersion((v) => v + 1), 1500);
    } catch (err) {
      console.error("Error con el vínculo:", err);
      toast.error("No pudimos hacer el cambio.");
    }
  };

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="heading-xl m-0">{profe ? "Mi perfil de profe" : "Activá tu perfil de profe"}</h1>
          <p className="body-sm text-ink-2 mt-1 mb-0">{profe ? "Tus datos públicos, tus clubes y tus horarios." : "Si das clases de pádel, armá tu perfil gratis: los jugadores te encuentran en Profes y reservan con vos."}</p>
        </div>
        {profe && (
          <div className="pd-btn-group">
            <Button as="link" to="/profe/agenda" size="sm" icon={<CalendarDays className="pd-icon" size={20} aria-hidden="true" />}>
              Mi agenda
            </Button>
            <Button as="link" to={`/profe/${user.uid}`} size="sm" variant="ghost" icon={<ExternalLink className="pd-icon" size={20} aria-hidden="true" />}>
              Ver mi perfil
            </Button>
          </div>
        )}
      </header>

      {profe && (
        <Card>
          <Card.Title as="h2">Mis clubes</Card.Title>
          <Card.Meta className="mt-1!">Das clases en los clubes que te aprueban. En cada uno cargás tus horarios.</Card.Meta>
          {misClubes.length === 0 ? (
            <p className="body-sm text-ink-2 mt-3 mb-0">Todavía no estás en ningún club.</p>
          ) : (
            <ul className="m-0 p-0 list-none divide-y divide-line mt-3">
              {misClubes.map((c) => (
                <li key={c.id} className="py-2 flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1">
                    <Link to={`/club/${c.id}`} className="font-semibold hover:underline">
                      {c.nombre || "Club"}
                    </Link>
                    <span className="block body-sm text-ink-3">
                      {c.ciudad}
                      {c.estado === "activo" ? ` · ${c.cobra === "club" ? "cobra el club" : "cobrás vos"}` : ""}
                    </span>
                  </span>
                  <Badge tone={TONO_VINCULO[c.estado] || "neutral"}>{LABEL_VINCULO[c.estado] || c.estado}</Badge>
                  <div className="pd-btn-group">
                    {c.estado === "invitado" && (
                      <>
                        <Button size="sm" variant="primary" onClick={() => vinculo(c, "aceptar")}>
                          Aceptar
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => vinculo(c, "baja")}>
                          Rechazar
                        </Button>
                      </>
                    )}
                    {c.estado === "pendiente" && (
                      <Button size="sm" variant="ghost" onClick={() => vinculo(c, "cancelar")}>
                        Cancelar pedido
                      </Button>
                    )}
                    {c.estado === "activo" && (
                      <>
                        <Button size="sm" icon={<Clock className="pd-icon" size={20} aria-hidden="true" />} onClick={() => setHorariosDe({ clubId: c.id, nombre: c.nombre })}>
                          Horarios
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => vinculo(c, "baja")}>
                          Dejar
                        </Button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 flex flex-wrap items-end gap-2">
            <Field label="Sumarme a un club" className="flex-1 min-w-[220px]">
              <Select value={clubPedir} onChange={(e) => setClubPedir(e.target.value)}>
                <option value="">Elegí un club</option>
                {clubesParaPedir.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                    {c.ciudad ? ` · ${c.ciudad}` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Button onClick={pedir} disabled={!clubPedir} cargando={pidiendo ? "Enviando…" : ""}>
              Pedir sumarme
            </Button>
          </div>
        </Card>
      )}

      <Card as="form" onSubmit={guardar} noValidate>
        <Card.Title as="h2">Perfil público</Card.Title>
        <div className="flex items-center gap-3 mt-3">
          <AvatarProfe profe={{ nombre: form.nombre, foto: form.foto }} size={64} />
          <input ref={fotoInput} type="file" accept="image/*" onChange={subirFoto} className="hidden" aria-label="Elegir foto de profe" />
          <Button size="sm" icon={<Camera className="pd-icon" size={20} aria-hidden="true" />} onClick={() => fotoInput.current?.click()} cargando={subiendo ? "Subiendo…" : ""}>
            {form.foto ? "Cambiar foto" : "Subir foto"}
          </Button>
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Nombre para mostrar">
            <Input {...campo("nombre")} maxLength={80} />
          </Field>
          <Field label="Años de experiencia">
            <Input {...campo("experienciaAnios")} type="number" min="0" max="60" inputMode="numeric" className="pd-tnum" />
          </Field>
          <Field label="Ciudad">
            <Input {...campo("ciudad")} maxLength={60} />
          </Field>
          <Field label="Provincia">
            <Select {...campo("provincia")}>
              <option value="">—</option>
              {provinciasArgentina.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Sobre vos" help="Cómo das tus clases, a quién, qué te importa. Hasta 600 letras." className="mt-4">
          <Textarea {...campo("bio")} rows={4} maxLength={600} />
        </Field>
        <p className="pd-label mt-4 mb-2">Niveles</p>
        <Pills multi items={NIVELES_PROFE.map((n) => ({ value: n, label: n }))} value={form.niveles} onChange={alternar("niveles")} ariaLabel="Niveles" className="flex-wrap!" />
        <p className="pd-label mt-4 mb-2">Edades</p>
        <Pills multi items={EDADES_PROFE.map((n) => ({ value: n, label: n }))} value={form.edades} onChange={alternar("edades")} ariaLabel="Edades" className="flex-wrap!" />
        <p className="pd-label mt-4 mb-2">Especialidades</p>
        <Pills multi items={ESPECIALIDADES_PROFE.map((n) => ({ value: n, label: n }))} value={form.especialidades} onChange={alternar("especialidades")} ariaLabel="Especialidades" className="flex-wrap!" />

        <h3 className="heading-sm mt-6 mb-1">Clases que das</h3>
        <p className="body-sm text-ink-3 m-0">En de a 2, grupal y clínica el precio es por alumno. Cada club puede tener su propia tarifa.</p>
        <ul className="m-0 p-0 list-none divide-y divide-line mt-2">
          {TIPOS_CLASE.map((t) => {
            const c = form.clases.find((x) => x.tipo === t.id);
            return (
              <li key={t.id} className="py-3 flex flex-wrap items-end gap-3">
                <label className="flex items-center gap-2 w-36 pb-2">
                  <input type="checkbox" checked={c.activa} onChange={(e) => cambiarClase(t.id, "activa", e.target.checked)} className="h-5 w-5 accent-ink" />
                  <span className="font-semibold">{t.label}</span>
                </label>
                {c.activa && (
                  <>
                    <Field label="Precio ($)" className="w-32">
                      <Input value={c.precio} onChange={(e) => cambiarClase(t.id, "precio", e.target.value)} type="number" min="0" inputMode="numeric" className="pd-tnum" />
                    </Field>
                    <Field label="Duración" className="w-32">
                      <Select value={c.duracion} onChange={(e) => cambiarClase(t.id, "duracion", Number(e.target.value))}>
                        {DURACIONES_CLASE.map((d) => (
                          <option key={d} value={d}>
                            {d} min
                          </option>
                        ))}
                      </Select>
                    </Field>
                    {t.capacidadMin !== t.capacidadMax && (
                      <Field label="Hasta (alumnos)" className="w-32">
                        <Input value={c.capacidad} onChange={(e) => cambiarClase(t.id, "capacidad", e.target.value)} type="number" min={t.capacidadMin} max={t.capacidadMax} inputMode="numeric" className="pd-tnum" />
                      </Field>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>

        <h3 className="heading-sm mt-6 mb-1">Contacto</h3>
        <label className="flex items-start gap-3 body-sm mt-2">
          <input type="checkbox" checked={form.mostrarWhatsapp} onChange={(e) => setForm((f) => ({ ...f, mostrarWhatsapp: e.target.checked }))} className="h-5 w-5 mt-0.5 accent-ink" />
          <span>
            Mostrar mi WhatsApp en el perfil
            <span className="block text-ink-3">Si no lo mostrás, los alumnos reservan desde Padely y te llega el aviso. Tu email nunca se muestra.</span>
          </span>
        </label>
        {form.mostrarWhatsapp && (
          <Field label="WhatsApp (con característica)" className="mt-3 max-w-xs">
            <Input {...campo("whatsapp")} inputMode="tel" maxLength={20} placeholder="Ej: 3854123456" />
          </Field>
        )}
        <label className="flex items-start gap-3 body-sm mt-4">
          <input type="checkbox" checked={form.activo} onChange={(e) => setForm((f) => ({ ...f, activo: e.target.checked }))} className="h-5 w-5 mt-0.5 accent-ink" />
          <span>
            Aparecer en Profes y aceptar reservas
            <span className="block text-ink-3">Destildalo para pausar tu perfil (tus elogios se guardan).</span>
          </span>
        </label>
        {error && (
          <Alert tone="danger" className="mt-4">
            {error}
          </Alert>
        )}
        <Button type="submit" variant="primary" className="mt-4" cargando={guardando ? "Guardando…" : ""}>
          {profe ? "Guardar perfil" : "Activar mi perfil de profe"}
        </Button>
      </Card>

      {horariosDe && <DisponibilidadEditor uid={user.uid} clubId={horariosDe.clubId} clubNombre={horariosDe.nombre} onCerrar={() => setHorariosDe(null)} />}
    </div>
  );
}
