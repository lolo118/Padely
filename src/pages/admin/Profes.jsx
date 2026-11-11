import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Copy, Settings2, UserPlus, X } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { getCanchas } from "../../services/canchaService";
import { actualizarVinculo, borrarVinculo, cancelarClase, getClasesDeClub, getProfesDeClub, getReportesDeClub, getVinculosDeClub, invitarProfe, useFlagProfes } from "../../services/profesService";
import { TIPOS_CLASE, inscriptosDe, labelTipoClase, normalizarVinculo } from "../../utils/profes";
import { formatDiaCorto, getTodayLocal } from "../../utils/formatDate";
import { toast } from "../../components/Toast";
import { confirmar } from "../../components/ConfirmDialog";
import Dialogo from "../../components/Dialogo";
import SinPermiso from "../../components/SinPermiso";
import { ProfesApagado } from "../../components/profes/ProfeCard";
import { Alert, Badge, Button, Card, Field, Input, Pills, Tabs } from "../../components/ui";

const LABEL = { pendiente: "Pide sumarse", invitado: "Invitado", activo: "Activo", baja: "De baja" };
const TONO = { pendiente: "warning", invitado: "court", activo: "success", baja: "neutral" };
const linkParaProfes = (clubId) => `${typeof window !== "undefined" ? window.location.origin : ""}/profe/panel?club=${clubId}`;

function ConfigurarDialog({ clubId, vinculo, canchas, onCerrar, onListo }) {
  const [datos, setDatos] = useState(() => ({
    cobra: vinculo.cobra === "club" ? "club" : "profe",
    bloqueaCancha: vinculo.bloqueaCancha !== false,
    canchas: vinculo.canchas || [],
    tarifas: Object.fromEntries(TIPOS_CLASE.map((t) => [t.id, vinculo.tarifas?.[t.id] ? String(vinculo.tarifas[t.id]) : ""])),
  }));
  const [guardando, setGuardando] = useState(false);
  const guardar = async () => {
    setGuardando(true);
    try {
      await actualizarVinculo(clubId, vinculo.id, normalizarVinculo(datos, canchas.map((c) => c.id)));
      toast.success("Profe configurado");
      onListo();
    } catch (err) {
      console.error("Error configurando al profe:", err);
      toast.error("No pudimos guardar.");
      setGuardando(false);
    }
  };
  return (
    <Dialogo
      titulo={`Configurar a ${vinculo.nombre || "el profe"}`}
      ancho
      onCerrar={onCerrar}
      onSubmit={guardar}
      acciones={
        <>
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" variant="primary" cargando={guardando ? "Guardando…" : ""}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="mt-4 flex flex-col gap-4">
        <div>
          <p className="pd-label mb-2">¿Quién cobra la clase?</p>
          <Pills
            items={[
              { value: "profe", label: "El profe" },
              { value: "club", label: "El club" },
            ]}
            value={datos.cobra}
            onChange={(v) => setDatos((d) => ({ ...d, cobra: v }))}
            ariaLabel="Quién cobra"
          />
          <p className="body-sm text-ink-3 mt-2 mb-0">Si cobra el club y tenés Mercado Pago conectado, el alumno puede pagar online (Padely cobra una comisión sobre esos pagos). Siempre se puede pagar en el club o al profe.</p>
        </div>
        <label className="flex items-start gap-3 body-sm">
          <input type="checkbox" checked={datos.bloqueaCancha} onChange={(e) => setDatos((d) => ({ ...d, bloqueaCancha: e.target.checked }))} className="h-5 w-5 mt-0.5 accent-ink" />
          <span>
            Sus clases reservan cancha
            <span className="block text-ink-3">La clase aparece en la grilla como "Clase · {vinculo.nombre}" y nadie más puede reservar ese turno.</span>
          </span>
        </label>
        {datos.bloqueaCancha && canchas.length > 0 && (
          <div>
            <p className="pd-label mb-2">Canchas para sus clases (ninguna elegida = cualquiera libre)</p>
            <Pills multi items={canchas.map((c) => ({ value: c.id, label: c.nombre }))} value={datos.canchas} onChange={(v) => setDatos((d) => ({ ...d, canchas: d.canchas.includes(v) ? d.canchas.filter((x) => x !== v) : [...d.canchas, v] }))} ariaLabel="Canchas" className="flex-wrap!" />
          </div>
        )}
        <div>
          <p className="pd-label mb-2">Tarifas del club (opcional: si no, rige el precio del profe)</p>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            {TIPOS_CLASE.map((t) => (
              <Field key={t.id} label={t.label}>
                <Input value={datos.tarifas[t.id]} onChange={(e) => setDatos((d) => ({ ...d, tarifas: { ...d.tarifas, [t.id]: e.target.value } }))} type="number" min="0" inputMode="numeric" className="pd-tnum" placeholder="—" />
              </Field>
            ))}
          </div>
        </div>
      </div>
    </Dialogo>
  );
}

// /admin/profes (flags.profes): los profes del club (pedidos, invitaciones, configuración), sus clases en el club y
// los avisos privados de los alumnos. Configura quien tiene configurarClub; las clases las ve también quien reserva.
export default function AdminProfes() {
  const flag = useFlagProfes();
  const club = useAuthStore((s) => s.clubActual);
  const puede = useAuthStore((s) => s.puede);
  const user = useAuthStore((s) => s.user);
  const clubId = club?.id;
  const puedeConfigurar = puede("configurarClub");
  const puedeVer = puedeConfigurar || puede("gestionarReservas");
  const esDueño = !!club && club.ownerUid === user?.uid;
  const [tab, setTab] = useState(puedeConfigurar ? "profes" : "clases");
  const [vinculos, setVinculos] = useState(null);
  const [perfiles, setPerfiles] = useState({});
  const [canchas, setCanchas] = useState([]);
  const [clases, setClases] = useState(null);
  const [reportes, setReportes] = useState(null);
  const [email, setEmail] = useState("");
  const [invitando, setInvitando] = useState(false);
  const [avisoInvitar, setAvisoInvitar] = useState("");
  const [configurar, setConfigurar] = useState(null);
  const [version, setVersion] = useState(0);
  const hoy = getTodayLocal();

  useEffect(() => {
    if (flag !== true || !clubId || !puedeVer) return undefined;
    let vivo = true;
    Promise.all([getVinculosDeClub(clubId), getProfesDeClub(clubId), getCanchas(clubId), getClasesDeClub(clubId, hoy), esDueño ? getReportesDeClub(clubId) : Promise.resolve([])])
      .then(([v, p, c, cl, r]) => {
        if (!vivo) return;
        setVinculos(v.sort((a, b) => ["pendiente", "invitado", "activo", "baja"].indexOf(a.estado) - ["pendiente", "invitado", "activo", "baja"].indexOf(b.estado)));
        setPerfiles(Object.fromEntries(p.map((x) => [x.id, x])));
        setCanchas(c);
        setClases(cl);
        setReportes(r);
      })
      .catch((err) => {
        console.error("Error cargando profes del club:", err);
        if (vivo) {
          setVinculos([]);
          setClases([]);
          setReportes([]);
        }
      });
    return () => {
      vivo = false;
    };
  }, [flag, clubId, puedeVer, esDueño, hoy, version]);

  if (flag === null) return <div className="pd-skeleton h-40 rounded-lg" aria-busy="true" aria-label="Cargando" />;
  if (!flag) return <ProfesApagado />;
  if (!puedeVer) return <SinPermiso />;

  const recargar = () => setVersion((v) => v + 1);
  const cambiarEstado = async (v, estado) => {
    if (estado === "baja") {
      const ok = await confirmar({ titulo: "Dar de baja", mensaje: `${v.nombre} deja de aparecer como profe del club. Las clases ya reservadas siguen; las podés cancelar desde Clases.`, confirmText: "Dar de baja", danger: true });
      if (!ok) return;
    }
    try {
      await actualizarVinculo(clubId, v.id, { estado });
      toast.success(estado === "activo" ? `${v.nombre} ya da clases en el club` : "Listo");
      recargar();
    } catch (err) {
      console.error(err);
      toast.error("No pudimos hacer el cambio.");
    }
  };
  const borrar = async (v) => {
    try {
      await borrarVinculo(clubId, v.id);
      recargar();
    } catch (err) {
      console.error(err);
      toast.error("No pudimos borrarlo.");
    }
  };
  const invitar = async (e) => {
    e.preventDefault();
    setAvisoInvitar("");
    if (!email.includes("@")) return setAvisoInvitar("Poné el email con el que el profe entra a Padely.");
    setInvitando(true);
    try {
      const r = await invitarProfe({ clubId, email: email.trim() });
      if (!r.ok) {
        setAvisoInvitar(r.motivo === "sin-cuenta" ? "Ese email no tiene cuenta en Padely. Pasale el link para que arme su perfil de profe y te pida sumarse." : "Esa persona todavía no armó su perfil de profe. Pasale el link para que lo arme y te pida sumarse.");
      } else {
        toast.success(r.estado === "activo" ? "Ya está activo en el club" : "Invitación enviada: le llega el aviso");
        setEmail("");
        recargar();
      }
    } catch (err) {
      toast.error(err?.message || "No pudimos invitar.");
    } finally {
      setInvitando(false);
    }
  };
  const copiarLink = async () => {
    try {
      await navigator.clipboard.writeText(linkParaProfes(clubId));
      toast.success("Link copiado");
    } catch {
      toast.info(linkParaProfes(clubId));
    }
  };
  const cancelar = async (c) => {
    const ok = await confirmar({ titulo: "Cancelar la clase", mensaje: "Se avisa al profe y a los alumnos y se libera la cancha. Si alguien pagó online, se le devuelve.", confirmText: "Cancelar clase", cancelText: "Volver", danger: true });
    if (!ok) return;
    try {
      await cancelarClase({ claseId: c.id, motivo: "Cancelada por el club" });
      toast.success("Clase cancelada");
      recargar();
    } catch (err) {
      toast.error(err?.message || "No pudimos cancelar.");
    }
  };

  const tabs = [
    ...(puedeConfigurar ? [{ value: "profes", label: "Profes", count: (vinculos || []).filter((v) => v.estado === "pendiente").length || undefined }] : []),
    { value: "clases", label: "Clases", count: (clases || []).filter((c) => c.estado === "confirmada").length || undefined },
    ...(esDueño ? [{ value: "avisos", label: "Avisos", count: (reportes || []).length || undefined }] : []),
  ];

  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="heading-xl m-0">Profes</h1>
        <p className="body-sm text-ink-2 mt-1 mb-0">Los profes que dan clases en el club. Aparecen en la pestaña Profes de la página del club.</p>
      </header>
      <Tabs items={tabs} value={tab} onChange={setTab} ariaLabel="Secciones" />

      {tab === "profes" && puedeConfigurar && (
        <>
          <Card as="form" onSubmit={invitar} noValidate>
            <Card.Title as="h2">Invitar a un profe</Card.Title>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <Field label="Email del profe en Padely" className="flex-1 min-w-[220px]">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
              </Field>
              <Button type="submit" icon={<UserPlus className="pd-icon" size={20} aria-hidden="true" />} cargando={invitando ? "Invitando…" : ""}>
                Invitar
              </Button>
              <Button variant="ghost" icon={<Copy className="pd-icon" size={20} aria-hidden="true" />} onClick={copiarLink}>
                Copiar link para profes
              </Button>
            </div>
            {avisoInvitar && (
              <Alert tone="info" className="mt-3">
                {avisoInvitar}
              </Alert>
            )}
          </Card>
          {vinculos === null ? (
            <div className="pd-skeleton h-40 rounded-lg" aria-busy="true" aria-label="Cargando" />
          ) : vinculos.length === 0 ? (
            <Card className="text-center py-10!">
              <span className="pd-ball mx-auto mb-3 block!" aria-hidden="true" />
              <p className="body-md text-ink-2 m-0">Todavía no hay profes en el club. Invitalos o pasales el link.</p>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {vinculos.map((v) => {
                const p = perfiles[v.id];
                return (
                  <Card key={v.id}>
                    <Card.Row className="items-start!">
                      <div className="min-w-0">
                        <Card.Title className="truncate">
                          <Link to={`/profe/${v.id}`} className="hover:underline">
                            {v.nombre || p?.nombre || "Profe"}
                          </Link>
                        </Card.Title>
                        <Card.Meta>
                          {v.estado === "activo" ? `${v.cobra === "club" ? "Cobra el club" : "Cobra el profe"} · ${v.bloqueaCancha !== false ? "reserva cancha" : "sin cancha"}` : v.origen === "club" ? "Lo invitó el club" : "Pidió dar clases acá"}
                        </Card.Meta>
                      </div>
                      <Badge tone={TONO[v.estado] || "neutral"}>{LABEL[v.estado] || v.estado}</Badge>
                    </Card.Row>
                    <Card.Foot className="flex-wrap">
                      <div className="pd-btn-group ml-auto">
                        {v.estado === "pendiente" && (
                          <>
                            <Button size="sm" variant="primary" onClick={() => cambiarEstado(v, "activo")}>
                              Aprobar
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => borrar(v)}>
                              Rechazar
                            </Button>
                          </>
                        )}
                        {v.estado === "invitado" && (
                          <Button size="sm" variant="ghost" icon={<X className="pd-icon" size={20} aria-hidden="true" />} onClick={() => borrar(v)}>
                            Cancelar invitación
                          </Button>
                        )}
                        {v.estado === "activo" && (
                          <>
                            <Button size="sm" icon={<Settings2 className="pd-icon" size={20} aria-hidden="true" />} onClick={() => setConfigurar(v)}>
                              Configurar
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => cambiarEstado(v, "baja")}>
                              Dar de baja
                            </Button>
                          </>
                        )}
                        {v.estado === "baja" && (
                          <>
                            <Button size="sm" onClick={() => cambiarEstado(v, "activo")}>
                              Reactivar
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => borrar(v)}>
                              Borrar
                            </Button>
                          </>
                        )}
                      </div>
                    </Card.Foot>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === "clases" &&
        (clases === null ? (
          <div className="pd-skeleton h-40 rounded-lg" aria-busy="true" aria-label="Cargando" />
        ) : clases.filter((c) => c.estado !== "cancelada").length === 0 ? (
          <Card className="text-center py-10!">
            <p className="body-md text-ink-2 m-0">No hay clases próximas en el club.</p>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {clases
              .filter((c) => c.estado !== "cancelada")
              .sort((a, b) => `${a.fecha}${a.horaInicio}`.localeCompare(`${b.fecha}${b.horaInicio}`))
              .map((c) => (
                <Card key={c.id}>
                  <Card.Row className="items-start!">
                    <Card.Eyebrow className="pd-tnum">
                      {formatDiaCorto(c.fecha)} · {c.horaInicio}–{c.horaFin}
                    </Card.Eyebrow>
                    <Badge tone={c.estado === "dada" ? "neutral" : "success"}>{c.estado === "dada" ? "Dada" : "Confirmada"}</Badge>
                  </Card.Row>
                  <Card.Title className="mt-2!">
                    {labelTipoClase(c.tipoClase)} · {c.profeNombre}
                  </Card.Title>
                  <Card.Meta>
                    {c.canchaName || "Sin cancha"} · {inscriptosDe(c).map((i) => i.nombre).join(", ") || "—"}
                  </Card.Meta>
                  {c.estado === "confirmada" && (
                    <Card.Foot>
                      <Button size="sm" variant="ghost" className="ml-auto" icon={<X className="pd-icon" size={20} aria-hidden="true" />} onClick={() => cancelar(c)}>
                        Cancelar
                      </Button>
                    </Card.Foot>
                  )}
                </Card>
              ))}
          </div>
        ))}

      {tab === "avisos" && esDueño && (
        <div className="flex flex-col gap-3">
          <Alert tone="info">Avisos privados de alumnos sobre clases en el club. Solo los ven el dueño y el equipo de Padely.</Alert>
          {(reportes || []).length === 0 ? (
            <Card className="text-center py-10!">
              <p className="body-md text-ink-2 m-0">No hay avisos.</p>
            </Card>
          ) : (
            reportes.map((r) => (
              <Card key={r.id}>
                <Card.Eyebrow>
                  {r.fecha ? formatDiaCorto(r.fecha) : ""} · {r.profeNombre}
                </Card.Eyebrow>
                <p className="body-md mt-2 mb-0 whitespace-pre-line">{r.texto}</p>
                <Card.Meta className="mt-2!">De {r.nombre}</Card.Meta>
              </Card>
            ))
          )}
        </div>
      )}

      {configurar && (
        <ConfigurarDialog
          clubId={clubId}
          vinculo={configurar}
          canchas={canchas}
          onCerrar={() => setConfigurar(null)}
          onListo={() => {
            setConfigurar(null);
            recargar();
          }}
        />
      )}
    </div>
  );
}
