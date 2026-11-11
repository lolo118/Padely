import { CalendarPlus, Trophy, UserRound } from "lucide-react";
import { Button, Card } from "../ui";

// Inicio de un jugador recién llegado (sin reservas, sin Pase, sin torneos): una sola tarjeta con tres caminos claros
// en vez de una pila de tarjetas vacías.
//   perfilIncompleto: el tercer camino es completar el perfil (si no, ver los clubes)
export default function Bienvenida({ perfilIncompleto = false }) {
  return (
    <Card className="flex flex-col gap-4">
      <div>
        <p className="pd-eyebrow">Bienvenido a Padely</p>
        <h2 className="heading-md mt-1 mb-0">Arrancá por acá</h2>
        <p className="body-sm text-ink-2 mt-1 mb-0">Reservá en los clubes de tu zona, anotate en torneos y seguí tus puntos.</p>
      </div>
      <div className="flex flex-col gap-2">
        <Button as="link" to="/clubes" variant="primary" block icon={<CalendarPlus className="pd-icon" size={20} aria-hidden="true" />}>
          Reservar cancha
        </Button>
        <Button as="link" to="/torneos" block icon={<Trophy className="pd-icon" size={20} aria-hidden="true" />}>
          Ver torneos
        </Button>
        {perfilIncompleto && (
          <Button as="link" to="/perfil" variant="ghost" block icon={<UserRound className="pd-icon" size={20} aria-hidden="true" />}>
            Completar mi perfil
          </Button>
        )}
      </div>
    </Card>
  );
}
