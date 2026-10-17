import { useEffect, useState } from "react";
import { AlertTriangle, Check, ImagePlus, Info, Plus, Upload } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import {
  getClubByOwner,
  actualizarClubConfig,
  getClubPrivado,
  actualizarClubPrivado,
} from "../../services/canchaService";
import { uploadClubLogo } from "../../services/storageService";
import { toast } from "../../components/Toast";
import { confirmar } from "../../components/ConfirmDialog";
import { Badge, Button, Card, Field, Input, Pills, Select, Tabs } from "../../components/ui";

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

// Consejo contextual (el sistema no define un callout: surface-sunken + ícono Info + body-sm)
function Consejo({ children }) {
  return (
    <p className="flex items-start gap-2 rounded-md bg-surface-sunken px-4 py-3 body-sm text-ink-2 m-0">
      <Info className="pd-icon text-ink-3" size={20} aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

export default function Configuracion() {
  const { user } = useAuthStore();
  const [club, setClub] = useState(null);
  const [loading, setLoading] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [tab, setTab] = useState("datos");
  const [mensaje, setMensaje] = useState("");
  const [subiendoLogo, setSubiendoLogo] = useState(false);
  const [logoUrl, setLogoUrl] = useState(null);

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
          // Datos privados (CBU, CUIT, usuarios): en clubs/{id}/privado/datos; los del documento viejo son el respaldo
          const privado = await getClubPrivado(clubData.id).catch((err) => {
            console.error("Error al cargar los datos privados del club:", err);
            return {};
          });
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
            cbu: privado.cbu || clubData.cbu || "",
            alias: privado.alias || clubData.alias || "",
            titularCuenta: privado.titularCuenta || clubData.titularCuenta || "",
            cuit: privado.cuit || clubData.cuit || "",
            razonSocial: privado.razonSocial || clubData.razonSocial || "",
          });
          setUsuarios(privado.usuarios || clubData.usuarios || []);
          if (clubData.logoUrl) setLogoUrl(clubData.logoUrl);
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
      // Lo público va al documento del club; CBU, alias, CUIT, razón social y usuarios, al subdocumento privado
      const { cbu, alias, titularCuenta, cuit, razonSocial, ...publicos } = form;
      await actualizarClubConfig(club.id, publicos);
      await actualizarClubPrivado(club.id, { cbu, alias, titularCuenta, cuit, razonSocial, usuarios });
      setClub({ ...club, ...publicos });
      setMensaje("Configuración guardada");
      setTimeout(() => setMensaje(""), 3000);
      toast.success("Configuración guardada");
    } catch (err) {
      console.error("Error al guardar:", err);
      setMensaje("Error al guardar");
      toast.error("No pudimos guardar la configuración. Intentá de nuevo.");
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

  const eliminarUsuario = async (id) => {
    const ok = await confirmar({ titulo: "Eliminar usuario", mensaje: "¿Eliminar este usuario del club?", confirmText: "Eliminar", danger: true });
    if (!ok) return;
    setUsuarios(usuarios.filter((u) => u.id !== id));
  };

  const cambiarRolUsuario = (id, nuevoRol) => {
    setUsuarios(
      usuarios.map((u) => (u.id === id ? { ...u, rol: nuevoRol } : u)),
    );
  };

  const handleSubirLogo = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("La imagen no puede superar los 5MB"); return; }
    setSubiendoLogo(true);
    try {
      const url = await uploadClubLogo(club.id, file);
      await actualizarClubConfig(club.id, { logoUrl: url });
      setLogoUrl(url);
      toast.success("Logo actualizado");
    } catch (err) {
      console.error("Error subiendo logo:", err);
      toast.error("No pudimos subir el logo. Intentá de nuevo.");
    }
    setSubiendoLogo(false);
  };

  if (loading) {
    return (
      <div aria-busy="true">
        <span className="sr-only">Cargando...</span>
        <div className="flex items-center justify-between mb-4">
          <div className="pd-skeleton h-8 w-48" />
          <div className="pd-skeleton h-11 w-40 rounded-md" />
        </div>
        <div className="pd-skeleton h-11 w-full max-w-2xl mb-6" />
        <div className="pd-skeleton h-80 rounded-lg" />
      </div>
    );
  }

  if (!club) {
    return (
      <Card className="text-center">
        <p className="body-md text-ink-2 m-0">No tenés un club registrado</p>
      </Card>
    );
  }

  const tabs = [
    { value: "datos", label: "Datos del club" },
    { value: "horarios", label: "Horarios" },
    { value: "redes", label: "Redes sociales" },
    { value: "facturacion", label: "Facturación" },
    { value: "usuarios", label: "Usuarios" },
  ];

  const textoLogo = logoUrl
    ? subiendoLogo
      ? "Subiendo..."
      : "Cambiar logo"
    : subiendoLogo
      ? "Subiendo logo..."
      : "Subir logo del club";

  return (
    <div>
      <div className="flex items-center justify-between gap-4 flex-wrap mb-4">
        <h1 className="heading-lg m-0">Configuración</h1>
        <Button variant="primary" onClick={handleGuardar} cargando={guardando ? "Guardando…" : ""}>
          Guardar cambios
        </Button>
      </div>

      {mensaje && (
        <p
          role="status"
          className={`flex items-center gap-2 body-sm font-semibold! mb-4 m-0 ${mensaje.includes("Error") ? "text-danger" : "text-success"}`}
        >
          {mensaje.includes("Error") ? (
            <AlertTriangle className="pd-icon" size={20} aria-hidden="true" />
          ) : (
            <Check className="pd-icon" size={20} aria-hidden="true" />
          )}
          {mensaje}
        </p>
      )}

      {/* Tabs */}
      <Tabs items={tabs} value={tab} onChange={setTab} ariaLabel="Secciones de la configuración" className="mb-6" />

      {/* Datos del club */}
      {tab === "datos" && (
        <Card>
          <Card.Title className="mb-4!">Datos del club</Card.Title>
          <div className="grid gap-4">
            <Field label="Nombre del club">
              <Input
                type="text"
                value={form.nombre}
                onChange={(e) => setForm({ ...form, nombre: e.target.value })}
              />
            </Field>
            <Field label="Dirección">
              <Input
                type="text"
                placeholder="Ej: Av. Belgrano 1234"
                value={form.direccion}
                onChange={(e) =>
                  setForm({ ...form, direccion: e.target.value })
                }
              />
            </Field>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Ciudad">
                <Input
                  type="text"
                  value={form.ciudad}
                  onChange={(e) => setForm({ ...form, ciudad: e.target.value })}
                />
              </Field>
              <Field label="Provincia">
                <Input
                  type="text"
                  value={form.provincia}
                  onChange={(e) =>
                    setForm({ ...form, provincia: e.target.value })
                  }
                />
              </Field>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Teléfono">
                <Input
                  type="text"
                  inputMode="tel"
                  placeholder="Ej: 385 1234567"
                  value={form.telefono}
                  onChange={(e) =>
                    setForm({ ...form, telefono: e.target.value })
                  }
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

            {/* Logo del club */}
            <Field as="div" label="Logo del club">
              <div className="flex items-center gap-4 flex-wrap rounded-lg border border-dashed border-line-strong p-4">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo del club" className="h-24 max-w-[200px] object-contain rounded-sm" />
                ) : (
                  <span className="grid place-items-center w-24 h-24 rounded-sm bg-surface-sunken">
                    <ImagePlus className="pd-icon-lg text-ink-3" size={24} aria-hidden="true" />
                  </span>
                )}
                <div className="grid gap-1">
                  <label className="pd-btn cursor-pointer! has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus" aria-disabled={subiendoLogo || undefined}>
                    <Upload className="pd-icon" size={20} aria-hidden="true" />
                    {textoLogo}
                    <input type="file" accept="image/*" onChange={handleSubirLogo} disabled={subiendoLogo} className="sr-only" />
                  </label>
                  <span className="pd-help">PNG, JPG o SVG (máx. 5MB)</span>
                </div>
              </div>
            </Field>
          </div>
        </Card>
      )}

      {/* Horarios */}
      {tab === "horarios" && (
        <Card>
          <Card.Title className="mb-4!">Horario de atención</Card.Title>
          <div className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Hora de apertura">
                <Input
                  type="time"
                  inputMode="numeric"
                  value={form.horarioApertura}
                  onChange={(e) =>
                    setForm({ ...form, horarioApertura: e.target.value })
                  }
                />
              </Field>
              <Field label="Hora de cierre">
                <Input
                  type="time"
                  inputMode="numeric"
                  value={form.horarioCierre}
                  onChange={(e) =>
                    setForm({ ...form, horarioCierre: e.target.value })
                  }
                />
              </Field>
            </div>

            <Field as="div" label="Días abiertos">
              <Pills
                multi
                items={diasSemana.map((dia) => ({ value: dia, label: dia.slice(0, 3) }))}
                value={form.diasAbiertos}
                onChange={toggleDia}
                ariaLabel="Días abiertos"
              />
            </Field>

            <Consejo>
              Estos horarios se muestran a los jugadores en el hub de
              canchas. Los horarios específicos de cada cancha se configuran en
              la sección Canchas.
            </Consejo>
          </div>
        </Card>
      )}

      {/* Redes sociales */}
      {tab === "redes" && (
        <Card>
          <Card.Title className="mb-4!">Redes sociales</Card.Title>
          <div className="grid gap-4">
            <Field label="Instagram">
              <Input
                type="text"
                placeholder="@tuclub"
                value={form.instagram}
                onChange={(e) =>
                  setForm({ ...form, instagram: e.target.value })
                }
              />
            </Field>
            <Field label="Facebook">
              <Input
                type="text"
                placeholder="facebook.com/tuclub"
                value={form.facebook}
                onChange={(e) => setForm({ ...form, facebook: e.target.value })}
              />
            </Field>
            <Field label="WhatsApp">
              <Input
                type="text"
                inputMode="tel"
                placeholder="Ej: +54 385 1234567"
                value={form.whatsapp}
                onChange={(e) => setForm({ ...form, whatsapp: e.target.value })}
              />
            </Field>
            <Field label="Sitio web">
              <Input
                type="text"
                placeholder="www.tuclub.com"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
              />
            </Field>
          </div>
        </Card>
      )}

      {/* Facturación */}
      {tab === "facturacion" && (
        <Card>
          <Card.Title className="mb-4!">Datos de facturación</Card.Title>
          <div className="grid gap-4">
            <Field label="Razón social">
              <Input
                type="text"
                value={form.razonSocial}
                onChange={(e) =>
                  setForm({ ...form, razonSocial: e.target.value })
                }
              />
            </Field>
            <Field label="CUIT">
              <Input
                type="text"
                placeholder="Ej: 30-12345678-9"
                value={form.cuit}
                onChange={(e) => setForm({ ...form, cuit: e.target.value })}
              />
            </Field>
            <Field label="CBU">
              <Input
                type="text"
                inputMode="numeric"
                placeholder="22 dígitos"
                value={form.cbu}
                onChange={(e) => setForm({ ...form, cbu: e.target.value })}
              />
            </Field>
            <Field label="Alias CBU">
              <Input
                type="text"
                placeholder="Ej: CLUB.PADEL.SANTIAGO"
                value={form.alias}
                onChange={(e) => setForm({ ...form, alias: e.target.value })}
              />
            </Field>
            <Field label="Titular de la cuenta">
              <Input
                type="text"
                value={form.titularCuenta}
                onChange={(e) =>
                  setForm({ ...form, titularCuenta: e.target.value })
                }
              />
            </Field>

            <Consejo>
              Estos datos se usan para generar comprobantes y recibir pagos
              de inscripciones y reservas. Mantenelos actualizados.
            </Consejo>
          </div>
        </Card>
      )}

      {/* Usuarios */}
      {tab === "usuarios" && (
        <div className="flex flex-col gap-4">
          <Card>
            <Card.Title className="mb-4!">Agregar usuario</Card.Title>
            <div className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Nombre">
                  <Input
                    type="text"
                    placeholder="Nombre completo"
                    value={nuevoUsuario.nombre}
                    onChange={(e) =>
                      setNuevoUsuario({
                        ...nuevoUsuario,
                        nombre: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Email">
                  <Input
                    type="email"
                    placeholder="email@ejemplo.com"
                    value={nuevoUsuario.email}
                    onChange={(e) =>
                      setNuevoUsuario({
                        ...nuevoUsuario,
                        email: e.target.value,
                      })
                    }
                  />
                </Field>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Teléfono">
                  <Input
                    type="text"
                    inputMode="tel"
                    placeholder="385 1234567"
                    value={nuevoUsuario.telefono}
                    onChange={(e) =>
                      setNuevoUsuario({
                        ...nuevoUsuario,
                        telefono: e.target.value,
                      })
                    }
                  />
                </Field>
                <Field label="Rol">
                  <Select
                    value={nuevoUsuario.rol}
                    onChange={(e) =>
                      setNuevoUsuario({ ...nuevoUsuario, rol: e.target.value })
                    }
                  >
                    {rolesDisponibles.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div>
                <Button
                  icon={<Plus className="pd-icon" size={20} aria-hidden="true" />}
                  onClick={agregarUsuario}
                  disabled={
                    !nuevoUsuario.email.trim() || !nuevoUsuario.nombre.trim()
                  }
                >
                  Agregar usuario
                </Button>
              </div>
            </div>
          </Card>

          {/* Lista de usuarios */}
          <div className="pd-table-wrap">
            <div className="pd-table-head">
              <h3>
                Usuarios del club <span className="pd-count text-ink-3 font-medium">{usuarios.length}</span>
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="pd-table">
                <thead>
                  <tr>
                    <th>Usuario</th>
                    <th>Rol</th>
                    <th className="num">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {/* Dueño */}
                  <tr>
                    <td>
                      <p className="font-semibold m-0">{user?.email}</p>
                      <p className="body-sm text-ink-3 m-0">Dueño del club</p>
                    </td>
                    <td>
                      <Badge tone="court">Dueño</Badge>
                    </td>
                    <td className="num" />
                  </tr>
                  {usuarios.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="text-ink-2!">
                        No hay otros usuarios agregados
                      </td>
                    </tr>
                  ) : (
                    usuarios.map((u) => (
                      <tr key={u.id}>
                        <td>
                          <p className="font-semibold m-0">{u.nombre}</p>
                          <p className="body-sm text-ink-3 m-0">
                            {u.email} {u.telefono && `· ${u.telefono}`}
                          </p>
                        </td>
                        <td>
                          <Select
                            aria-label={`Rol de ${u.nombre}`}
                            value={u.rol}
                            onChange={(e) =>
                              cambiarRolUsuario(u.id, e.target.value)
                            }
                            className="h-9! text-[13px]!"
                            wrapperClassName="block min-w-[180px]"
                          >
                            {rolesDisponibles.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </Select>
                        </td>
                        <td className="num">
                          <Button size="sm" variant="ghost" onClick={() => eliminarUsuario(u.id)}>
                            Eliminar
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="border-t border-line px-4 py-3">
              <p className="pd-eyebrow mb-2!">Roles disponibles</p>
              <dl className="m-0 grid gap-1">
                {rolesDisponibles.map((r) => (
                  <div key={r.value} className="flex items-baseline gap-2 body-sm">
                    <dt className="font-semibold w-36 flex-none">{r.label}</dt>
                    <dd className="m-0 text-ink-2">{r.desc}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <Consejo>
            Recordá hacer clic en "Guardar cambios" arriba para que los
            usuarios y roles se guarden correctamente.
          </Consejo>
        </div>
      )}
    </div>
  );
}
