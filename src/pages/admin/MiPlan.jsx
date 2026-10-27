import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { Check, Copy } from "lucide-react";
import { db } from "../../lib/firebase";
import { useAuthStore } from "../../store/authStore";
import { avisarPago, getDatosFacturacion } from "../../services/planesService";
import { COMISION_FREE_PCT, DIAS_PRUEBA, ESCALONES_PRO, ETIQUETA_PLAN, INCLUYE_PRO, canchasActivas, escalonDe, estadoPlan, precioAnual } from "../../utils/planes";
import { formatPrecio } from "../../utils/format";
import { formatFechaLarga } from "../../utils/formatDate";
import { ContactoPadely } from "../../components/PlanBloqueado";
import SinPermiso from "../../components/SinPermiso";
import { toast } from "../../components/Toast";
import { Alert, Badge, Button, Card, Field, Textarea } from "../../components/ui";

const INCLUYE_FREE = ["Canchas, grilla y reservas", "Turnos fijos", "Seña online con Mercado Pago", "Página pública del club", "Torneos en tu sede"];

// /admin/plan — Mi plan (P3-9): el plan del club, cuándo vence, qué incluye, el escalón PRO según las canchas activas,
// cómo pagar (datos de configuracionPadely/facturacion) y "Ya pagué, avisar" (solo el dueño).
export default function MiPlan() {
  const club = useAuthStore((s) => s.clubActual);
  const user = useAuthStore((s) => s.user);
  const perfil = useAuthStore((s) => s.perfil);
  const puede = useAuthStore((s) => s.puede);
  const esDueño = !!club && !!user && club.ownerUid === user.uid;
  const [canchas, setCanchas] = useState(null);
  const [pago, setPago] = useState(null);
  const [aviso, setAviso] = useState({ abierto: false, nota: "", enviando: false, enviado: false });

  useEffect(() => {
    if (!club?.id) return undefined;
    let vivo = true;
    getDocs(collection(db, "clubs", club.id, "canchas"))
      .then((snap) => vivo && setCanchas(canchasActivas(snap.docs.map((d) => d.data()))))
      .catch(() => vivo && setCanchas(0));
    getDatosFacturacion()
      .then((d) => vivo && setPago(d))
      .catch(() => vivo && setPago({}));
    return () => {
      vivo = false;
    };
  }, [club?.id]);

  if (!club) return <div className="pd-skeleton h-40 rounded-lg" aria-busy="true" aria-label="Cargando" />;
  if (!puede("configurarClub")) return <SinPermiso />;

  const plan = estadoPlan(club);
  const escalon = escalonDe(canchas ?? 1);
  const copiar = async (texto) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  };
  const enviarAviso = async () => {
    setAviso((a) => ({ ...a, enviando: true }));
    try {
      await avisarPago({ clubId: club.id, clubNombre: club.nombre, uid: user.uid, nombre: perfil?.nombre || user.displayName || user.email, monto: escalon.precio, nota: aviso.nota });
      setAviso({ abierto: false, nota: "", enviando: false, enviado: true });
      toast.success("Listo, le avisamos a Padely. Te confirmamos el pago en estos días.");
    } catch (err) {
      console.error("No se pudo avisar el pago:", err);
      setAviso((a) => ({ ...a, enviando: false }));
      toast.error("No pudimos avisar el pago. Escribinos por WhatsApp o mail.");
    }
  };

  const resumen = (() => {
    if (plan.tipo === "legacy") return "Tu club tiene todas las funciones PRO, sin vencimiento.";
    if (plan.tipo === "prueba" && plan.sinEmpezar) return `Tu prueba de ${DIAS_PRUEBA} días empieza con tu primera reserva confirmada. Mientras tanto tenés todo habilitado.`;
    if (plan.tipo === "prueba" && plan.pro) return `Tu prueba termina el ${formatFechaLarga(plan.vence)} (${plan.diasRestantes === 1 ? "queda 1 día" : `quedan ${plan.diasRestantes} días`}).`;
    if (plan.tipo === "pro" && plan.enGracia) return `Tu plan PRO venció el ${formatFechaLarga(plan.vence)}. Tenés hasta el ${formatFechaLarga(plan.graciaHasta)} para pagar sin perder el bar.`;
    if (plan.tipo === "pro" && plan.pro) return `PRO pago hasta el ${formatFechaLarga(plan.vence)}.`;
    return `Estás en el plan FREE: canchas, reservas y seña online, con una comisión de ${COMISION_FREE_PCT.toLocaleString("es-AR")} % por pago online.`;
  })();
  const etiqueta = plan.tipo === "prueba" && !plan.pro ? "FREE" : ETIQUETA_PLAN[plan.tipo] || plan.tipo;
  const tono = plan.pro ? (plan.enGracia || plan.avisoPrueba ? "warning" : "success") : "neutral";
  const hayDatosPago = pago && (pago.alias || pago.cbu);

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      <header>
        <h1 className="heading-lg m-0">Mi plan</h1>
        <p className="body-sm text-ink-2 m-0 mt-1">{club.nombre}</p>
      </header>

      <Card>
        <Card.Row>
          <Card.Title as="h2">Plan actual</Card.Title>
          <Badge tone={tono}>{etiqueta}</Badge>
        </Card.Row>
        <p className="body mt-2 mb-0">{resumen}</p>
        {canchas !== null && plan.tipo !== "legacy" && (
          <p className="body-sm text-ink-2 mt-2 mb-0 pd-tnum">
            Tenés {canchas === 1 ? "1 cancha activa" : `${canchas} canchas activas`}: tu PRO es {escalon.nombre}, {formatPrecio(escalon.precio)} por mes ({formatPrecio(precioAnual(escalon))} por año, 2 meses gratis).
          </p>
        )}
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <p className="pd-eyebrow m-0">FREE · $ 0 por mes</p>
          <ul className="mt-3 flex flex-col gap-2">
            {INCLUYE_FREE.map((item) => (
              <li key={item} className="flex items-start gap-2 body-sm text-ink-2">
                <Check className="pd-icon text-ink-3 shrink-0" size={20} aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="caption text-ink-3 mt-3 mb-0">Padely retiene {COMISION_FREE_PCT.toLocaleString("es-AR")} % de cada pago online.</p>
        </Card>
        <Card>
          <p className="pd-eyebrow m-0">PRO · desde {formatPrecio(ESCALONES_PRO[0].precio)} por mes</p>
          <ul className="mt-3 flex flex-col gap-2">
            {["Todo lo de FREE", ...INCLUYE_PRO].map((item) => (
              <li key={item} className="flex items-start gap-2 body-sm text-ink-2">
                <Check className="pd-icon text-ink-3 shrink-0" size={20} aria-hidden="true" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <ul className="mt-3 flex flex-col gap-1">
            {ESCALONES_PRO.map((e) => (
              <li key={e.id} className={`flex items-baseline justify-between gap-3 body-sm ${e.id === escalon.id && canchas !== null ? "font-semibold" : ""}`}>
                <span className="text-ink-2">{e.hasta ? `${e.desde} a ${e.hasta} canchas` : `${e.desde} o más canchas`}</span>
                <span className="pd-tnum">{formatPrecio(e.precio)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {plan.tipo !== "legacy" && (
        <Card>
          <Card.Title as="h2">Cómo pagar PRO</Card.Title>
          {hayDatosPago ? (
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              {pago.alias && (
                <div className="min-w-0">
                  <dt className="pd-eyebrow m-0">Alias</dt>
                  <dd className="m-0 mt-1 flex items-center gap-2">
                    <span className="font-semibold break-all">{pago.alias}</span>
                    <Button variant="ghost" size="sm" iconOnly aria-label="Copiar alias" onClick={() => copiar(pago.alias)} icon={<Copy className="pd-icon" size={16} aria-hidden="true" />} />
                  </dd>
                </div>
              )}
              {pago.cbu && (
                <div className="min-w-0">
                  <dt className="pd-eyebrow m-0">CBU / CVU</dt>
                  <dd className="m-0 mt-1 flex items-center gap-2">
                    <span className="font-semibold pd-tnum break-all">{pago.cbu}</span>
                    <Button variant="ghost" size="sm" iconOnly aria-label="Copiar CBU" onClick={() => copiar(pago.cbu)} icon={<Copy className="pd-icon" size={16} aria-hidden="true" />} />
                  </dd>
                </div>
              )}
              {pago.titular && (
                <div className="min-w-0">
                  <dt className="pd-eyebrow m-0">Titular</dt>
                  <dd className="m-0 mt-1">{pago.titular}</dd>
                </div>
              )}
            </dl>
          ) : (
            <p className="body-sm text-ink-2 mt-2">Escribinos y te pasamos los datos para transferir.</p>
          )}
          {pago?.nota && <p className="body-sm text-ink-2 mt-3 mb-0">{pago.nota}</p>}
          <p className="body-sm text-ink-2 mt-3 mb-0">Transferí {formatPrecio(escalon.precio)} (mes) o {formatPrecio(precioAnual(escalon))} (año) y avisanos: activamos tu PRO apenas lo vemos.</p>
          <div className="mt-4 flex flex-col gap-3">
            {esDueño &&
              (aviso.enviado ? (
                <Alert tone="success">Le avisamos a Padely. Te confirmamos el pago en estos días.</Alert>
              ) : aviso.abierto ? (
                <div className="flex flex-col gap-3">
                  <Field label="Nota (opcional)" help="Por ejemplo: la fecha o el número de la transferencia.">
                    <Textarea value={aviso.nota} onChange={(e) => setAviso((a) => ({ ...a, nota: e.target.value }))} maxLength={300} rows={2} />
                  </Field>
                  <div className="pd-btn-group">
                    <Button variant="primary" onClick={enviarAviso} cargando={aviso.enviando ? "Avisando…" : ""}>
                      Avisar a Padely
                    </Button>
                    <Button variant="ghost" onClick={() => setAviso((a) => ({ ...a, abierto: false }))}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              ) : (
                <div>
                  <Button onClick={() => setAviso((a) => ({ ...a, abierto: true }))}>Ya pagué, avisar</Button>
                </div>
              ))}
            <ContactoPadely clubNombre={club.nombre} />
          </div>
        </Card>
      )}

      <Card>
        <Card.Title as="h2">Torneos</Card.Title>
        <p className="body-sm text-ink-2 mt-2 mb-0">Los torneos se cobran por torneo, según el tamaño. Te pasamos el precio cuando lo armes.</p>
      </Card>
    </div>
  );
}
