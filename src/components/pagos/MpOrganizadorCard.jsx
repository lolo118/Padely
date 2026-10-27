import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { cargarFlags } from "../../services/flagsService";
import { mpConectarUrl, mpDesconectar } from "../../services/mercadoPagoService";
import { confirmar } from "../ConfirmDialog";
import { toast } from "../Toast";
import { Badge, Button, Card } from "../ui";

// Mi entidad (P3-14 C): conectar Mercado Pago para cobrar inscripciones online. Oculto hasta que la plataforma prenda
// configuracionPadely/flags.inscripcionesOnline (después del deploy de las Functions de P3-14).
export default function MpOrganizadorCard({ entidad, onCambio }) {
  const [activo, setActivo] = useState(false);
  const [cuenta, setCuenta] = useState(null);
  const [ocupado, setOcupado] = useState(false);
  const [params, setParams] = useSearchParams();
  const conectado = entidad?.mercadoPago?.conectado === true;

  useEffect(() => {
    let vivo = true;
    cargarFlags().then((f) => vivo && setActivo(f?.inscripcionesOnline === true));
    return () => {
      vivo = false;
    };
  }, []);
  useEffect(() => {
    let vivo = true;
    if (activo && conectado && entidad?.id)
      getDoc(doc(db, "organizers", entidad.id, "privado", "mpCuenta"))
        .then((s) => vivo && setCuenta(s.exists() ? s.data() : null))
        .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [activo, conectado, entidad?.id]);
  // Vuelta de la autorización de Mercado Pago (?mp=ok|error)
  useEffect(() => {
    const mp = params.get("mp");
    if (!mp) return;
    if (mp === "ok") toast.success("Mercado Pago conectado: ya podés cobrar inscripciones online");
    else toast.error("No se pudo conectar Mercado Pago. Probá de nuevo.");
    const p = new URLSearchParams(params);
    p.delete("mp");
    p.delete("motivo");
    setParams(p, { replace: true });
  }, [params, setParams]);

  if (!activo || !entidad?.id) return null;
  const conectar = async () => {
    setOcupado(true);
    try {
      const r = await mpConectarUrl({ organizerId: entidad.id });
      window.location.assign(r.url);
    } catch (err) {
      console.error("No se pudo conectar Mercado Pago:", err);
      toast.error("No pudimos abrir Mercado Pago. Probá de nuevo.");
      setOcupado(false);
    }
  };
  const desconectar = async () => {
    const ok = await confirmar({ titulo: "¿Desconectar Mercado Pago?", mensaje: "Los torneos dejan de cobrar la inscripción online. Los pagos ya hechos no cambian.", confirmText: "Desconectar", danger: true });
    if (!ok) return;
    setOcupado(true);
    try {
      await mpDesconectar({ organizerId: entidad.id });
      toast.success("Mercado Pago desconectado");
      onCambio?.();
    } catch (err) {
      console.error("No se pudo desconectar Mercado Pago:", err);
      toast.error("No pudimos desconectar. Probá de nuevo.");
    } finally {
      setOcupado(false);
    }
  };
  return (
    <Card>
      <Card.Row>
        <Card.Title as="h2">Inscripciones online</Card.Title>
        {conectado ? <Badge tone="success" dot>Mercado Pago conectado</Badge> : <Badge>Sin conectar</Badge>}
      </Card.Row>
      <Card.Meta className="mt-1!">
        {conectado
          ? `Las parejas pagan la inscripción desde la app y la plata va a tu cuenta${cuenta?.nickname ? ` (${cuenta.nickname})` : ""}. Activalo en cada torneo con "Cobrar la inscripción online".`
          : "Conectá tu cuenta de Mercado Pago y las parejas pagan la inscripción desde la app; la plata va directo a tu cuenta."}
      </Card.Meta>
      <div className="mt-4">
        {conectado ? (
          <Button variant="ghost" onClick={desconectar} cargando={ocupado ? "Desconectando…" : ""}>
            Desconectar
          </Button>
        ) : (
          <Button variant="primary" onClick={conectar} cargando={ocupado ? "Abriendo Mercado Pago…" : ""}>
            Conectar Mercado Pago
          </Button>
        )}
      </div>
    </Card>
  );
}
