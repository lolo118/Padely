import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CircleCheck, CircleX } from "lucide-react";
import { getVerificacionSocio } from "../services/membresiasService";
import { ESTADOS_SOCIO } from "../utils/membresias";
import { formatFechaLarga } from "../utils/formatDate";
import useTituloPagina from "../hooks/useTituloPagina";
import { Card } from "../components/ui";

// /s/:token (P3-16): lo que ve quien escanea el QR del carnet en la puerta del club (estacionamiento, exhibiciones,
// bar). Público y mínimo: nombre corto, número, plan, si está al día y los beneficios. Sin teléfono ni email.
export default function VerificarSocio() {
  useTituloPagina("Verificar socio");
  const { token } = useParams();
  const [estado, setEstado] = useState({ datos: null, cargado: false });
  const [ahora] = useState(() => Date.now());

  useEffect(() => {
    let vivo = true;
    getVerificacionSocio(token)
      .then((datos) => vivo && setEstado({ datos, cargado: true }))
      .catch(() => vivo && setEstado({ datos: null, cargado: true }));
    return () => {
      vivo = false;
    };
  }, [token]);

  const { datos, cargado } = estado;
  if (!cargado) return <div className="max-w-md mx-auto pd-skeleton h-60 rounded-lg mt-6" aria-busy="true" aria-label="Cargando" />;
  if (!datos) {
    return (
      <div className="max-w-md mx-auto mt-6">
        <Card>
          <Card.Title as="h1">Carnet no encontrado</Card.Title>
          <Card.Meta className="mt-1!">El QR no corresponde a un socio de Padely, o el club lo dio de baja.</Card.Meta>
        </Card>
      </div>
    );
  }
  const vigente = datos.estado === "activa" && (!datos.vence || datos.vence > ahora);
  const Icono = vigente ? CircleCheck : CircleX;
  return (
    <div className="max-w-md mx-auto mt-6">
      <Card>
        <p className="pd-eyebrow m-0">{datos.clubNombre || "Club"}</p>
        <div className={`flex items-center gap-3 mt-2 ${vigente ? "text-success" : "text-danger"}`}>
          <Icono size={40} aria-hidden="true" />
          <span className="heading-lg">{vigente ? "Socio al día" : datos.estado === "activa" ? "Membresía vencida" : ESTADOS_SOCIO[datos.estado] || "No vigente"}</span>
        </div>
        <h1 className="heading-xl mt-3 mb-0">{datos.nombre}</h1>
        <Card.Meta className="mt-1!">
          {[datos.numero ? `Socio Nº ${datos.numero}` : null, datos.planNombre, datos.vence ? `${vigente ? "Vence" : "Venció"} el ${formatFechaLarga(datos.vence)}` : null].filter(Boolean).join(" · ")}
        </Card.Meta>
        {vigente && datos.beneficios?.length > 0 && (
          <>
            <p className="pd-eyebrow mt-4 mb-0">Beneficios</p>
            <ul className="body-md mt-1 mb-0 pl-5">
              {datos.beneficios.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
