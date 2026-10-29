import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { pedirMembresia, retirarPedido } from "../services/membresiasService";
import { pagarConMercadoPago } from "../services/mercadoPagoService";
import { estadoSocio, etiquetaPeriodo, textoIntegrantes, textosBeneficios } from "../utils/membresias";
import { formatPrecio } from "../utils/format";
import { formatFechaLarga } from "../utils/formatDate";
import { confirmar } from "./ConfirmDialog";
import { toast } from "./Toast";
import { Alert, Badge, Button, Card } from "./ui";

// Pestaña "Socios" de la página del club (P3-16): los planes visibles con sus beneficios y el estado del jugador.
// Con Mercado Pago conectado se paga online y la membresía queda activa al aprobarse el pago (sin aprobación del
// club); si no, o si el jugador prefiere, pide y el club aprueba y cobra en el club (Admin → Socios).
const ESTADO_PASE = { vencida: "vencido", cancelada: "dado de baja", rechazada: "rechazado" };

export default function SociosClub({ club, planes, miSocio, user, perfil, onCambio }) {
  const navigate = useNavigate();
  const [enviando, setEnviando] = useState("");
  const est = estadoSocio(miSocio);
  // El integrante de un Pase familiar no pide ni paga: lo renueva el titular
  const puedePedir = !miSocio || ["cancelada", "rechazada", "vencida"].includes(est.estado);
  const esIntegrante = !!miSocio?.titularId && est.activa;
  const conMp = club.mercadoPago?.conectado === true;
  // Pagar online: alta, cambio de plan o renovación (si sigue vigente, el período se suma desde el vencimiento)
  const pagarOnline = async (plan) => {
    if (!user || user.isAnonymous) {
      navigate(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    setEnviando(`mp-${plan.id}`);
    try {
      await pagarConMercadoPago({ clubId: club.id, tipo: "membresia", planId: plan.id });
    } catch (err) {
      console.error("No se pudo abrir Mercado Pago:", err);
      toast.error(err?.message || "No pudimos abrir Mercado Pago. Probá de nuevo o pedilo y pagás en el club.");
      setEnviando("");
    }
  };

  const pedir = async (plan) => {
    if (!user || user.isAnonymous) {
      navigate(`/login?next=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    const ok = await confirmar({ titulo: `¿Pedir el ${plan.nombre}?`, mensaje: `${club.nombre} recibe tu pedido, te confirma y te cobra ${formatPrecio(plan.precio)} (${etiquetaPeriodo(plan.periodo).toLowerCase()}) en el club.`, confirmText: "Enviar pedido" });
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
              <strong>Tenés el {miSocio.planNombre}{miSocio.titularId ? ` de ${miSocio.titularNombre || "tu grupo"}` : ""}.</strong> Vence el {formatFechaLarga(est.vence)}. Tu QR está en{" "}
              <Link to="/membresias" className="underline font-semibold">
                Mis pases
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
              <strong>Tu Pase está {ESTADO_PASE[est.estado] || est.estado}.</strong> Podés sacarlo de nuevo.
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
                {esMio && <Badge tone={est.activa ? "success" : "warning"}>{est.activa ? "Tu Pase" : "Pedido"}</Badge>}
              </Card.Row>
              <p className="numeral-md pd-tnum mt-1 mb-0">
                {formatPrecio(p.precio)} <span className="body-sm text-ink-3">/ {etiquetaPeriodo(p.periodo).toLowerCase()}</span>
              </p>
              {p.descripcion && <p className="body-sm text-ink-2 mt-1 mb-0">{p.descripcion}</p>}
              {textoIntegrantes(p) && <p className="body-sm font-semibold mt-1 mb-0">{textoIntegrantes(p)}</p>}
              <ul className="body-sm mt-2 mb-0 pl-5">
                {textosBeneficios(p.beneficios).map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
              {esIntegrante ? null : conMp && p.precio > 0 && (puedePedir || (est.activa && miSocio?.planId === p.id)) ? (
                <div className="pd-btn-group mt-3">
                  <Button variant="primary" size="sm" onClick={() => pagarOnline(p)} cargando={enviando === `mp-${p.id}` ? "Abriendo Mercado Pago…" : ""}>
                    {est.activa ? "Renovar con Mercado Pago" : "Pagar con Mercado Pago"}
                  </Button>
                  {puedePedir && (
                    <Button variant="ghost" size="sm" onClick={() => pedir(p)} cargando={enviando === p.id ? "Enviando…" : ""}>
                      Prefiero pagar en el club
                    </Button>
                  )}
                </div>
              ) : (
                puedePedir && (
                  <div className="mt-3">
                    <Button variant="primary" size="sm" onClick={() => pedir(p)} cargando={enviando === p.id ? "Enviando…" : ""}>
                      Pedir este Pase
                    </Button>
                  </div>
                )
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
