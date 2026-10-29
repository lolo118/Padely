import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Crown } from "lucide-react";
import { suscribirPase } from "../services/membresiasService";
import { ETIQUETA_NIVEL, NIVELES, TONO_NIVEL, PESOS_POR_PUNTO, estadoSocio, nombrePase, textoCada, textosBeneficios } from "../utils/membresias";
import { formatPrecio } from "../utils/format";
import { formatFechaLarga } from "../utils/formatDate";
import Dialogo from "./Dialogo";
import { toast } from "./Toast";
import { Alert, Badge, Button, Card, Field, Input } from "./ui";

// Pestaña "Pase" de la página del club (P3-16): el Pase Club con su precio, los niveles Bronce / Plata / Oro (puntos
// y beneficios de cada uno) y la suscripción con Mercado Pago (débito automático: se autoriza una vez).
export default function SociosClub({ club, pase, miSocio, user }) {
  const navigate = useNavigate();
  const [dialogo, setDialogo] = useState(false);
  const [email, setEmail] = useState(user?.email || "");
  const [enviando, setEnviando] = useState(false);
  const est = estadoSocio(miSocio);
  const conMp = club.mercadoPago?.conectado === true;
  const umbrales = pase.umbrales || {};
  const minimo = { bronce: 0, plata: umbrales.plata, oro: umbrales.oro };

  const abrir = () => {
    if (!user || user.isAnonymous) {
      navigate(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setDialogo(true);
  };
  const suscribir = async (e) => {
    e?.preventDefault?.();
    setEnviando(true);
    try {
      await suscribirPase({ clubId: club.id, email: email.trim() });
    } catch (err) {
      console.error("No se pudo abrir la suscripción:", err);
      toast.error(err?.message || "No pudimos abrir Mercado Pago. Probá de nuevo.");
      setEnviando(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 mb-6">
      <Card>
        <div className="flex items-center gap-2">
          <Crown className="pd-icon text-ink-3" size={22} aria-hidden="true" />
          <Card.Title as="h2" className="m-0">
            {nombrePase(club)}
          </Card.Title>
        </div>
        <p className="numeral-lg pd-tnum mt-2 mb-0">
          {formatPrecio(pase.precio)} <span className="body-md text-ink-3">{textoCada(pase.meses)}</span>
        </p>
        <p className="body-sm text-ink-2 mt-1 mb-0">
          Débito automático con Mercado Pago. Sumás 1 punto cada {formatPrecio(PESOS_POR_PUNTO)} que gastás en el club (canchas, bar y torneos del club) y subís de nivel solo. Te das de baja cuando quieras.
        </p>
        {est.activa ? (
          <Alert tone="success" className="mt-3">
            <strong>Tenés el Pase · {ETIQUETA_NIVEL[miSocio.nivel || "bronce"]}</strong> con {miSocio.puntos || 0} puntos. Se renueva el {formatFechaLarga(est.vence)}.{" "}
            <Link to="/membresias" className="underline font-semibold">
              Ver mi Pase
            </Link>
          </Alert>
        ) : miSocio && est.estado === "pendiente" ? (
          <Alert tone="warning" className="mt-3">
            Falta que autorices el débito en Mercado Pago.{" "}
            <button type="button" className="underline font-semibold" onClick={abrir}>
              Autorizar ahora
            </button>
          </Alert>
        ) : conMp ? (
          <div className="mt-3">
            <Button variant="primary" onClick={abrir}>
              Quiero el Pase
            </Button>
          </div>
        ) : (
          <p className="body-sm text-ink-3 mt-3 mb-0">El club todavía está terminando de habilitar el cobro del Pase.</p>
        )}
      </Card>
      <div className="grid gap-3 md:grid-cols-3">
        {NIVELES.map((n) => {
          const textos = textosBeneficios(pase.beneficios?.[n]);
          const esMio = est.activa && (miSocio?.nivel || "bronce") === n;
          return (
            <Card key={n}>
              <Card.Row>
                <Badge tone={TONO_NIVEL[n]}>{ETIQUETA_NIVEL[n]}</Badge>
                {esMio && <Badge tone="success">Tu nivel</Badge>}
              </Card.Row>
              <Card.Meta className="mt-2!">{n === "bronce" ? "Desde que te sumás" : `Desde ${minimo[n]} puntos`}</Card.Meta>
              {textos.length ? (
                <ul className="body-sm mt-2 mb-0 pl-5">
                  {textos.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              ) : (
                <p className="body-sm text-ink-3 mt-2 mb-0">—</p>
              )}
            </Card>
          );
        })}
      </div>
      {dialogo && (
        <Dialogo
          titulo={`Suscribirte al ${nombrePase(club)}`}
          descripcion={`${formatPrecio(pase.precio)} ${textoCada(pase.meses)} con débito automático. Mercado Pago te pide autorizarlo una vez; pagás con cualquier medio que tengas ahí.`}
          onCerrar={() => setDialogo(false)}
          onSubmit={suscribir}
          acciones={
            <>
              <Button onClick={() => setDialogo(false)}>Cancelar</Button>
              <Button type="submit" variant="primary" disabled={!email.includes("@")} cargando={enviando ? "Abriendo Mercado Pago…" : ""}>
                Ir a Mercado Pago
              </Button>
            </>
          }
        >
          <div className="mt-4">
            <Field label="Email de tu cuenta de Mercado Pago" help="Tiene que ser el mismo con el que entrás a Mercado Pago.">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} data-autofocus maxLength={120} />
            </Field>
          </div>
        </Dialogo>
      )}
    </div>
  );
}
