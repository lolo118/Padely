import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { pedirMembresia, retirarPedido } from "../services/membresiasService";
import { ESTADOS_SOCIO, estadoSocio, etiquetaPeriodo, textosBeneficios } from "../utils/membresias";
import { formatPrecio } from "../utils/format";
import { formatFechaLarga } from "../utils/formatDate";
import { confirmar } from "./ConfirmDialog";
import { toast } from "./Toast";
import { Alert, Badge, Button, Card } from "./ui";

// Pestaña "Socios" de la página del club (P3-16): los planes visibles con sus beneficios, el estado del jugador y el
// pedido ("Quiero ser socio"). El club aprueba y cobra desde Admin → Socios.
export default function SociosClub({ club, planes, miSocio, user, perfil, onCambio }) {
  const navigate = useNavigate();
  const [enviando, setEnviando] = useState("");
  const est = estadoSocio(miSocio);
  const puedePedir = !miSocio || ["cancelada", "rechazada", "vencida"].includes(est.estado);

  const pedir = async (plan) => {
    if (!user || user.isAnonymous) {
      navigate(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    const ok = await confirmar({ titulo: `¿Querés ser socio (${plan.nombre})?`, mensaje: `${club.nombre} recibe tu pedido, te confirma y te cobra ${formatPrecio(plan.precio)} (${etiquetaPeriodo(plan.periodo).toLowerCase()}) en el club.`, confirmText: "Enviar pedido" });
    if (!ok) return;
    setEnviando(plan.id);
    try {
      await pedirMembresia(club.id, plan, { uid: user.uid, nombre: perfil?.nombre || user.displayName || "Jugador" }, miSocio);
      toast.success("Listo: le avisamos al club. Te confirmamos cuando estés activo.");
      onCambio?.();
    } catch (err) {
      console.error("No se pudo pedir la membresía:", err);
      toast.error("No pudimos enviar el pedido. Probá de nuevo.");
    } finally {
      setEnviando("");
    }
  };
  const retirar = async () => {
    const ok = await confirmar({ titulo: "¿Retirar tu pedido?", mensaje: "Podés volver a pedirlo cuando quieras.", confirmText: "Retirar", danger: true });
    if (!ok) return;
    try {
      await retirarPedido(club.id, user.uid);
      toast.success("Pedido retirado");
      onCambio?.();
    } catch (err) {
      console.error(err);
      toast.error("No pudimos guardar el cambio.");
    }
  };

  return (
    <div className="flex flex-col gap-4 mb-6">
      {miSocio && est.estado !== "cancelada" && (
        <Alert tone={est.activa ? "success" : est.estado === "pendiente" ? "warning" : "neutral"}>
          {est.activa ? (
            <>
              <strong>Sos socio · {miSocio.planNombre}.</strong> Vence el {formatFechaLarga(est.vence)}. Tu carnet está en{" "}
              <Link to="/membresias" className="underline font-semibold">
                Mis membresías
              </Link>
              .
            </>
          ) : est.estado === "pendiente" ? (
            <>
              <strong>Pediste {miSocio.planNombre}.</strong> El club te confirma y te cobra la cuota.{" "}
              <button type="button" className="underline font-semibold" onClick={retirar}>
                Retirar pedido
              </button>
            </>
          ) : (
            <>
              <strong>Tu membresía está {ESTADOS_SOCIO[est.estado]?.toLowerCase() || est.estado}.</strong> Podés pedirla de nuevo.
            </>
          )}
        </Alert>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {planes.map((p) => {
          const esMio = miSocio?.planId === p.id && (est.activa || est.estado === "pendiente");
          return (
            <Card key={p.id}>
              <Card.Row>
                <Card.Title as="h3" className="m-0">
                  {p.nombre}
                </Card.Title>
                {esMio && <Badge tone={est.activa ? "success" : "warning"}>{est.activa ? "Tu plan" : "Pedido"}</Badge>}
              </Card.Row>
              <p className="numeral-md pd-tnum mt-1 mb-0">
                {formatPrecio(p.precio)} <span className="body-sm text-ink-3">/ {etiquetaPeriodo(p.periodo).toLowerCase()}</span>
              </p>
              {p.descripcion && <p className="body-sm text-ink-2 mt-1 mb-0">{p.descripcion}</p>}
              <ul className="body-sm mt-2 mb-0 pl-5">
                {textosBeneficios(p.beneficios).map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              {puedePedir && (
                <div className="mt-3">
                  <Button variant="primary" size="sm" onClick={() => pedir(p)} cargando={enviando === p.id ? "Enviando…" : ""}>
                    Quiero ser socio
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
