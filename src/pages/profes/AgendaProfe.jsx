import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Check, Repeat, UserX, X } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import useTituloPagina from "../../hooks/useTituloPagina";
import { cancelarClase, getClasesDeProfe, marcarClase, repetirClase, useFlagProfes } from "../../services/profesService";
import { MAX_SEMANAS_REPETIR, inicioClaseMs, inscriptosDe, labelTipoClase } from "../../utils/profes";
import { addDaysLocal, formatDiaCorto, getTodayLocal } from "../../utils/formatDate";
import { formatPrecio } from "../../utils/format";
import { toast } from "../../components/Toast";
import { confirmar } from "../../components/ConfirmDialog";
import Dialogo from "../../components/Dialogo";
import { ProfesApagado } from "../../components/profes/ProfeCard";
import { Alert, Badge, Button, Card, Field, Input, Pills, Select } from "../../components/ui";

const VISTAS = [
  { value: "hoy", label: "Hoy" },
  { value: "semana", label: "Semana" },
  { value: "todas", label: "Próximas" },
  { value: "pasadas", label: "Para marcar" },
];

function RepetirDialog({ clase, onCerrar, onListo }) {
  const inscriptos = inscriptosDe(clase);
  const [alumnoUid, setAlumnoUid] = useState(inscriptos[0]?.uid || "");
  const [semanas, setSemanas] = useState("4");
  const [enviando, setEnviando] = useState(false);
  const [resultados, setResultados] = useState(null);
  const enviar = async () => {
    if (resultados) return onListo();
    setEnviando(true);
    try {
      const r = await repetirClase({ claseId: clase.id, alumnoUid, semanas: Number(semanas) });
      setResultados(r.resultados || []);
    } catch (err) {
      toast.error(err?.message || "No pudimos repetir la clase.");
    } finally {
      setEnviando(false);
    }
  };
  return (
    <Dialogo
      titulo="Repetir semanal"
      descripcion={`La misma clase (${labelTipoClase(clase.tipoClase)}, ${clase.horaInicio}) para el mismo alumno las próximas semanas. Cada una es una reserva normal: se puede cancelar sola.`}
      onCerrar={resultados ? onListo : onCerrar}
      onSubmit={enviar}
      acciones={
        resultados ? (
          <Button type="submit" variant="primary">
            Listo
          </Button>
        ) : (
          <>
            <Button onClick={onCerrar}>Cancelar</Button>
            <Button type="submit" variant="primary" disabled={!alumnoUid} cargando={enviando ? "Reservando…" : ""}>
              Repetir
            </Button>
          </>
        )
      }
    >
      {resultados ? (
        <ul className="mt-4 m-0 p-0 list-none flex flex-col gap-1">
          {resultados.map((r) => (
            <li key={r.fecha} className="flex items-center gap-2 body-sm">
              <Badge tone={r.ok ? "success" : "warning"}>{r.ok ? "Reservada" : "Salteada"}</Badge>
              <span className="pd-tnum">{formatDiaCorto(r.fecha)}</span>
              {!r.ok && <span className="text-ink-3">{r.motivo}</span>}
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Alumno">
            <Select value={alumnoUid} onChange={(e) => setAlumnoUid(e.target.value)} data-autofocus>
              {inscriptos.map((i) => (
                <option key={i.uid} value={i.uid}>
                  {i.nombre}
                  {(i.participantes || []).length ? ` (+${i.participantes.length})` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Semanas" help={`De 1 a ${MAX_SEMANAS_REPETIR}`}>
            <Input type="number" min="1" max={MAX_SEMANAS_REPETIR} value={semanas} onChange={(e) => setSemanas(e.target.value)} inputMode="numeric" className="pd-tnum" />
          </Field>
        </div>
      )}
    </Dialogo>
  );
}

// /profe/agenda (flags.profes): las clases del profe. Hoy, la semana, las próximas y las que ya pasaron sin marcar.
// Marcar dada (habilita los elogios), ausente / presente, cobrado, cancelar y "repetir semanal".
export default function AgendaProfe() {
  useTituloPagina("Mi agenda");
  const flag = useFlagProfes();
  const user = useAuthStore((s) => s.user);
  const [clases, setClases] = useState(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [vista, setVista] = useState("hoy");
  const [version, setVersion] = useState(0);
  const [ocupado, setOcupado] = useState("");
  const [repetir, setRepetir] = useState(null);
  const hoy = getTodayLocal();

  useEffect(() => {
    if (flag !== true || !user?.uid) return undefined;
    let vivo = true;
    getClasesDeProfe(user.uid, addDaysLocal(hoy, -14))
      .then((l) => {
        if (!vivo) return;
        setClases(l);
        setAhora(Date.now());
      })
      .catch((err) => {
        console.error("Error cargando la agenda:", err);
        if (vivo) setClases([]);
      });
    return () => {
      vivo = false;
    };
  }, [flag, user?.uid, version, hoy]);

  if (flag === null) return <div className="pd-skeleton h-40 rounded-lg" aria-busy="true" aria-label="Cargando" />;
  if (!flag) return <ProfesApagado />;


  const empezo = (c) => inicioClaseMs(c.fecha, c.horaInicio) <= ahora;
  const finSemana = addDaysLocal(hoy, 7);
  const filtradas = (clases || [])
    .filter((c) => {
      if (vista === "hoy") return c.fecha === hoy && c.estado !== "cancelada";
      if (vista === "semana") return c.fecha >= hoy && c.fecha < finSemana && c.estado !== "cancelada";
      if (vista === "todas") return c.fecha >= hoy && c.estado === "confirmada";
      return c.estado === "confirmada" && empezo(c);
    })
    .sort((a, b) => `${a.fecha}${a.horaInicio}`.localeCompare(`${b.fecha}${b.horaInicio}`));
  const paraMarcar = (clases || []).filter((c) => c.estado === "confirmada" && empezo(c)).length;

  const accion = async (c, que, alumnoUid = null) => {
    setOcupado(`${c.id}|${que}|${alumnoUid || ""}`);
    try {
      await marcarClase({ claseId: c.id, que, alumnoUid });
      if (que === "dada") toast.success("Clase marcada como dada: tus alumnos ya pueden dejarte un elogio");
      setVersion((v) => v + 1);
    } catch (err) {
      toast.error(err?.message || "No pudimos guardar el cambio.");
    } finally {
      setOcupado("");
    }
  };
  const cancelar = async (c) => {
    const ok = await confirmar({ titulo: "Cancelar la clase", mensaje: "Se avisa a tus alumnos y se libera la cancha. Si alguien pagó online, se le devuelve.", confirmText: "Cancelar clase", cancelText: "Volver", danger: true });
    if (!ok) return;
    setOcupado(`${c.id}|cancelar|`);
    try {
      await cancelarClase({ claseId: c.id });
      toast.success("Clase cancelada");
      setVersion((v) => v + 1);
    } catch (err) {
      toast.error(err?.message || "No pudimos cancelar la clase.");
    } finally {
      setOcupado("");
    }
  };

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="heading-xl m-0">Mi agenda</h1>
          <p className="body-sm text-ink-2 mt-1 mb-0">Tus clases en todos tus clubes.</p>
        </div>
        <Button as="link" to="/profe/panel" size="sm">
          Mi perfil de profe
        </Button>
      </header>
      <Pills items={VISTAS.map((v) => (v.value === "pasadas" ? { ...v, count: paraMarcar || undefined } : v))} value={vista} onChange={setVista} ariaLabel="Ver" />
      {clases === null ? (
        <div className="pd-skeleton h-40 rounded-lg" aria-busy="true" aria-label="Cargando" />
      ) : filtradas.length === 0 ? (
        <Card className="text-center py-10!">
          <span className="pd-ball mx-auto mb-3 block!" aria-hidden="true" />
          <p className="body-md text-ink-2 m-0">{vista === "pasadas" ? "No tenés clases para marcar." : "No tenés clases en este período."}</p>
          {vista !== "pasadas" && (
            <p className="body-sm text-ink-3 mt-2 mb-0">
              Compartí <Link to={`/profe/${user.uid}`} className="underline">tu perfil</Link> para que te reserven.
            </p>
          )}
        </Card>
      ) : (
        filtradas.map((c) => {
          const inscriptos = inscriptosDe(c);
          const ya = empezo(c);
          const ocupadoEn = (que, uid = "") => ocupado === `${c.id}|${que}|${uid}`;
          return (
            <Card key={c.id}>
              <Card.Row className="items-start!">
                <Card.Eyebrow className="pd-tnum">
                  {formatDiaCorto(c.fecha)} · {c.horaInicio}–{c.horaFin}
                </Card.Eyebrow>
                <Badge tone={c.estado === "dada" ? "neutral" : c.estado === "cancelada" ? "danger" : "success"} dot={c.estado === "confirmada"}>
                  {c.estado === "dada" ? "Dada" : c.estado === "cancelada" ? "Cancelada" : "Confirmada"}
                </Badge>
              </Card.Row>
              <Card.Title className="mt-2!">
                {labelTipoClase(c.tipoClase)} · {c.clubNombre}
              </Card.Title>
              <Card.Meta>
                {c.canchaName ? `${c.canchaName} · ` : c.bloqueaCancha === false ? "Sin cancha reservada · " : ""}
                {c.ocupados}/{c.capacidad} {c.capacidad === 1 ? "alumno" : "lugares"} · {c.cobra === "club" ? "cobra el club" : "cobrás vos"}
              </Card.Meta>
              {inscriptos.length > 0 && (
                <ul className="m-0 p-0 list-none divide-y divide-line mt-3">
                  {inscriptos.map((i) => (
                    <li key={i.uid} className="py-2 flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold">{i.nombre}</span>
                        {(i.participantes || []).length > 0 && <span className="body-sm text-ink-3"> + {i.participantes.map((p) => p.nombre).join(", ")}</span>}
                        <span className="block body-sm text-ink-3 pd-tnum">{formatPrecio(i.monto)}</span>
                      </span>
                      <Badge tone={i.pago?.estado === "pagado" ? "success" : "warning"}>{i.pago?.estado === "pagado" ? (i.pago.medio === "mercadopago" ? "Pagó por MP" : "Cobrado") : "A cobrar"}</Badge>
                      {i.asistencia === "ausente" && <Badge tone="danger">Ausente</Badge>}
                      {c.estado !== "cancelada" && (
                        <div className="pd-btn-group">
                          {i.pago?.estado !== "pagado" && (
                            <Button size="sm" onClick={() => accion(c, "cobrado", i.uid)} cargando={ocupadoEn("cobrado", i.uid) ? "…" : ""}>
                              Cobrado
                            </Button>
                          )}
                          {ya && (
                            <Button size="sm" variant="ghost" icon={i.asistencia === "ausente" ? <Check className="pd-icon" size={20} aria-hidden="true" /> : <UserX className="pd-icon" size={20} aria-hidden="true" />} onClick={() => accion(c, i.asistencia === "ausente" ? "presente" : "ausente", i.uid)} cargando={ocupadoEn(i.asistencia === "ausente" ? "presente" : "ausente", i.uid) ? "…" : ""}>
                              {i.asistencia === "ausente" ? "Vino" : "Ausente"}
                            </Button>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {c.estado !== "cancelada" && (
                <Card.Foot className="flex-wrap">
                  <div className="pd-btn-group ml-auto">
                    {c.estado === "confirmada" && ya && (
                      <Button size="sm" variant="primary" icon={<Check className="pd-icon" size={20} aria-hidden="true" />} onClick={() => accion(c, "dada")} cargando={ocupadoEn("dada") ? "…" : ""}>
                        Marcar dada
                      </Button>
                    )}
                    {inscriptos.length > 0 && (
                      <Button size="sm" icon={<Repeat className="pd-icon" size={20} aria-hidden="true" />} onClick={() => setRepetir(c)}>
                        Repetir semanal
                      </Button>
                    )}
                    {c.estado === "confirmada" && !ya && (
                      <Button size="sm" variant="ghost" icon={<X className="pd-icon" size={20} aria-hidden="true" />} onClick={() => cancelar(c)} cargando={ocupadoEn("cancelar") ? "…" : ""}>
                        Cancelar
                      </Button>
                    )}
                  </div>
                </Card.Foot>
              )}
            </Card>
          );
        })
      )}
      {vista === "pasadas" && paraMarcar > 0 && <Alert tone="info">Marcá tus clases como dadas: así tus alumnos te pueden dejar un elogio.</Alert>}
      {repetir && (
        <RepetirDialog
          clase={repetir}
          onCerrar={() => setRepetir(null)}
          onListo={() => {
            setRepetir(null);
            setVersion((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}
