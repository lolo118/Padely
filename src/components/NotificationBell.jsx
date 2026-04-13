import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import {
  getNotificaciones,
  getNoLeidas,
  marcarLeida,
  marcarTodasLeidas,
} from "../services/notificationService";

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
        <button onClick={handleOpen} className="relative p-2 rounded-lg transition hover:opacity-80">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-slate-300">
            <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 01-3.46 0" />
          </svg>
          {noLeidas > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center min-w-[18px] h-[18px] px-1">
              {noLeidas > 9 ? "9+" : noLeidas}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 top-12 w-80 max-h-96 overflow-y-auto themed-card rounded-xl border shadow-xl z-30">
            <div className="sticky top-0 z-10 flex items-center justify-between px-4 py-3 border-b"
              style={{ borderColor: "var(--border-card)", backgroundColor: "var(--bg-card)" }}>
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Notificaciones</span>
              {noLeidas > 0 && (
                <button onClick={handleMarcarTodas} className="text-xs font-semibold transition" style={{ color: "var(--accent)" }}>
                  Marcar todas como leídas
                </button>
              )}
            </div>

            {cargando ? (
              <div className="text-center py-8 text-sm" style={{ color: "var(--text-muted)" }}>Cargando...</div>
            ) : notificaciones.length === 0 ? (
              <div className="text-center py-8">
                <div className="text-3xl mb-2">🔔</div>
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>No tenés notificaciones</p>
              </div>
            ) : (
              <div className="flex flex-col">
                {notificaciones.map((n) => (
                  <button key={n.id} onClick={() => handleClick(n)}
                    className="w-full text-left px-4 py-3 transition border-b"
                    style={{ borderColor: "var(--border-card)", backgroundColor: n.leida ? "transparent" : "rgba(16,185,129,0.05)" }}>
                    <div className="flex gap-3">
                      <span className="text-lg mt-0.5">{n.icono || "🔔"}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm ${n.leida ? "" : "font-semibold"}`}
                            style={{ color: n.leida ? "var(--text-secondary)" : "var(--text-primary)" }}>
                            {n.titulo}
                          </p>
                          <span className="text-[10px] whitespace-nowrap flex-shrink-0" style={{ color: "var(--text-muted)" }}>
                            {formatTiempo(n.createdAt)}
                          </span>
                        </div>
                        <p className="text-xs mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>{n.mensaje}</p>
                      </div>
                      {!n.leida && (
                        <div className="w-2 h-2 rounded-full flex-shrink-0 mt-2" style={{ backgroundColor: "var(--accent)" }} />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
