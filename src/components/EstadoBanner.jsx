import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import { getEstadoPlataforma } from "../services/estadoService";
import { Alert, Button } from "./ui";

// Aviso de estado de la plataforma (P3-12) en todos los layouts: lo activa el super-admin desde Resumen. Se puede
// cerrar; vuelve a aparecer si cambia el mensaje (la marca vive en este navegador).
const CLAVE = "padely-estado-cerrado";

export default function EstadoBanner({ className = "" }) {
  const [estado, setEstado] = useState(null);
  const [cerrado, setCerrado] = useState(() => {
    try {
      return localStorage.getItem(CLAVE) || "";
    } catch {
      return "";
    }
  });
  useEffect(() => {
    let vivo = true;
    getEstadoPlataforma().then((e) => vivo && setEstado(e));
    return () => {
      vivo = false;
    };
  }, []);
  if (!estado?.activo || !estado.mensaje || cerrado === estado.mensaje) return null;
  const cerrar = () => {
    try {
      localStorage.setItem(CLAVE, estado.mensaje);
    } catch {
      // sin almacenamiento: se cierra solo por ahora
    }
    setCerrado(estado.mensaje);
  };
  return (
    <Alert tone="warning" className={className}>
      <div className="flex items-start justify-between gap-2">
        <span>
          {estado.mensaje}{" "}
          <Link to="/estado" className="underline font-semibold">
            Ver estado
          </Link>
        </span>
        <Button variant="ghost" size="sm" iconOnly aria-label="Cerrar aviso" onClick={cerrar} icon={<X className="pd-icon" size={16} aria-hidden="true" />} />
      </div>
    </Alert>
  );
}
