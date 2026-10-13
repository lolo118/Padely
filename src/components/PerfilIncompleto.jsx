import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import Button from "./ui/Button";

export default function PerfilIncompleto({ tipo, ruta }) {
  const navigate = useNavigate();

  const mensajes = {
    jugador: {
      titulo: "Completá tu perfil para continuar",
      desc: "Necesitamos tu teléfono, categoría, género y fecha de nacimiento para acceder a esta función.",
      boton: "Completar perfil",
    },
    club: {
      titulo: "Completá los datos del club",
      desc: "Necesitamos teléfono, dirección y ciudad del club para habilitar esta función.",
      boton: "Ir a configuración",
    },
    organizador: {
      titulo: "Completá los datos de tu entidad",
      desc: "Necesitamos teléfono, descripción y ciudad de tu entidad para crear torneos.",
      boton: "Ir a mi entidad",
    },
  };

  const msg = mensajes[tipo] || mensajes.jugador;

  return (
    <div className="pd-card text-center max-w-md mx-auto mt-8">
      <Lock className="pd-icon-lg mx-auto mb-3 text-ink-3" size={24} aria-hidden="true" />
      <h2 className="heading-md mb-2">{msg.titulo}</h2>
      <p className="body-sm text-ink-2 mb-5">{msg.desc}</p>
      <Button variant="primary" onClick={() => navigate(ruta)}>
        {msg.boton}
      </Button>
    </div>
  );
}
