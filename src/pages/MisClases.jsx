import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CreditCard, Flag, Star, X } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import useTituloPagina from "../hooks/useTituloPagina";
import { cancelarClase, elogiarClase, getMisClases, pagarClaseOnline, reportarClase, useFlagProfes } from "../services/profesService";
import { ELOGIOS, MAX_COMENTARIO_ELOGIO, MAX_ELOGIOS_POR_CLASE, inicioClaseMs, labelTipoClase, puedeElogiar, validarElogio } from "../utils/profes";
import { formatDiaCorto, getTodayLocal } from "../utils/formatDate";
import { formatPrecio } from "../utils/format";
import { toast } from "../components/Toast";
import { confirmar } from "../components/ConfirmDialog";
import Dialogo from "../components/Dialogo";
import { AvatarProfe, ProfesApagado } from "../components/profes/ProfeCard";
import { Alert, Badge, Button, Card, Field, Pills, Textarea } from "../components/ui";

const TONO_ESTADO = { confirmada: "success", dada: "neutral", cancelada: "danger" };
const LABEL_ESTADO = { confirmada: "Confirmada", dada: "Dada", cancelada: "Cancelada" };

function ElogioDialog({ clase, onCerrar, onListo }) {
  const [tags, setTags] = useState([]);
  const [comentario, setComentario] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const elegir = (v) => {
    setError("");
    setTags((t) => (t.includes(v) ? t.filter((x) => x !== v) : t.length >= MAX_ELOGIOS_POR_CLASE ? t : [...t, v]));
  };
  const enviar = async () => {
    const v = validarElogio({ tags, comentario });
    if (v.error) return setError(v.error);
    setEnviando(true);
    try {
      await elogiarClase({ claseId: clase.id, tags: v.tags, comentario: v.comentario });
      toast.success("¡Gracias! Tu elogio ya está en el perfil del profe");
      onListo();
    } catch (err) {
      setError(err?.message || "No pudimos guardar tu elogio.");
      setEnviando(false);
    }
  };
  return (
    <Dialogo
      titulo={`Elogio para ${clase.profeNombre}`}
      descripcion={`Elegí hasta ${MAX_ELOGIOS_POR_CLASE}. Solo cosas buenas: si algo salió mal, usá "Avisar de un problema".`}
      onCerrar={onCerrar}
      onSubmit={enviar}
      acciones={
        <>
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" variant="primary" cargando={enviando ? "Enviando…" : ""}>
            Enviar elogio
          </Button>
        </>
      }
    >
      <div className="mt-4 flex flex-col gap-4">
        <Pills multi items={ELOGIOS.map((e) => ({ value: e.id, label: e.label }))} value={tags} onChange={elegir} ariaLabel="Elogios" className="flex-wrap!" />
        <Field label="Comentario (opcional, se ve en su perfil)" help={`${comentario.length}/${MAX_COMENTARIO_ELOGIO}`} error={error || undefined}>
          <Textarea value={comentario} onChange={(e) => setComentario(e.target.value.slice(0, MAX_COMENTARIO_ELOGIO))} rows={3} maxLength={MAX_COMENTARIO_ELOGIO} />
        </Field>
      </div>
    </Dialogo>
  );
}

function ReporteDialog({ clase, onCerrar }) {
  const [texto, setTexto] = useState("");
  const [error, setError] = useState("");
  const [enviando, setEnviando] = useState(false);
  const enviar = async () => {
    if (texto.trim().length < 10) return setError("Contanos qué pasó (al menos 10 letras).");
    setEnviando(true);
    try {
      await reportarClase({ claseId: clase.id, texto: texto.trim() });
      toast.success("Gracias por avisar. Lo ven el club y el equipo de Padely.");
      onCerrar();
    } catch (err) {
      setError(err?.message || "No pudimos enviar el aviso.");
      setEnviando(false);
    }
  };
  return (
    <Dialogo
      titulo="Avisar de un problema"
      descripcion="Es privado: lo leen el dueño del club y el equipo de Padely, no el profe ni otros jugadores."
      onCerrar={onCerrar}
      onSubmit={enviar}
      acciones={
        <>
          <Button onClick={onCerrar}>Cancelar</Button>
          <Button type="submit" variant="primary" cargando={enviando ? "Enviando…" : ""}>
            Enviar aviso
          </Button>
        </>
      }
    >
      <Field label="¿Qué pasó?" error={error || undefined} className="mt-4">
        <Textarea value={texto} onChange={(e) => setTexto(e.target.value.slice(0, 1000))} rows={4} maxLength={1000} data-autofocus />
      </Field>
    </Dialogo>
  );
}

// /mis-clases (flags.profes): las clases del jugador (las que reservó y a las que lo sumaron). Pagar online (si cobra el
// club con Mercado Pago), cancelar su lugar, dejar un elogio después de una clase dada y avisar de un problema.
export default function MisClases() {
  useTituloPagina("Mis clases");
  const flag = useFlagProfes();
  const user = useAuthStore((s) => s.user);
  const [clases, setClases] = useState(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const [version, setVersion] = useState(0);
  const [dialogo, setDialogo] = useState(null); // { tipo: "elogio" | "reporte", clase }
  const [ocupado, setOcupado] = useState("");
  const [params] = useSearchParams();
  const vueltaMp = params.get("mp");

  useEffect(() => {
    if (vueltaMp === "ok") toast.success("¡Pago recibido! En unos segundos se ve en tu clase.");
    else if (vueltaMp === "pendiente") toast.info("Mercado Pago está procesando el pago.");
    else if (vueltaMp === "error") toast.error("El pago no se completó. Podés intentar de nuevo o pagar en el club.");
  }, [vueltaMp]);

  useEffect(() => {
    if (flag !== true || !user?.uid) return undefined;
    let vivo = true;
    getMisClases(user.uid)
      .then((l) => {
        if (!vivo) return;
        setClases(l);
        setAhora(Date.now());
      })
      .catch((err) => {
        console.error("Error cargando mis clases:", err);
        if (vivo) setClases([]);
      });
    return () => {
      vivo = false;
    };
  }, [flag, user?.uid, version]);

  if (flag === null) return <div className="pd-skeleton h-40 rounded-lg" aria-busy="true" aria-label="Cargando" />;
  if (!flag) return <ProfesApagado />;

  const hoy = getTodayLocal();

  const proximas = (clases || []).filter((c) => c.estado === "confirmada" && inicioClaseMs(c.fecha, c.horaFin || c.horaInicio) > ahora).sort((a, b) => `${a.fecha}${a.horaInicio}`.localeCompare(`${b.fecha}${b.horaInicio}`));
  const anteriores = (clases || []).filter((c) => !proximas.includes(c));

  const cancelar = async (c) => {
    const ok = await confirmar({ titulo: "Cancelar tu lugar", mensaje: c.inscriptos?.[user.uid]?.pago?.medio === "mercadopago" ? "Si pagaste online, la devolución sigue la política de cancelación del club." : "Se libera tu lugar en la clase.", confirmText: "Cancelar mi lugar", cancelText: "Volver", danger: true });
    if (!ok) return;
    setOcupado(c.id);
    try {
      await cancelarClase({ claseId: c.id });
      toast.success("Cancelaste tu lugar");
      setVersion((v) => v + 1);
    } catch (err) {
      toast.error(err?.message || "No pudimos cancelar.");
    } finally {
      setOcupado("");
    }
  };
  const pagar = async (c) => {
    setOcupado(c.id);
    try {
      await pagarClaseOnline(c.id);
    } catch (err) {
      toast.error(err?.message || "No pudimos abrir Mercado Pago. Podés pagar en el club.");
      setOcupado("");
    }
  };

  const tarjeta = (c) => {
    const mia = c.inscriptos?.[user.uid] || (c.bajas || []).find((b) => b.uid === user.uid) || null;
    const meDiDeBaja = !c.inscriptos?.[user.uid] && !(c.alumnosUids || []).includes(user.uid) && c.estado !== "cancelada";
    const futura = c.estado === "confirmada" && inicioClaseMs(c.fecha, c.horaInicio) > ahora;
    const pago = mia?.pago || null;
    const elogio = puedeElogiar(c, user.uid);
    const esReserva = !!c.inscriptos?.[user.uid];
    return (
      <Card key={c.id}>
        <Card.Row className="items-start!">
          <Card.Eyebrow className="pd-tnum">
            {formatDiaCorto(c.fecha)} · {c.horaInicio}–{c.horaFin}
            {c.fecha === hoy ? " · hoy" : ""}
          </Card.Eyebrow>
          <Badge tone={meDiDeBaja ? "neutral" : TONO_ESTADO[c.estado] || "neutral"} dot={c.estado === "confirmada" && !meDiDeBaja}>
            {meDiDeBaja ? "Cancelaste" : LABEL_ESTADO[c.estado] || c.estado}
          </Badge>
        </Card.Row>
        <div className="flex items-center gap-3 mt-2">
          <AvatarProfe profe={c} size={40} />
          <div className="min-w-0">
            <Card.Title className="truncate">
              <Link to={`/profe/${c.profeUid}`} className="hover:underline">
                {c.profeNombre}
              </Link>
            </Card.Title>
            <Card.Meta className="truncate">
              {labelTipoClase(c.tipoClase)} · {c.clubNombre}
              {c.canchaName ? ` · ${c.canchaName}` : ""}
            </Card.Meta>
          </div>
        </div>
        {mia && esReserva && (mia.participantes || []).length > 0 && <Card.Meta className="mt-2!">Con {mia.participantes.map((p) => p.nombre).join(", ")}</Card.Meta>}
        <Card.Foot className="flex-wrap">
          {esReserva && mia && <span className="numeral-md pd-tnum">{formatPrecio(mia.monto)}</span>}
          {esReserva && pago && c.estado !== "cancelada" && <Badge tone={pago.estado === "pagado" ? "success" : "warning"}>{pago.estado === "pagado" ? (pago.medio === "mercadopago" ? "Pagada por Mercado Pago" : "Pagada") : "A pagar en el club"}</Badge>}
          {c.estado === "cancelada" && c.motivoCancelacion && <span className="body-sm text-ink-3">{c.motivoCancelacion}</span>}
          <div className="pd-btn-group ml-auto">
            {futura && esReserva && c.cobra === "club" && pago?.estado !== "pagado" && (
              <Button size="sm" variant="primary" icon={<CreditCard className="pd-icon" size={20} aria-hidden="true" />} onClick={() => pagar(c)} cargando={ocupado === c.id ? "…" : ""}>
                Pagar online
              </Button>
            )}
            {futura && esReserva && (
              <Button size="sm" variant="ghost" icon={<X className="pd-icon" size={20} aria-hidden="true" />} onClick={() => cancelar(c)} disabled={ocupado === c.id}>
                Cancelar
              </Button>
            )}
            {elogio.ok && (
              <Button size="sm" variant="primary" icon={<Star className="pd-icon" size={20} aria-hidden="true" />} onClick={() => setDialogo({ tipo: "elogio", clase: c })}>
                Dejar un elogio
              </Button>
            )}
            {(c.elogiadoPor || []).includes(user.uid) && <Badge tone="lime">Elogio enviado</Badge>}
            {!futura && (
              <Button size="sm" variant="ghost" icon={<Flag className="pd-icon" size={20} aria-hidden="true" />} onClick={() => setDialogo({ tipo: "reporte", clase: c })}>
                Avisar de un problema
              </Button>
            )}
          </div>
        </Card.Foot>
      </Card>
    );
  };

  return (
    <div className="max-w-3xl mx-auto flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="heading-xl m-0">Mis clases</h1>
          <p className="body-sm text-ink-2 mt-1 mb-0">Tus clases con profes: las que reservaste y a las que te sumaron.</p>
        </div>
        <Button as="link" to="/profes" size="sm">
          Buscar profe
        </Button>
      </header>
      {clases === null ? (
        <div className="pd-skeleton h-40 rounded-lg" aria-busy="true" aria-label="Cargando" />
      ) : clases.length === 0 ? (
        <Card className="text-center py-10!">
          <span className="pd-ball mx-auto mb-3 block!" aria-hidden="true" />
          <p className="body-md text-ink-2 m-0">Todavía no tomaste clases con un profe de Padely.</p>
          <Button as="link" to="/profes" variant="primary" className="mt-4">
            Ver profes
          </Button>
        </Card>
      ) : (
        <>
          <section className="flex flex-col gap-3">
            <h2 className="heading-md m-0">Próximas</h2>
            {proximas.length === 0 ? <Alert tone="info">No tenés clases próximas.</Alert> : proximas.map(tarjeta)}
          </section>
          {anteriores.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="heading-md m-0">Anteriores</h2>
              {anteriores.map(tarjeta)}
            </section>
          )}
        </>
      )}
      {dialogo?.tipo === "elogio" && (
        <ElogioDialog
          clase={dialogo.clase}
          onCerrar={() => setDialogo(null)}
          onListo={() => {
            setDialogo(null);
            setVersion((v) => v + 1);
          }}
        />
      )}
      {dialogo?.tipo === "reporte" && <ReporteDialog clase={dialogo.clase} onCerrar={() => setDialogo(null)} />}
    </div>
  );
}
