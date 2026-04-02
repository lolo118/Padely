import { useNavigate } from "react-router-dom";

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
    <div className="themed-card rounded-2xl border p-8 text-center max-w-md mx-auto mt-8">
      <div className="text-4xl mb-3">🔒</div>
      <h2 className="font-bold text-lg mb-2" style={{ color: "var(--text-primary)" }}>{msg.titulo}</h2>
      <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>{msg.desc}</p>
      <button
        onClick={() => navigate(ruta)}
        className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition hover:opacity-90"
        style={{ backgroundColor: "var(--accent)" }}
      >
        {msg.boton}
      </button>
    </div>
  );
}
