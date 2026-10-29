import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { IdCard, X } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { agregarIntegrante, getMisMembresias, quitarIntegrante } from "../services/membresiasService";
import { pagarConMercadoPago } from "../services/mercadoPagoService";
import { toast } from "../components/Toast";
import { confirmar } from "../components/ConfirmDialog";
import { estadoSocio, lugaresFamilia, textosBeneficios } from "../utils/membresias";
import { svgQr } from "../utils/qr";
import { formatFechaLarga } from "../utils/formatDate";
import useTituloPagina from "../hooks/useTituloPagina";
import { Badge, Button, Card, Field, Input } from "../components/ui";

// /membresias (P3-16): los Pases del jugador en todos los clubes, con el QR (→ /s/:token) para mostrar en el club
// (estacionamiento, exhibiciones, descuentos en el bar). El titular de un Pase familiar suma o saca integrantes
// (con cuenta en Padely, por email) y lo renueva con Mercado Pago; los integrantes ven el Pase del titular.
const TONO = { pendiente: "warning", activa: "success", vencida: "danger", cancelada: "neutral", rechazada: "neutral" };
const ESTADO_PASE = { pendiente: "Pedido", activa: "Activo", vencida: "Vencido", cancelada: "Dado de baja", rechazada: "Rechazado" };

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
    const peso = { activa: 0, pendiente: 1, vencida: 2, rechazada: 3, cancelada: 4 };
    return (lista || []).map((s) => ({ ...s, est: estadoSocio(s) })).sort((a, b) => (peso[a.est.estado] ?? 9) - (peso[b.est.estado] ?? 9));
  }, [lista]);

  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-4">
      <header>
        <h1 className="heading-xl m-0">Mis pases</h1>
        <p className="body-sm text-ink-2 mt-1 mb-0">Mostrá el QR en el club para tus beneficios.</p>
      </header>
      {lista === null ? (
        <div className="pd-skeleton h-40 rounded-lg" aria-busy="true" aria-label="Cargando" />
      ) : ordenadas.length === 0 ? (
        <Card>
          <Card.Title as="h2">Todavía no tenés un Pase</Card.Title>
          <Card.Meta className="mt-1!">Si tu club tiene Pases, los ves en su página, en la pestaña Pase.</Card.Meta>
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
  const [abriendo, setAbriendo] = useState(false);
  const [email, setEmail] = useState("");
  const [sumando, setSumando] = useState(false);
  const esIntegrante = !!socio.titularId;
  const familia = Array.isArray(socio.familia) ? socio.familia : [];
  const lugares = lugaresFamilia(socio, { integrantes: socio.integrantes });
  // Renovar online: el club tiene que tener Mercado Pago conectado (si no, la callable lo dice)
  const renovar = async () => {
    setAbriendo(true);
    try {
      await pagarConMercadoPago({ clubId: socio.clubId, tipo: "membresia", planId: socio.planId });
    } catch (err) {
      console.error("No se pudo abrir Mercado Pago:", err);
      toast.error(err?.message || "No pudimos abrir Mercado Pago: renovalo en el club.");
      setAbriendo(false);
    }
  };
  const sumar = async (e) => {
    e.preventDefault();
    setSumando(true);
    try {
      const r = await agregarIntegrante({ clubId: socio.clubId, email: email.trim() });
      toast.success(`${r?.nombre || "Listo"}: ya está en tu Pase`);
      setEmail("");
      onCambio();
    } catch (err) {
      console.error("No se pudo sumar al integrante:", err);
      toast.error(err?.message || "No pudimos sumarlo.");
    } finally {
      setSumando(false);
    }
  };
  const sacar = async (f) => {
    const propio = f.uid === socio.uid;
    const ok = await confirmar({ titulo: propio ? "¿Salir de este Pase?" : `¿Sacar a ${f.nombre}?`, mensaje: propio ? "Dejás de tener los beneficios." : "Deja de tener los beneficios y se libera su lugar.", confirmText: propio ? "Salir" : "Sacar", danger: true });
    if (!ok) return;
    try {
      await quitarIntegrante({ clubId: socio.clubId, uid: f.uid });
      toast.success(propio ? "Saliste del Pase" : "Listo");
      onCambio();
    } catch (err) {
      console.error(err);
      toast.error(err?.message || "No pudimos guardar el cambio.");
    }
  };
  const link = socio.token ? `${window.location.origin}/s/${socio.token}` : "";
  const qr = useMemo(() => (link && est.activa ? svgQr(link, { titulo: "QR del Pase" }) : ""), [link, est.activa]);
  const beneficios = textosBeneficios(socio.beneficios);
  return (
    <Card>
      <Card.Row>
        <span className="flex items-center gap-2">
          <IdCard className="pd-icon text-ink-3" size={20} aria-hidden="true" />
          <Link to={`/club/${socio.clubId}`} className="heading-md hover:underline">
            {socio.clubNombre || "Club"}
          </Link>
        </span>
        <Badge tone={TONO[est.estado] || "neutral"} dot>
          {ESTADO_PASE[est.estado] || est.estado}
        </Badge>
      </Card.Row>
      <Card.Meta className="mt-1!">
        {[socio.planNombre, socio.numero ? `Pase Nº ${socio.numero}` : null, est.vence ? `${est.activa ? "Vence" : "Venció"} el ${formatFechaLarga(est.vence)}` : null].filter(Boolean).join(" · ")}
      </Card.Meta>
      {esIntegrante && <p className="body-sm text-ink-2 mt-1 mb-0">Sos parte del Pase de {socio.titularNombre || "tu grupo"}: lo renueva el titular.</p>}
      {est.estado === "pendiente" && <p className="body-sm text-ink-2 mt-2 mb-0">El club tiene que aprobar tu pedido y cobrarte. Te avisamos cuando esté activo.</p>}
      {est.porVencer && !esIntegrante && <p className="body-sm text-warning mt-2 mb-0">Vence en {est.diasRestantes} {est.diasRestantes === 1 ? "día" : "días"}.</p>}
      {(est.activa || est.estado === "vencida") && socio.planId && !esIntegrante && (
        <div className="mt-3">
          <Button size="sm" variant={est.porVencer || est.estado === "vencida" ? "primary" : "ghost"} onClick={renovar} cargando={abriendo ? "Abriendo Mercado Pago…" : ""}>
            Renovar con Mercado Pago
          </Button>
        </div>
      )}
      {est.activa && (
        <div className="mt-3 flex flex-col sm:flex-row gap-4 items-start">
          {qr ? (
            <div className="w-40 shrink-0 rounded-lg bg-white p-2 self-center" role="img" aria-label={`QR del Pase de ${socio.clubNombre || "tu club"}`} dangerouslySetInnerHTML={{ __html: qr }} />
          ) : (
            <p className="body-sm text-ink-3 m-0">Tu QR se está generando…</p>
          )}
          {beneficios.length > 0 && (
            <div>
              <p className="pd-eyebrow m-0">Tus beneficios</p>
              <ul className="body-sm mt-1 mb-0 pl-5">
                {beneficios.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {esIntegrante && est.activa && (
        <div className="mt-3">
          <Button size="sm" variant="ghost" onClick={() => sacar({ uid: socio.uid, nombre: socio.nombre })}>
            Salir de este Pase
          </Button>
        </div>
      )}
      {!esIntegrante && est.activa && (Number(socio.integrantes) || 1) > 1 && (
        <div className="mt-4 pt-3 border-t border-line">
          <p className="pd-eyebrow m-0">
            Tu grupo · {familia.length + 1} de {socio.integrantes}
          </p>
          {familia.length > 0 && (
            <ul className="flex flex-wrap gap-2 mt-2 mb-0 p-0 list-none">
              {familia.map((f) => (
                <li key={f.uid} className="pd-badge flex items-center gap-1">
                  {f.nombre}
                  <button type="button" className="text-ink-3" aria-label={`Sacar a ${f.nombre}`} onClick={() => sacar(f)}>
                    <X className="pd-icon" size={14} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {lugares > 0 && (
            <form onSubmit={sumar} className="flex flex-wrap items-end gap-2 mt-3">
              <Field label="Sumar a alguien (email de su cuenta de Padely)" className="flex-1 min-w-[220px]">
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="nombre@mail.com" maxLength={120} />
              </Field>
              <Button type="submit" variant="primary" disabled={!email.includes("@")} cargando={sumando ? "Sumando…" : ""}>
                Sumar
              </Button>
            </form>
          )}
        </div>
      )}
    </Card>
  );
}
