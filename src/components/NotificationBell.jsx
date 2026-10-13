import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Bell, Calendar, Check, CircleDot, Clock, Trophy, UserPlus, X } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import {
  getNotificaciones,
  getNoLeidas,
  marcarLeida,
  marcarTodasLeidas,
} from "../services/notificationService";
import Button from "./ui/Button";

// Ícono Lucide por tipo de notificación (el emoji guardado en `icono` ya no se muestra)
const ICONOS = {
  reserva_confirmada: Check,
  reserva_rechazada: X,
  reserva_cancelada_jugador: X,
  reserva_expirada: Clock,
  reserva_expirada_club: Clock,
  nueva_reserva: Calendar,
  nueva_inscripcion: UserPlus,
  inscripcion_confirmada: Check,
  inscripcion_rechazada: X,
  reclamo: AlertTriangle,
  nuevo_reclamo: AlertTriangle,
  resultado_cargado: CircleDot,
  partido_listo: CircleDot,
  ascenso: Trophy,
};

export default function NotificationBell() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notificaciones, setNotificaciones] = useState([]);
  const [noLeidas, setNoLeidas] = useState(0);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!user) return;
    const cargar = () => {
      getNoLeidas(user.uid).then(setNoLeidas);
    };
    cargar();
    const interval = setInterval(cargar, 30000);
    return () => clearInterval(interval);
  }, [user]);

  const handleOpen = async () => {
    if (open) { setOpen(false); return; }
    setOpen(true);
    setCargando(true);
    try {
      const data = await getNotificaciones(user.uid);
      setNotificaciones(data);
    } catch (err) { console.error(err); }
    setCargando(false);
  };

  const handleClick = async (notif) => {
    if (!notif.leida) {
      await marcarLeida(user.uid, notif.id);
      setNoLeidas((n) => Math.max(0, n - 1));
      setNotificaciones((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, leida: true } : n))
      );
    }
    setOpen(false);
    if (notif.link) navigate(notif.link);
  };

  const handleMarcarTodas = async () => {
    await marcarTodasLeidas(user.uid);
    setNoLeidas(0);
    setNotificaciones((prev) => prev.map((n) => ({ ...n, leida: true })));
  };

  const formatTiempo = (ts) => {
    if (!ts) return "";
    const date = ts.toDate ? ts.toDate() : new Date(ts);
    const now = new Date();
    const diff = Math.floor((now - date) / 1000);
    if (diff < 60) return "Ahora";
    if (diff < 3600) return `Hace ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `Hace ${Math.floor(diff / 3600)} h`;
    const d = date.getDate();
    const m = date.getMonth() + 1;
    return `${d}/${m}`;
  };

  if (!user) return null;

  return (
    <>
      {open && <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />}

      <div className="relative">
        {/* Sin leer: la pelota en la esquina del ícono, sin número */}
        <Button
          variant="ghost"
          iconOnly
          aria-label={noLeidas > 0 ? `Notificaciones, ${noLeidas} sin leer` : "Notificaciones"}
          aria-expanded={open}
          aria-haspopup="true"
          onClick={handleOpen}
          className="relative"
          icon={
            <>
              <Bell className="pd-icon" size={20} aria-hidden="true" />
              {noLeidas > 0 && <span className="pd-ball absolute top-2 right-2" aria-hidden="true" />}
            </>
          }
        />

        {open && (
          // El panel hereda el tema del contenedor (en la barra del jugador, siempre Noche)
          <div className="absolute right-0 top-12 w-80 max-h-96 overflow-y-auto pd-card p-0! z-30">
            <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b border-line bg-surface-raised">
              <span className="heading-sm">Notificaciones</span>
              {noLeidas > 0 && (
                <Button variant="ghost" size="sm" onClick={handleMarcarTodas}>
                  Marcar todas como leídas
                </Button>
              )}
            </div>

            {cargando ? (
              <div className="text-center py-8 body-sm text-ink-3">Cargando…</div>
            ) : notificaciones.length === 0 ? (
              <div className="text-center py-8">
                <Bell className="pd-icon-lg mx-auto mb-2 text-ink-3" size={24} aria-hidden="true" />
                <p className="body-sm text-ink-3">No tenés notificaciones</p>
              </div>
            ) : (
              <ul className="flex flex-col m-0 p-0 list-none">
                {notificaciones.map((n) => {
                  const Icono = ICONOS[n.tipo] || Bell;
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => handleClick(n)}
                        className={`w-full text-left px-4 py-3 border-b border-line hover:bg-surface-hover ${n.leida ? "" : "bg-lime-soft/40"}`}
                      >
                        <div className="flex gap-3">
                          <Icono className="pd-icon mt-0.5 text-ink-3" size={20} aria-hidden="true" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <p className={`body-sm ${n.leida ? "text-ink-2" : "font-semibold text-ink"}`}>{n.titulo}</p>
                              <span className="caption text-ink-3 whitespace-nowrap shrink-0">{formatTiempo(n.createdAt)}</span>
                            </div>
                            <p className="caption text-ink-3 mt-0.5 truncate">{n.mensaje}</p>
                          </div>
                          {!n.leida && <span className="pd-ball shrink-0 mt-2" style={{ width: 8, height: 8 }} aria-hidden="true" />}
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </>
  );
}
