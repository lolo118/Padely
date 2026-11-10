import { createElement, useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Clock, Download, Pencil, Plus, Trash2 } from "lucide-react";
import { useAuthStore } from "../../../store/authStore";
import SinPermiso from "../../../components/SinPermiso";
import Dialogo from "../../../components/Dialogo";
import { toast } from "../../../components/Toast";
import { Alert, Badge, Button, Card, Field, Input, Pills, Select, StatTile, Tabs, Textarea } from "../../../components/ui";
import { editarFichaje, escucharAbiertos, escucharEmpleados, escucharFichajesEntre, getAuditoria, guardarEmpleado, mensajeError } from "../../../services/fichajesService";
import { getStaffDelClub } from "../../../services/staffService";
import { aCsv } from "../../../utils/reportes";
import { formatDiaCorto, formatFechaHoraArg } from "../../../utils/formatDate";
import {
  ETIQUETA_ORIGEN,
  NOTA_MIN,
  PIN_LARGO,
  agruparHoras,
  diaArgentina,
  esOlvidado,
  filasCsvFichajes,
  formatMinutos,
  horaArgentina,
  minutosDeTurno,
  moverPeriodo,
  msDeDiaHora,
  nombreArchivoFichajes,
  pinValido,
  rangoPeriodo,
  totalesPorEmpleado,
  validarTurnoManual,
} from "../../../utils/fichajes";

// Fichajes del equipo (dueño o gestionarStaff): quién está trabajando ahora, horas por persona por día / semana /
// mes, los turnos con carga y corrección manual (nota obligatoria, queda en "Cambios"), las personas que fichan
// con su PIN (con o sin cuenta de Padely) y el CSV. Todo se escribe con Functions; acá solo se lee.

const PERIODOS = [
  { value: "dia", label: "Día" },
  { value: "semana", label: "Semana" },
  { value: "mes", label: "Mes" },
];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const ms = (v) => (v == null ? null : typeof v.toMillis === "function" ? v.toMillis() : Number(v));
const icono = (componente) => createElement(componente, { className: "pd-icon", size: 20, "aria-hidden": "true" });

function etiquetaRango(periodo, rango) {
  if (periodo === "dia") return formatDiaCorto(rango.desde);
  if (periodo === "mes") {
    const [y, m] = rango.desde.split("-").map(Number);
    return `${MESES[m - 1]} ${y}`;
  }
  return `${formatDiaCorto(rango.desde)} – ${formatDiaCorto(rango.hasta)}`;
}

const descargar = (contenido, nombre) => {
  const url = URL.createObjectURL(new Blob([contenido], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

// "entrada–salida" de un turno, con el día de la salida si es otro
function horarioDe(t) {
  const e = ms(t.entrada);
  const s = ms(t.salida);
  if (s === null) return `${horaArgentina(e)} – en curso`;
  return `${horaArgentina(e)} – ${diaArgentina(s) !== diaArgentina(e) ? `${formatDiaCorto(diaArgentina(s))} ` : ""}${horaArgentina(s)}`;
}

// ----- Diálogos -----

function TurnoDialog({ clubId, turno, empleados, diaInicial, onCerrar }) {
  const editar = !!turno;
  const abierto = editar && ms(turno.salida) === null && !turno.sinSalida;
  const e0 = editar ? ms(turno.entrada) : null;
  const s0 = editar && !turno.sinSalida ? ms(turno.salida) : null;
  const [f, setF] = useState({
    empleadoId: editar ? turno.empleadoId : "",
    diaEntrada: e0 ? diaArgentina(e0) : diaInicial,
    horaEntrada: e0 ? horaArgentina(e0) : "",
    diaSalida: s0 ? diaArgentina(s0) : e0 ? diaArgentina(e0) : diaInicial,
    horaSalida: s0 ? horaArgentina(s0) : "",
    nota: "",
  });
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  const guardar = async () => {
    if (!editar && !f.empleadoId) return setError("Elegí a la persona");
    const entradaMs = msDeDiaHora(f.diaEntrada, f.horaEntrada);
    const salidaMs = f.horaSalida ? msDeDiaHora(f.diaSalida, f.horaSalida) : null;
    const err = validarTurnoManual({ entradaMs: entradaMs ?? NaN, salidaMs, nota: f.nota, ahora: Date.now(), salidaOpcional: abierto });
    if (err) return setError(err);
    setGuardando(true);
    setError("");
    try {
      await editarFichaje({ clubId, accion: editar ? "editar" : "crear", fichajeId: turno?.id, empleadoId: f.empleadoId, entrada: entradaMs, salida: salidaMs, nota: f.nota.trim() });
      toast.success(editar ? "Turno corregido" : "Turno cargado");
      onCerrar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo guardar el turno."));
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      titulo={editar ? `Corregir el turno de ${turno.nombre}` : "Cargar un turno"}
      descripcion={editar ? "La hora original y tu nota quedan en Cambios." : "Para alguien que no fichó. Queda marcado como carga manual."}
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
      <div className="mt-4 grid gap-3">
        {!editar && (
          <Field label="Persona">
            <Select value={f.empleadoId} onChange={set("empleadoId")} data-autofocus>
              <option value="">Elegí…</option>
              {empleados
                .filter((e) => e.activo !== false)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                  </option>
                ))}
            </Select>
          </Field>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Día de entrada">
            <Input type="date" value={f.diaEntrada} onChange={set("diaEntrada")} />
          </Field>
          <Field label="Hora de entrada">
            <Input type="time" value={f.horaEntrada} onChange={set("horaEntrada")} />
          </Field>
          <Field label="Día de salida">
            <Input type="date" value={f.diaSalida} onChange={set("diaSalida")} />
          </Field>
          <Field label="Hora de salida" help={abierto ? "Vacía = sigue trabajando" : undefined}>
            <Input type="time" value={f.horaSalida} onChange={set("horaSalida")} />
          </Field>
        </div>
        <Field label="Nota (obligatoria)" help="Por qué se carga o se corrige. Se guarda con tu nombre.">
          <Textarea rows={2} maxLength={300} value={f.nota} onChange={set("nota")} placeholder="Se olvidó de fichar la salida" />
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
      </div>
    </Dialogo>
  );
}

function BorrarDialog({ clubId, turno, onCerrar }) {
  const [nota, setNota] = useState("");
  const [error, setError] = useState("");
  const [borrando, setBorrando] = useState(false);
  const borrar = async () => {
    if (nota.trim().length < NOTA_MIN) return setError("Escribí una nota con el motivo");
    setBorrando(true);
    try {
      await editarFichaje({ clubId, accion: "borrar", fichajeId: turno.id, nota: nota.trim() });
      toast.success("Turno borrado");
      onCerrar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo borrar el turno."));
      setBorrando(false);
    }
  };
  return (
    <Dialogo
      titulo="¿Borrar este turno?"
      descripcion={`${turno.nombre} · ${formatDiaCorto(diaArgentina(ms(turno.entrada)))} ${horarioDe(turno)}. Queda registrado en Cambios.`}
      onCerrar={onCerrar}
      onSubmit={borrar}
      acciones={
        <>
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" variant="danger" cargando={borrando ? "Borrando…" : ""}>
            Borrar turno
          </Button>
        </>
      }
    >
      <div className="mt-4 grid gap-3">
        <Field label="Motivo (obligatorio)">
          <Textarea rows={2} maxLength={300} value={nota} onChange={(e) => setNota(e.target.value)} data-autofocus placeholder="Fichó por error" />
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
      </div>
    </Dialogo>
  );
}

function EmpleadoDialog({ clubId, empleado, ownerUid, empleados, onCerrar }) {
  const nuevo = !empleado;
  const [f, setF] = useState({ nombre: empleado?.nombre || "", activo: empleado?.activo !== false, staffUid: empleado?.staffUid || "", pin: "" });
  const [cuentas, setCuentas] = useState(null);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Las cuentas del equipo que se pueden vincular (para fichar con el QR desde el celular)
  useEffect(() => {
    let vivo = true;
    getStaffDelClub(clubId)
      .then((lista) => vivo && setCuentas(lista.filter((s) => s.activo !== false).map((s) => ({ ...s, uid: s.uid || s.id }))))
      .catch((err) => {
        console.error("Error cargando el equipo:", err);
        if (vivo) setCuentas([]);
      });
    return () => {
      vivo = false;
    };
  }, [clubId]);

  const usadas = new Set(empleados.filter((e) => e.id !== empleado?.id && e.activo !== false && e.staffUid).map((e) => e.staffUid));
  const generarPin = () => {
    const n = new Uint32Array(1);
    crypto.getRandomValues(n);
    setF((x) => ({ ...x, pin: String(n[0] % 10 ** PIN_LARGO).padStart(PIN_LARGO, "0") }));
  };

  const guardar = async () => {
    if (f.nombre.trim().length < 2) return setError("Poné el nombre de la persona");
    if (f.pin && !pinValido(f.pin)) return setError(`El PIN son ${PIN_LARGO} números`);
    if (nuevo && !f.pin) return setError("Poné un PIN (o tocá Generar)");
    setGuardando(true);
    setError("");
    try {
      await guardarEmpleado({ clubId, empleadoId: empleado?.id, nombre: f.nombre.trim(), activo: f.activo, staffUid: f.staffUid || null, pin: f.pin || null });
      toast.success(f.pin ? `Listo. El PIN de ${f.nombre.trim()} es ${f.pin}: pasáselo en persona.` : "Guardado");
      onCerrar();
    } catch (e) {
      setError(mensajeError(e, "No se pudo guardar."));
      setGuardando(false);
    }
  };

  return (
    <Dialogo
      titulo={nuevo ? "Agregar una persona" : `Editar a ${empleado.nombre}`}
      descripcion="Para fichar no hace falta cuenta de Padely: alcanza con el PIN. Con una cuenta vinculada, también puede fichar escaneando el QR de la caja."
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
      <div className="mt-4 grid gap-3">
        <Field label="Nombre">
          <Input value={f.nombre} maxLength={60} onChange={(e) => setF((x) => ({ ...x, nombre: e.target.value }))} data-autofocus placeholder="Juan" />
        </Field>
        <Field label={nuevo ? "PIN" : "PIN nuevo"} help={nuevo ? `${PIN_LARGO} números, distinto al de los demás. Solo se ve ahora.` : empleado.tienePin ? "Vacío = sigue con el que tiene. No se puede ver el actual." : "Todavía no tiene PIN."}>
          <div className="flex gap-2">
            <Input
              value={f.pin}
              inputMode="numeric"
              autoComplete="off"
              maxLength={PIN_LARGO}
              onChange={(e) => setF((x) => ({ ...x, pin: e.target.value.replace(/\D/g, "").slice(0, PIN_LARGO) }))}
              className="pd-tnum max-w-[120px]"
              placeholder="••••"
            />
            <Button onClick={generarPin}>Generar</Button>
          </div>
        </Field>
        <Field label="Cuenta de Padely (opcional)" help="Solo personas que ya están en el equipo del club.">
          <Select value={f.staffUid} onChange={(e) => setF((x) => ({ ...x, staffUid: e.target.value }))} disabled={!cuentas}>
            <option value="">Sin cuenta</option>
            {ownerUid && !usadas.has(ownerUid) && <option value={ownerUid}>Dueño del club</option>}
            {(cuentas || [])
              .filter((s) => !usadas.has(s.uid) || s.uid === f.staffUid)
              .map((s) => (
                <option key={s.uid} value={s.uid}>
                  {s.nombre || s.email}
                  {s.email && s.nombre ? ` (${s.email})` : ""}
                </option>
              ))}
          </Select>
        </Field>
        {!nuevo && (
          <label className="flex items-center gap-2 body-md">
            <input type="checkbox" checked={f.activo} onChange={(e) => setF((x) => ({ ...x, activo: e.target.checked }))} />
            Activo (puede fichar)
          </label>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
      </div>
    </Dialogo>
  );
}

// ----- Página -----

export default function Fichajes() {
  const clubActual = useAuthStore((s) => s.clubActual);
  const clubCargado = useAuthStore((s) => s.clubCargado);
  const puede = useAuthStore((s) => s.puede);
  const clubId = clubActual?.id || null;
  const puedeVer = !!clubActual && puede("gestionarStaff");
  const soloLectura = clubActual?.soloLectura === true;

  const [tab, setTab] = useState("horas");
  const [periodo, setPeriodo] = useState("semana");
  const [dia, setDia] = useState(() => diaArgentina(Date.now()));
  const [ahora, setAhora] = useState(() => Date.now());
  const [empleados, setEmpleados] = useState({ para: null, lista: [] });
  const [abiertos, setAbiertos] = useState({ para: null, lista: [] });
  const [turnos, setTurnos] = useState({ clave: null, lista: [], error: false });
  const [auditoria, setAuditoria] = useState({ para: null, lista: [], cargando: false });
  const [dialogo, setDialogo] = useState(null); // { tipo: 'turno'|'borrar'|'empleado', datos }
  const rango = useMemo(() => rangoPeriodo(periodo, dia), [periodo, dia]);
  const claveRango = `${clubId}|${rango.desdeMs}|${rango.hastaMs}`;

  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 60000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!clubId || !puedeVer) return undefined;
    const fallo = (err) => console.error("Error escuchando fichajes:", err);
    const u1 = escucharEmpleados(clubId, (lista) => setEmpleados({ para: clubId, lista }), fallo);
    const u2 = escucharAbiertos(clubId, (lista) => setAbiertos({ para: clubId, lista }), fallo);
    return () => {
      u1();
      u2();
    };
  }, [clubId, puedeVer]);

  useEffect(() => {
    if (!clubId || !puedeVer) return undefined;
    return escucharFichajesEntre(
      clubId,
      rango.desdeMs,
      rango.hastaMs,
      (lista) => setTurnos({ clave: claveRango, lista, error: false }),
      (err) => {
        console.error("Error cargando los turnos:", err);
        setTurnos({ clave: claveRango, lista: [], error: true });
      },
    );
  }, [clubId, puedeVer, rango.desdeMs, rango.hastaMs, claveRango]);

  const cargarAuditoria = async () => {
    setAuditoria((a) => ({ ...a, cargando: true }));
    try {
      setAuditoria({ para: clubId, lista: await getAuditoria(clubId), cargando: false });
    } catch (err) {
      console.error("Error cargando los cambios:", err);
      setAuditoria({ para: clubId, lista: [], cargando: false });
      toast.error("No pudimos cargar los cambios.");
    }
  };
  const cambiarTab = (t) => {
    setTab(t);
    if (t === "cambios") cargarAuditoria();
  };

  const listaTurnos = useMemo(() => (turnos.clave === claveRango ? turnos.lista : []), [turnos, claveRango]);
  const totales = useMemo(() => totalesPorEmpleado(listaTurnos, ahora), [listaTurnos, ahora]);
  const detalle = useMemo(() => (periodo === "dia" ? [] : agruparHoras(listaTurnos, { por: periodo === "mes" ? "semana" : "dia", ahora })), [listaTurnos, periodo, ahora]);
  const totalMin = totales.reduce((s, t) => s + t.minutos, 0);
  const sinSalida = listaTurnos.filter((t) => t.sinSalida).length;

  if (!clubCargado) return <div className="pd-skeleton h-64 rounded-lg" aria-busy="true" aria-label="Cargando" />;
  if (!puedeVer) {
    return (
      <div>
        <h1 className="heading-lg m-0 mb-4">Fichajes</h1>
        <SinPermiso />
      </div>
    );
  }

  const cargandoTurnos = turnos.clave !== claveRango;
  const listaEmpleados = empleados.para === clubId ? empleados.lista : [];
  const listaAbiertos = abiertos.para === clubId ? abiertos.lista : [];
  const cerrar = () => setDialogo(null);

  const exportar = () => {
    if (!listaTurnos.length) return toast.error("No hay turnos en el período.");
    descargar(aCsv(filasCsvFichajes(listaTurnos, Date.now())), nombreArchivoFichajes(clubActual?.nombre, rango.desde, rango.hasta));
    toast.success("CSV de fichajes descargado");
  };

  const selectorPeriodo = (
    <div className="flex flex-wrap items-center gap-3 mb-4">
      <Pills items={PERIODOS} value={periodo} onChange={setPeriodo} ariaLabel="Período" />
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" iconOnly aria-label="Período anterior" icon={icono(ChevronLeft)} onClick={() => setDia((d) => moverPeriodo(periodo, d, -1))} />
        <span className="body-md font-semibold min-w-[150px] text-center">{etiquetaRango(periodo, rango)}</span>
        <Button size="sm" variant="ghost" iconOnly aria-label="Período siguiente" icon={icono(ChevronRight)} onClick={() => setDia((d) => moverPeriodo(periodo, d, 1))} />
      </div>
      <Button size="sm" variant="ghost" onClick={() => setDia(diaArgentina(Date.now()))}>
        Hoy
      </Button>
    </div>
  );

  // ----- Pestañas -----

  const vistaHoras = (
    <>
      {selectorPeriodo}
      {cargandoTurnos ? (
        <div className="pd-skeleton h-40 rounded-lg" aria-busy="true" aria-label="Cargando" />
      ) : turnos.error ? (
        <Alert tone="danger">No pudimos cargar los turnos. Recargá la página.</Alert>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-4">
            <StatTile value={formatMinutos(totalMin)} label="Horas trabajadas" />
            <StatTile value={listaTurnos.length} label="Turnos" />
            <StatTile value={sinSalida} label="Sin salida" down={sinSalida > 0} />
          </div>
          {!totales.length ? (
            <Card className="text-center py-10!">
              <p className="heading-sm m-0">Nadie fichó en este período</p>
            </Card>
          ) : (
            <div className="pd-table-wrap mb-4">
              <div className="pd-table-head">
                <h3>Por persona</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="pd-table">
                  <thead>
                    <tr>
                      <th>Persona</th>
                      <th className="num">Horas</th>
                      <th className="num">Turnos</th>
                      <th className="num">Sin salida</th>
                    </tr>
                  </thead>
                  <tbody>
                    {totales.map((t) => (
                      <tr key={t.empleadoId}>
                        <td className="font-semibold">
                          {t.nombre}
                          {t.abiertos > 0 && (
                            <Badge tone="success" dot className="ml-2">
                              Trabajando
                            </Badge>
                          )}
                        </td>
                        <td className="num font-semibold">{formatMinutos(t.minutos)}</td>
                        <td className="num">{t.turnos}</td>
                        <td className="num">{t.sinSalida ? <span className="text-danger font-semibold">{t.sinSalida}</span> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {detalle.length > 0 && (
            <div className="pd-table-wrap">
              <div className="pd-table-head">
                <h3>{periodo === "mes" ? "Por semana" : "Por día"}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="pd-table">
                  <thead>
                    <tr>
                      <th>{periodo === "mes" ? "Semana del" : "Día"}</th>
                      <th>Persona</th>
                      <th className="num">Horas</th>
                      <th className="num">Turnos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.map((f) => (
                      <tr key={`${f.clave}|${f.empleadoId}`}>
                        <td>{formatDiaCorto(f.clave)}</td>
                        <td className="font-semibold">{f.nombre}</td>
                        <td className="num">{formatMinutos(f.minutos)}</td>
                        <td className="num">{f.turnos}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );

  const vistaTurnos = (
    <>
      {selectorPeriodo}
      {!soloLectura && (
        <div className="mb-4">
          <Button icon={icono(Plus)} onClick={() => setDialogo({ tipo: "turno", datos: null })} disabled={!listaEmpleados.length}>
            Cargar un turno
          </Button>
        </div>
      )}
      {cargandoTurnos ? (
        <div className="pd-skeleton h-40 rounded-lg" aria-busy="true" aria-label="Cargando" />
      ) : !listaTurnos.length ? (
        <Card className="text-center py-10!">
          <p className="heading-sm m-0">No hay turnos en este período</p>
        </Card>
      ) : (
        <div className="grid gap-2">
          {[...listaTurnos].reverse().map((t) => (
            <Card key={t.id} className="py-3!">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="body-md font-semibold m-0">
                    {t.nombre} <span className="text-ink-2 font-normal">· {formatDiaCorto(diaArgentina(ms(t.entrada)))}</span>
                  </p>
                  <p className="body-sm text-ink-2 m-0 pd-tnum">
                    {horarioDe(t)} · {formatMinutos(minutosDeTurno(t, ahora))}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {t.sinSalida && <Badge tone="danger">Sin salida</Badge>}
                    {ms(t.salida) === null && !t.sinSalida && (
                      <Badge tone="success" dot>
                        En curso
                      </Badge>
                    )}
                    <Badge>{ETIQUETA_ORIGEN[t.origen] || t.origen}</Badge>
                    {t.editadoPor && t.origen !== "manual" && <Badge tone="warning">Corregido</Badge>}
                  </div>
                  {t.nota && <p className="pd-help m-0 mt-1">“{t.nota}” — {t.editadoPorNombre || "admin"}</p>}
                </div>
                {!soloLectura && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" icon={icono(Pencil)} onClick={() => setDialogo({ tipo: "turno", datos: t })}>
                      {t.sinSalida ? "Cargar salida" : "Corregir"}
                    </Button>
                    <Button size="sm" variant="ghost" iconOnly aria-label="Borrar turno" icon={icono(Trash2)} onClick={() => setDialogo({ tipo: "borrar", datos: t })} />
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );

  const vistaEmpleados = (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="body-sm text-ink-2 m-0">Cada persona ficha con su PIN de {PIN_LARGO} números en la PC de la caja. No hace falta que tenga cuenta de Padely.</p>
        {!soloLectura && (
          <Button icon={icono(Plus)} onClick={() => setDialogo({ tipo: "empleado", datos: null })}>
            Agregar persona
          </Button>
        )}
      </div>
      {empleados.para !== clubId ? (
        <div className="pd-skeleton h-32 rounded-lg" aria-busy="true" aria-label="Cargando" />
      ) : !listaEmpleados.length ? (
        <Card className="text-center py-10!">
          <p className="heading-sm m-0">Todavía no cargaste a nadie</p>
          <p className="body-sm text-ink-2 mt-1 m-0">Agregá a quienes trabajan en el bar y la caja, con un PIN para cada uno.</p>
        </Card>
      ) : (
        <div className="grid gap-2">
          {listaEmpleados.map((e) => (
            <Card key={e.id} className="py-3!">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="body-md font-semibold m-0">{e.nombre}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {e.activo === false ? <Badge>Inactivo</Badge> : e.tienePin ? <Badge tone="success">PIN listo</Badge> : <Badge tone="warning">Sin PIN</Badge>}
                    {e.staffUid && <Badge tone="court">Con cuenta (QR)</Badge>}
                  </div>
                </div>
                {!soloLectura && (
                  <Button size="sm" variant="ghost" icon={icono(Pencil)} onClick={() => setDialogo({ tipo: "empleado", datos: e })}>
                    Editar
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );

  const ACCION = { crear: "Cargó", editar: "Corrigió", borrar: "Borró" };
  const turnoTexto = (x) => (x ? `${formatDiaCorto(diaArgentina(x.entrada))} ${horarioDe(x)}${x.sinSalida ? " (sin salida)" : ""}` : "");
  const vistaCambios = (
    <>
      {auditoria.cargando || auditoria.para !== clubId ? (
        <div className="pd-skeleton h-32 rounded-lg" aria-busy="true" aria-label="Cargando" />
      ) : !auditoria.lista.length ? (
        <Card className="text-center py-10!">
          <p className="heading-sm m-0">No hay cambios manuales</p>
        </Card>
      ) : (
        <div className="grid gap-2">
          {auditoria.lista.map((a) => (
            <Card key={a.id} className="py-3!">
              <p className="body-md m-0">
                <strong>{a.porNombre || "Alguien"}</strong> {(ACCION[a.accion] || a.accion).toLowerCase()} un turno de <strong>{a.nombre}</strong>
              </p>
              <p className="body-sm text-ink-2 m-0 pd-tnum">
                {a.antes && <>Antes: {turnoTexto(a.antes)}. </>}
                {a.despues && <>Ahora: {turnoTexto(a.despues)}.</>}
              </p>
              <p className="pd-help m-0 mt-1">
                “{a.nota}” · {formatFechaHoraArg(a.en)}
              </p>
            </Card>
          ))}
        </div>
      )}
    </>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="heading-lg m-0">Fichajes</h1>
          <p className="body-md text-ink-2 mt-1 mb-0">Entradas y salidas del equipo, con la hora del servidor.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={icono(Download)} onClick={exportar} disabled={cargandoTurnos}>
            Exportar CSV
          </Button>
          <Button as="link" to="/admin/bar/fichar" variant="primary" icon={icono(Clock)}>
            Abrir el fichaje
          </Button>
        </div>
      </div>

      {/* Quién está trabajando ahora */}
      <Card className="mb-6">
        <Card.Eyebrow>Trabajando ahora</Card.Eyebrow>
        {abiertos.para !== clubId ? (
          <div className="pd-skeleton h-10 rounded-md mt-2" aria-busy="true" aria-label="Cargando" />
        ) : !listaAbiertos.length ? (
          <p className="body-md text-ink-2 m-0 mt-1">Nadie fichó la entrada.</p>
        ) : (
          <ul className="m-0 mt-2 p-0 list-none grid gap-2">
            {listaAbiertos.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center gap-2 body-md">
                <Badge tone={esOlvidado(ms(t.entrada), ahora) ? "warning" : "success"} dot>
                  {t.nombre}
                </Badge>
                <span className="text-ink-2 pd-tnum">
                  desde las {horaArgentina(ms(t.entrada))}
                  {diaArgentina(ms(t.entrada)) !== diaArgentina(ahora) ? ` del ${formatDiaCorto(diaArgentina(ms(t.entrada)))}` : ""} · {formatMinutos(minutosDeTurno(t, ahora))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Tabs
        items={[
          { value: "horas", label: "Horas" },
          { value: "turnos", label: "Turnos", count: sinSalida },
          { value: "empleados", label: "Personas" },
          { value: "cambios", label: "Cambios" },
        ]}
        value={tab}
        onChange={cambiarTab}
        ariaLabel="Secciones de fichajes"
        className="mb-6"
      />

      {tab === "horas" ? vistaHoras : tab === "turnos" ? vistaTurnos : tab === "empleados" ? vistaEmpleados : vistaCambios}

      {dialogo?.tipo === "turno" && <TurnoDialog clubId={clubId} turno={dialogo.datos} empleados={listaEmpleados} diaInicial={rango.desde === rango.hasta ? rango.desde : diaArgentina(ahora)} onCerrar={cerrar} />}
      {dialogo?.tipo === "borrar" && <BorrarDialog clubId={clubId} turno={dialogo.datos} onCerrar={cerrar} />}
      {dialogo?.tipo === "empleado" && <EmpleadoDialog clubId={clubId} empleado={dialogo.datos} ownerUid={clubActual?.ownerUid} empleados={listaEmpleados} onCerrar={cerrar} />}
    </div>
  );
}
