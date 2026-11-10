import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Pencil, Plus, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuthStore } from "../../../store/authStore";
import SinPermiso from "../../../components/SinPermiso";
import Dialogo from "../../../components/Dialogo";
import { toast } from "../../../components/Toast";
import { confirmar } from "../../../components/ConfirmDialog";
import { Alert, Badge, Button, Card, Field, Input } from "../../../components/ui";
import { actualizarMesa, crearMesa, crearMesas, eliminarMesa, escucharMesas } from "../../../services/mesasService";
import { escucharCuentasAbiertas } from "../../../services/cuentasService";
import { MESAS_EN_SERIE_MAX, estadoMesa, nombresEnSerie, ocupacionDeMesas, validarMesa, zonasDe } from "../../../utils/mesas";

// Configurar las mesas del bar (quien edita productos, como las categorías): crear una o varias ("Mesa 1" a
// "Mesa 12"), renombrar, zona (Salón, Patio…), capacidad, desactivar y borrar. Una mesa ocupada no se borra.

function MesaDialog({ mesa = null, mesas, zonas, onCerrar, onGuardar }) {
  const [form, setForm] = useState({ nombre: mesa?.nombre || "", zona: mesa?.zona || "", capacidad: mesa?.capacidad ? String(mesa.capacidad) : "" });
  const [errores, setErrores] = useState({});
  const [guardando, setGuardando] = useState(false);
  const guardar = async () => {
    const { datos, errores: e } = validarMesa(form, { otras: mesas, exceptoId: mesa?.id || null });
    setErrores(e);
    if (Object.keys(e).length) return;
    setGuardando(true);
    try {
      await onGuardar(datos);
    } catch (err) {
      console.error("Error guardando la mesa:", err);
      toast.error(err?.code === "permission-denied" ? "Sin permiso." : "No pudimos guardar la mesa.");
      setGuardando(false);
    }
  };
  const campo = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <Dialogo
      titulo={mesa ? `Editar ${mesa.nombre}` : "Nueva mesa"}
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
        <Field label="Nombre o número" help='Un número solo queda como "Mesa 4".' error={errores.nombre}>
          <Input value={form.nombre} onChange={campo("nombre")} placeholder="Ej: 4, Barra alta" maxLength={30} autoComplete="off" data-autofocus />
        </Field>
        <Field label="Zona" help="Opcional. Sirve para filtrar la grilla.">
          <Input value={form.zona} onChange={campo("zona")} placeholder="Ej: Salón, Patio" maxLength={30} list="zonas-mesas" autoComplete="off" />
          <datalist id="zonas-mesas">
            {zonas.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
        </Field>
        <Field label="Capacidad" help="Opcional: cuántas personas entran." error={errores.capacidad}>
          <Input value={form.capacidad} onChange={campo("capacidad")} inputMode="numeric" placeholder="Ej: 4" maxLength={2} />
        </Field>
      </div>
    </Dialogo>
  );
}

function SerieDialog({ mesas, zonas, onCerrar, onCrear }) {
  const [form, setForm] = useState({ desde: "1", hasta: "10", prefijo: "Mesa", zona: "" });
  const [guardando, setGuardando] = useState(false);
  const nombres = nombresEnSerie(form.desde, form.hasta, { prefijo: form.prefijo, otras: mesas });
  const campo = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const crear = async () => {
    if (!nombres.length) return;
    setGuardando(true);
    try {
      await onCrear(nombres, form.zona.trim() || null);
    } catch (err) {
      console.error("Error creando las mesas:", err);
      toast.error(err?.code === "permission-denied" ? "Sin permiso." : "No pudimos crear las mesas.");
      setGuardando(false);
    }
  };
  return (
    <Dialogo
      titulo="Agregar varias mesas"
      descripcion={nombres.length ? `Se crean ${nombres.length}: ${nombres[0]}${nombres.length > 1 ? ` … ${nombres[nombres.length - 1]}` : ""}` : `Hasta ${MESAS_EN_SERIE_MAX} por vez; las que ya existen se saltean.`}
      onCerrar={onCerrar}
      onSubmit={crear}
      acciones={
        <>
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" variant="primary" disabled={!nombres.length} cargando={guardando ? "Creando…" : ""}>
            {nombres.length ? `Crear ${nombres.length}` : "Crear"}
          </Button>
        </>
      }
    >
      <div className="mt-4 grid gap-4 grid-cols-2">
        <Field label="Desde">
          <Input value={form.desde} onChange={campo("desde")} inputMode="numeric" maxLength={3} data-autofocus />
        </Field>
        <Field label="Hasta">
          <Input value={form.hasta} onChange={campo("hasta")} inputMode="numeric" maxLength={3} />
        </Field>
        <Field label="Nombre">
          <Input value={form.prefijo} onChange={campo("prefijo")} maxLength={20} />
        </Field>
        <Field label="Zona">
          <Input value={form.zona} onChange={campo("zona")} placeholder="Opcional" maxLength={30} list="zonas-serie" />
          <datalist id="zonas-serie">
            {zonas.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
        </Field>
      </div>
    </Dialogo>
  );
}

export default function MesasConfig() {
  const clubActual = useAuthStore((s) => s.clubActual);
  const clubCargado = useAuthStore((s) => s.clubCargado);
  const puede = useAuthStore((s) => s.puede);
  const user = useAuthStore((s) => s.user);
  const clubId = clubActual?.id || null;
  const uid = user?.uid || null;
  const puedeEntrar = !!clubActual && puede("editarProductos");
  // La ocupación se ve solo si además lee cuentas (quien cobra o vende)
  const veCuentas = !!clubActual && (puede("cobrarTurnos") || puede("vender"));
  const [mesas, setMesas] = useState({ para: null, lista: [], error: false });
  const [cuentas, setCuentas] = useState([]);
  const [dialogo, setDialogo] = useState(null); // "nueva" | "serie" | { mesa }

  useEffect(() => {
    if (!clubId || !puedeEntrar) return undefined;
    return escucharMesas(
      clubId,
      (lista) => setMesas({ para: clubId, lista, error: false }),
      (err) => {
        console.error("Error escuchando las mesas:", err);
        setMesas({ para: clubId, lista: [], error: true });
      },
    );
  }, [clubId, puedeEntrar]);
  useEffect(() => {
    if (!clubId || !puedeEntrar || !veCuentas) return undefined;
    return escucharCuentasAbiertas(clubId, setCuentas, (err) => console.error("Error escuchando las cuentas abiertas:", err));
  }, [clubId, puedeEntrar, veCuentas]);

  const lista = useMemo(() => (mesas.para === clubId ? mesas.lista : []), [mesas, clubId]);
  const zonas = useMemo(() => zonasDe(lista), [lista]);
  const ocupacion = useMemo(() => ocupacionDeMesas(cuentas), [cuentas]);

  if (!clubCargado) return <div className="pd-skeleton h-40 rounded-lg" aria-busy="true" aria-label="Cargando" />;
  if (!clubActual || !puedeEntrar) {
    return (
      <div>
        <h1 className="heading-lg m-0 mb-4">Configurar mesas</h1>
        <SinPermiso />
      </div>
    );
  }

  const siguienteOrden = lista.reduce((max, m) => Math.max(max, Number(m.orden) || 0), 0) + 1;
  const guardarNueva = async (datos) => {
    await crearMesa(clubId, datos, { uid, orden: siguienteOrden });
    toast.success(`${datos.nombre} creada`);
    setDialogo(null);
  };
  const guardarEdicion = (mesa) => async (datos) => {
    await actualizarMesa(clubId, mesa.id, datos);
    toast.success("Mesa guardada");
    setDialogo(null);
  };
  const crearSerie = async (nombres, zona) => {
    await crearMesas(clubId, nombres, { uid, zona, ordenDesde: siguienteOrden });
    toast.success(`${nombres.length} ${nombres.length === 1 ? "mesa creada" : "mesas creadas"}`);
    setDialogo(null);
  };
  const alternarActiva = async (m) => {
    try {
      await actualizarMesa(clubId, m.id, { activa: m.activa === false });
      toast.success(m.activa === false ? `${m.nombre} vuelve a la grilla` : `${m.nombre} no se muestra en la grilla`);
    } catch (e) {
      console.error("Error cambiando la mesa:", e);
      toast.error("No pudimos guardar el cambio.");
    }
  };
  const borrar = async (m) => {
    if (veCuentas && !estadoMesa(m, ocupacion).libre) {
      toast.error(`${m.nombre} tiene una cuenta abierta: cobrala o pasala a otra mesa antes de borrarla.`);
      return;
    }
    const ok = await confirmar({ titulo: `¿Borrar ${m.nombre}?`, mensaje: "Las cuentas cerradas conservan el nombre de la mesa. Si solo querés sacarla un tiempo, desactivala.", confirmText: "Borrar", danger: true });
    if (!ok) return;
    try {
      await eliminarMesa(clubId, m.id);
      toast.success(`${m.nombre} borrada`);
    } catch (e) {
      console.error("Error borrando la mesa:", e);
      toast.error("No pudimos borrar la mesa.");
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-[900px]">
      <div className="flex flex-col gap-2">
        <Link to="/admin/bar/mesas" className="body-sm text-ink-2 inline-flex items-center gap-1 hover:underline self-start">
          <ArrowLeft className="pd-icon" size={16} aria-hidden="true" /> Mesas
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="heading-lg m-0">Configurar mesas</h1>
          <div className="pd-btn-group">
            <Button onClick={() => setDialogo("serie")}>Agregar varias</Button>
            <Button variant="primary" icon={<Plus className="pd-icon" size={20} aria-hidden="true" />} onClick={() => setDialogo("nueva")}>
              Nueva mesa
            </Button>
          </div>
        </div>
      </div>
      {mesas.error ? (
        <Alert tone="danger">No pudimos cargar las mesas.</Alert>
      ) : mesas.para !== clubId ? (
        <div className="pd-skeleton h-40 rounded-lg" aria-busy="true" aria-label="Cargando" />
      ) : lista.length === 0 ? (
        <Card className="text-center py-12!">
          <p className="heading-sm m-0">Todavía no hay mesas</p>
          <p className="body-sm text-ink-2 mt-1 mb-0">Creá una por una o varias de una vez ("Mesa 1" a "Mesa 12").</p>
        </Card>
      ) : (
        <Card className="p-0!">
          <ul className="m-0 p-0 list-none divide-y divide-line">
            {lista.map((m) => {
              const ocupada = veCuentas && !estadoMesa(m, ocupacion).libre;
              return (
                <li key={m.id} className="px-4 py-3 flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold m-0 flex flex-wrap items-center gap-2">
                      <span className="break-words">{m.nombre}</span>
                      {m.activa === false && <Badge>Desactivada</Badge>}
                      {ocupada && (
                        <Badge tone="success" dot>
                          Ocupada
                        </Badge>
                      )}
                    </p>
                    <p className="body-sm text-ink-2 m-0">{[m.zona || "Sin zona", m.capacidad ? `${m.capacidad} personas` : null].filter(Boolean).join(" · ")}</p>
                  </div>
                  <div className="pd-btn-group">
                    <Button size="sm" variant="ghost" icon={<Pencil className="pd-icon" size={20} aria-hidden="true" />} onClick={() => setDialogo({ mesa: m })}>
                      Editar
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => alternarActiva(m)}>
                      {m.activa === false ? "Activar" : "Desactivar"}
                    </Button>
                    <Button size="sm" variant="ghost" iconOnly aria-label={`Borrar ${m.nombre}`} icon={<Trash2 className="pd-icon" size={20} aria-hidden="true" />} onClick={() => borrar(m)} />
                  </div>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
      <p className="pd-help m-0">Cambiar el nombre de una mesa no cambia las cuentas que ya están abiertas en ella: siguen con el nombre anterior hasta cerrarse.</p>
      {dialogo === "nueva" && <MesaDialog mesas={lista} zonas={zonas} onCerrar={() => setDialogo(null)} onGuardar={guardarNueva} />}
      {dialogo === "serie" && <SerieDialog mesas={lista} zonas={zonas} onCerrar={() => setDialogo(null)} onCrear={crearSerie} />}
      {dialogo?.mesa && <MesaDialog mesa={dialogo.mesa} mesas={lista} zonas={zonas} onCerrar={() => setDialogo(null)} onGuardar={guardarEdicion(dialogo.mesa)} />}
    </div>
  );
}
