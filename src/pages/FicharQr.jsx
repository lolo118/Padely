import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { Alert, Button, Card } from "../components/ui";
import { ficharConQr, mensajeError } from "../services/fichajesService";
import { formatMinutos } from "../utils/fichajes";

// /fichar/:clubId/:token — el QR que muestra la PC de la caja (cambia cada 30 s). Quien lo escanea con su cuenta de
// Padely (vinculada a una persona del fichaje) marca la entrada o la salida con la hora del servidor. Sin sesión,
// primero inicia sesión y vuelve a escanear (el código vence en un minuto).

export default function FicharQr() {
  const { clubId, token } = useParams();
  const user = useAuthStore((s) => s.user);
  const loading = useAuthStore((s) => s.loading);
  const conCuenta = !!user && !user.isAnonymous;
  const [estado, setEstado] = useState({ fase: "listo", resultado: null, error: "" });
  const enviado = useRef(false);

  // Una sola llamada por código (el doble montaje de desarrollo no ficha dos veces)
  useEffect(() => {
    if (loading || !conCuenta || enviado.current) return;
    enviado.current = true;
    // Sin cancelar al desmontar: con el doble montaje de desarrollo, la única llamada es la del primer montaje
    ficharConQr({ clubId, token })
      .then((r) => setEstado({ fase: "hecho", resultado: r, error: "" }))
      .catch((err) => setEstado({ fase: "error", resultado: null, error: mensajeError(err, "No se pudo fichar. Revisá la conexión y escaneá de nuevo.") }));
  }, [loading, conCuenta, clubId, token]);

  const next = encodeURIComponent(`/fichar/${clubId}/${token}`);
  const r = estado.resultado;

  return (
    <div className="max-w-[440px] mx-auto py-8 px-4">
      <Card className="text-center flex flex-col gap-3 items-center">
        <Card.Eyebrow>Fichaje</Card.Eyebrow>
        {loading ? (
          <p className="body-md text-ink-2 m-0">Cargando…</p>
        ) : !conCuenta ? (
          <>
            <p className="heading-sm m-0">Iniciá sesión para fichar</p>
            <p className="body-sm text-ink-2 m-0">Entrá con la cuenta de Padely con la que estás en el equipo del club y después volvé a escanear el QR de la caja.</p>
            <Button as="link" to={`/login?next=${next}`} variant="primary">
              Iniciar sesión
            </Button>
          </>
        ) : estado.fase === "hecho" && r ? (
          <>
            <p className="heading-md m-0">Hola {r.nombre}</p>
            <p className={["heading-sm m-0", r.tipo === "entrada" ? "text-success" : "text-ink"].join(" ")}>
              {r.tipo === "entrada" ? "Entrada" : "Salida"} {r.hora}
              {r.tipo === "salida" && Number.isFinite(r.minutos) ? ` · ${formatMinutos(r.minutos)}` : ""}
            </p>
            {r.club && <p className="body-sm text-ink-2 m-0">{r.club}</p>}
            {r.cerroOlvido && <Alert tone="warning">Tu turno anterior quedó sin salida: avisale al encargado.</Alert>}
          </>
        ) : estado.fase === "error" ? (
          <Alert tone="danger">{estado.error}</Alert>
        ) : (
          <p className="body-md text-ink-2 m-0">Fichando…</p>
        )}
      </Card>
    </div>
  );
}
