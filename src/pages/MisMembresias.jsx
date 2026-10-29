import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Crown } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { cancelarPase, getMisMembresias, getPase, postularEquipo } from "../services/membresiasService";
import { toast } from "../components/Toast";
import { confirmar } from "../components/ConfirmDialog";
import { DIAS_CONSERVA_PUNTOS, ESTADOS_SOCIO, ETIQUETA_NIVEL, TONO_NIVEL, estadoSocio, proximoNivel, textosBeneficios } from "../utils/membresias";
import { svgQr } from "../utils/qr";
import { formatFechaLarga } from "../utils/formatDate";
import useTituloPagina from "../hooks/useTituloPagina";
import { Badge, Button, Card, Field, Select } from "../components/ui";

// /membresias (P3-16): los Pases Club del jugador: nivel (Bronce / Plata / Oro), puntos y cuánto falta para el
// próximo, el QR (→ /s/:token) para mostrar en el club, los beneficios del nivel, la postulación al equipo del club
// y la baja (corta el débito de Mercado Pago; los beneficios terminan ya, los puntos se guardan 90 días).
const TONO = { pendiente: "warning", activa: "success", vencida: "danger", cancelada: "neutral", rechazada: "neutral" };
const CATEGORIAS = ["8va", "7ma", "6ta", "5ta", "4ta", "3era", "2da", "1era"];
const POSICIONES = [
  { value: "drive", label: "Drive" },
  { value: "reves", label: "Revés" },
  { value: "indistinto", label: "Indistinto" },
];

export default function MisMembresias() {
  useTituloPagina("Mis pases");
  const user = useAuthStore((s) => s.user);
  const [lista, setLista] = useState(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!user?.uid) return undefined;
    let vivo = true;
    getMisMembresias(user.uid).then((l) => vivo && setLista(l));
    return () => {
      vivo = false;
    };
  }, [user?.uid, version]);

  const ordenadas = useMemo(() => {
    const peso = { activa: 0, pendiente: 1, vencida: 2, cancelada: 3 };
    return (lista || []).map((s) => ({ ...s, est: estadoSocio(s) })).sort((a, b) => (peso[a.est.estado] ?? 9) - (peso[b.est.estado] ?? 9));
  }, [lista]);

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-4">
      <header>
        <h1 className="heading-xl m-0">Mis pases</h1>
        <p className="body-sm text-ink-2 mt-1 mb-0">Mostrá el QR en el club para tus beneficios. Cuanto más jugás y consumís, más subís de nivel.</p>
      </header>
      {lista === null ? (
        <div className="pd-skeleton h-40 rounded-lg" aria-busy="true" aria-label="Cargando" />
      ) : ordenadas.length === 0 ? (
        <Card>
          <Card.Title as="h2">Todavía no tenés un Pase Club</Card.Title>
          <Card.Meta className="mt-1!">Si tu club tiene Pase, lo ves en su página, en la pestaña Pase.</Card.Meta>
          <div className="mt-3">
            <Link to="/clubes" className="underline font-semibold">
              Ver clubes
            </Link>
          </div>
        </Card>
      ) : (
        ordenadas.map((s) => <PaseCard key={`${s.clubId}-${s.id}`} socio={s} onCambio={() => setVersion((v) => v + 1)} />)
      )}
    </div>
  );
}

function PaseCard({ socio, onCambio }) {
  const { est } = socio;
  const [pase, setPase] = useState(null);
  const [equipo, setEquipo] = useState({ categoria: socio.equipo?.categoria || "", posicion: socio.equipo?.posicion || "indistinto" });
  const [guardando, setGuardando] = useState(false);
  useEffect(() => {
    let vivo = true;
    getPase(socio.clubId)
      .then((p) => vivo && setPase(p))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [socio.clubId]);
  const nivel = socio.nivel || "bronce";
  const proximo = proximoNivel(socio.puntos, pase?.umbrales);
  const link = socio.token ? `${window.location.origin}/s/${socio.token}` : "";
  const qr = useMemo(() => (link && est.activa ? svgQr(link, { titulo: "QR del Pase" }) : ""), [link, est.activa]);
  const beneficios = textosBeneficios(socio.beneficios);

  const darDeBaja = async () => {
    const ok = await confirmar({
      titulo: "¿Dar de baja tu Pase?",
      mensaje: `Se corta el débito automático y los beneficios terminan hoy. Tus puntos y tu nivel se guardan ${DIAS_CONSERVA_PUNTOS} días por si volvés.`,
      confirmText: "Dar de baja",
      danger: true,
    });
    if (!ok) return;
    try {
      await cancelarPase({ clubId: socio.clubId });
      toast.success("Listo, tu Pase quedó dado de baja");
      onCambio();
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "No pudimos dar de baja el Pase.");
    }
  };
  const guardarEquipo = async (quiere) => {
    setGuardando(true);
    try {
      await postularEquipo(socio.clubId, socio.uid, { quiere, ...equipo });
      toast.success(quiere ? "Listo: el club ve que querés estar en el equipo" : "Saliste de la lista del equipo");
      onCambio();
    } catch (err) {
      console.error(err);
      toast.error("No pudimos guardar.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Card>
      <Card.Row>
        <span className="flex items-center gap-2">
          <Crown className="pd-icon text-ink-3" size={20} aria-hidden="true" />
          <Link to={`/club/${socio.clubId}`} className="heading-md hover:underline">
            Pase Club {socio.clubNombre || ""}
          </Link>
        </span>
        <span className="pd-badge-group">
          {est.activa && <Badge tone={TONO_NIVEL[nivel]}>{ETIQUETA_NIVEL[nivel]}</Badge>}
          <Badge tone={TONO[est.estado] || "neutral"} dot>
            {ESTADOS_SOCIO[est.estado] || est.estado}
          </Badge>
        </span>
      </Card.Row>
      <Card.Meta className="mt-1!">
        {[socio.numero ? `Pase Nº ${socio.numero}` : null, `${socio.puntos || 0} puntos`, est.activa && est.vence ? `se renueva el ${formatFechaLarga(est.vence)}` : null].filter(Boolean).join(" · ")}
      </Card.Meta>
      {est.activa && proximo && (
        <p className="body-sm text-ink-2 mt-1 mb-0">
          Te faltan <strong>{proximo.faltan} puntos</strong> para {ETIQUETA_NIVEL[proximo.siguiente]}.
        </p>
      )}
      {est.estado === "pendiente" && <p className="body-sm text-ink-2 mt-2 mb-0">Falta que autorices el débito en Mercado Pago: entrá a la pestaña Pase del club.</p>}
      {(est.estado === "cancelada" || est.estado === "vencida") && <p className="body-sm text-ink-2 mt-2 mb-0">Tus puntos se guardan {DIAS_CONSERVA_PUNTOS} días desde la baja: si volvés antes, seguís en tu nivel.</p>}
      {est.activa && (
        <div className="mt-3 flex flex-col sm:flex-row gap-4 items-start">
          {qr ? (
            <div className="w-40 shrink-0 rounded-lg bg-white p-2 self-center" role="img" aria-label={`QR del Pase de ${socio.clubNombre || "tu club"}`} dangerouslySetInnerHTML={{ __html: qr }} />
          ) : (
            <p className="body-sm text-ink-3 m-0">Tu QR se está generando…</p>
          )}
          {beneficios.length > 0 && (
            <div>
              <p className="pd-eyebrow m-0">Tus beneficios {ETIQUETA_NIVEL[nivel]}</p>
              <ul className="body-sm mt-1 mb-0 pl-5">
                {beneficios.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {est.activa && (
        <div className="mt-4 pt-3 border-t border-line">
          <p className="pd-eyebrow m-0">Equipo del club (interclubes)</p>
          {socio.equipo?.quiere ? (
            <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
              <span className="body-sm">
                {socio.equipo.seleccionado ? "¡Estás en el equipo del club!" : "Te postulaste: el club arma el equipo."} {[socio.equipo.categoria, POSICIONES.find((p) => p.value === socio.equipo.posicion)?.label].filter(Boolean).join(" · ")}
              </span>
              <Button size="sm" variant="ghost" onClick={() => guardarEquipo(false)} cargando={guardando ? "Guardando…" : ""}>
                Salir de la lista
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-end gap-2 mt-2">
              <Field label="Categoría">
                <Select value={equipo.categoria} onChange={(e) => setEquipo({ ...equipo, categoria: e.target.value })}>
                  <option value="">Elegí</option>
                  {CATEGORIAS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Posición">
                <Select value={equipo.posicion} onChange={(e) => setEquipo({ ...equipo, posicion: e.target.value })}>
                  {POSICIONES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button onClick={() => guardarEquipo(true)} disabled={!equipo.categoria} cargando={guardando ? "Guardando…" : ""}>
                Quiero estar en el equipo
              </Button>
            </div>
          )}
          <div className="mt-4">
            <Button size="sm" variant="ghost" onClick={darDeBaja}>
              Dar de baja mi Pase
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}
