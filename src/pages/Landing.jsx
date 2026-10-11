import { Link, Navigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";

const columnas = [
  {
    titulo: "Jugadores",
    icono: "🎾",
    items: [
      "Buscá canchas por horario",
      "Reservá en segundos",
      "Inscribite a torneos",
      "Seguí tu ranking",
    ],
  },
  {
    titulo: "Clubes",
    icono: "🏟️",
    items: [
      "Grilla diaria y semanal",
      "Reservas con o sin aprobación",
      "Turnos fijos",
      "Estadísticas",
    ],
  },
  {
    titulo: "Organizadores",
    icono: "🏆",
    items: [
      "Inscripciones con link",
      "Grupos y bracket automáticos",
      "Carga de resultados",
      "Notificaciones a los jugadores",
    ],
  },
];

const pasos = [
  { n: 1, titulo: "Creá tu cuenta", texto: "Como jugador, club u organizador. Con Google o con tu email." },
  { n: 2, titulo: "Buscá una cancha o un torneo", texto: "Filtrá por ciudad, fecha y horario, o mirá los torneos con inscripción abierta." },
  { n: 3, titulo: "Reservá o inscribite", texto: "Confirmás en segundos y seguís tus reservas, partidos y resultados desde la app." },
];

export default function Landing() {
  const { user, rol, loading } = useAuthStore();
  const whatsapp = (import.meta.env.VITE_WHATSAPP_CONTACTO || "").replace(/\D/g, "");

  // Mientras se resuelve la sesión (o el rol) no se muestra la landing: con sesión se va directo
  // al inicio que corresponde según el rol, igual que /inicio.
  if (loading || (user && !rol)) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ color: "var(--text-muted)" }}>
        Cargando...
      </div>
    );
  }
  if (user) {
    return <Navigate to={rol === "club" ? "/admin" : rol === "organizador" ? "/org" : "/inicio"} replace />;
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "var(--bg-primary)" }}>
      {/* Hero */}
      <section className="bg-gradient-to-b from-slate-900 to-slate-800 text-white">
        <div className="max-w-5xl mx-auto px-5 pt-5 pb-12 sm:pb-16">
          <div className="flex items-center justify-between">
            <img src="/logo.png" alt="Padely" className="h-8" />
            <Link
              to="/login"
              className="px-3 py-1.5 rounded-lg text-sm font-semibold text-slate-200 hover:text-white hover:bg-slate-700/60 transition"
            >
              Ingresar
            </Link>
          </div>

          <div className="mt-10 sm:mt-14 max-w-2xl">
            <h1 className="text-3xl sm:text-5xl font-bold leading-tight">
              Reservá canchas y jugá torneos de pádel
            </h1>
            <p className="mt-4 text-base sm:text-lg text-slate-300">
              La app para jugadores, clubes y organizadores de pádel amateur
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link
                to="/register"
                className="px-6 py-3 rounded-xl text-sm font-semibold text-white text-center transition hover:opacity-90"
                style={{ backgroundColor: "#10b981" }}
              >
                Soy jugador
              </Link>
              <Link
                to="/register?tipo=club"
                className="px-6 py-3 rounded-xl text-sm font-semibold text-center border border-slate-500 text-slate-100 hover:bg-slate-700/60 transition"
              >
                Tengo un club u organizo torneos
              </Link>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm">
              <Link to="/torneos" className="text-emerald-300 hover:text-emerald-200 font-semibold">
                Ver torneos →
              </Link>
              <Link to="/clubes" className="text-emerald-300 hover:text-emerald-200 font-semibold">
                Ver clubes y canchas →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Para quién */}
      <section className="max-w-5xl mx-auto px-5 py-10 sm:py-14 w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {columnas.map((col) => (
            <div key={col.titulo} className="themed-card rounded-2xl border p-5">
              <div className="text-3xl mb-2">{col.icono}</div>
              <h2 className="text-lg font-bold mb-3" style={{ color: "var(--text-primary)" }}>
                {col.titulo}
              </h2>
              <ul className="flex flex-col gap-2">
                {col.items.map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm" style={{ color: "var(--text-secondary)" }}>
                    <span className="mt-0.5 font-bold" style={{ color: "var(--accent)" }}>✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Cómo funciona */}
      <section className="max-w-5xl mx-auto px-5 pb-12 sm:pb-16 w-full">
        <h2 className="text-xl font-bold mb-5" style={{ color: "var(--text-primary)" }}>
          Cómo funciona
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {pasos.map((paso) => (
            <div key={paso.n} className="themed-card rounded-2xl border p-5 flex gap-4">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0"
                style={{ backgroundColor: "var(--accent)" }}
              >
                {paso.n}
              </div>
              <div>
                <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>
                  {paso.titulo}
                </h3>
                <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                  {paso.texto}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t" style={{ borderColor: "var(--border-card)", backgroundColor: "var(--bg-card)" }}>
        <div className="max-w-5xl mx-auto px-5 py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm" style={{ color: "var(--text-muted)" }}>
            <Link to="/terminos" className="hover:underline">
              Términos y condiciones
            </Link>
            <Link to="/privacidad" className="hover:underline">
              Política de privacidad
            </Link>
            {whatsapp && (
              <a
                href={`https://wa.me/${whatsapp}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition hover:opacity-90"
                style={{ backgroundColor: "#25d366" }}
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor" aria-hidden="true">
                  <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 004.79 1.22c5.46 0 9.91-4.45 9.91-9.91C21.95 6.45 17.5 2 12.04 2zm0 18.15c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 01-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 4.54 0 8.24 3.7 8.24 8.24 0 4.55-3.7 8.24-8.24 8.24zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.12-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.22.25-.86.84-.86 2.05 0 1.21.88 2.38 1 2.55.12.16 1.74 2.65 4.21 3.72.59.25 1.05.41 1.41.52.59.19 1.13.16 1.56.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28z" />
                </svg>
                Contacto por WhatsApp
              </a>
            )}
          </div>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            © Padely 2026
          </p>
        </div>
      </footer>
    </div>
  );
}
