import { useEffect } from "react";
import { Link, Navigate } from "react-router-dom";
import { Check, CircleDot, LayoutGrid, MessageCircle, Trophy } from "lucide-react";
import { useAuthStore } from "../store/authStore";
import { COMISION_FREE_PCT, DIAS_PRUEBA, ESCALONES_PRO } from "../utils/planes";
import { formatPrecio } from "../utils/format";
import useThemeStore from "../store/themeStore";
import { Button, Card, Wordmark } from "../components/ui";

const columnas = [
  {
    titulo: "Jugadores",
    icono: CircleDot,
    items: [
      "Buscá canchas por horario",
      "Reservá en segundos",
      "Inscribite a torneos",
      "Seguí tu ranking",
    ],
  },
  {
    titulo: "Clubes",
    icono: LayoutGrid,
    items: [
      "Grilla diaria y semanal",
      "Reservas con o sin aprobación",
      "Turnos fijos",
      "Estadísticas",
    ],
  },
  {
    titulo: "Organizadores",
    icono: Trophy,
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
  // La landing abre en Noche; una elección explícita del toggle siempre gana
  const setDefaultTheme = useThemeStore((s) => s.setDefaultTheme);
  const explicit = useThemeStore((s) => s.explicit);
  useEffect(() => {
    setDefaultTheme("dark");
  }, [setDefaultTheme, explicit]);
  const whatsapp = (import.meta.env.VITE_WHATSAPP_CONTACTO || "").replace(/\D/g, "");

  // Mientras se resuelve la sesión (o el rol) no se muestra la landing: con sesión se va directo
  // al inicio que corresponde según el rol, igual que /inicio.
  if (loading || (user && !rol)) {
    return (
      <div className="min-h-screen flex items-center justify-center body-md text-ink-3 bg-surface">
        Cargando…
      </div>
    );
  }
  if (user) {
    return <Navigate to={rol === "club" ? "/admin" : rol === "organizador" ? "/org" : "/inicio"} replace />;
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface text-ink">
      {/* Hero: el bloque night del cover, con su propia barra (wordmark + Ingresar) */}
      <section className="bg-night text-on-night" data-theme="dark">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-14">
            <Wordmark />
            <Button as="link" to="/login" variant="ghost">
              Ingresar
            </Button>
          </div>

          <div className="pt-10 pb-12 sm:pt-14 sm:pb-16 max-w-2xl">
            <h1 className="display-xl">Reservá canchas y jugá torneos de pádel</h1>
            <p className="body-md text-on-night-muted mt-4">
              La app para jugadores, clubes y organizadores de pádel amateur
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Button as="link" to="/clubes" variant="primary">
                Reservar una cancha
              </Button>
              <Button as="link" to="/torneos">
                Ver torneos
              </Button>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 body-sm">
              <Link to="/register" className="font-semibold text-lime-text hover:underline">
                Soy jugador
              </Link>
              <Link to="/register?tipo=club" className="font-semibold text-lime-text hover:underline">
                Tengo un club u organizo torneos
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Para quién */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14 w-full">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {columnas.map((col) => {
            const Icono = col.icono;
            return (
              <Card key={col.titulo}>
                <Icono className="pd-icon-lg text-ink-2 mb-3" size={24} aria-hidden="true" />
                <Card.Title as="h2">{col.titulo}</Card.Title>
                <ul className="mt-3 flex flex-col gap-2">
                  {col.items.map((item) => (
                    <li key={item} className="flex items-start gap-2 body-sm text-ink-2">
                      <Check className="pd-icon text-ink-3" size={20} aria-hidden="true" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Cómo funciona: la banda court-soft del cover */}
      <section className="bg-court-soft">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14 w-full">
          <h2 className="heading-lg mb-5">Cómo funciona</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {pasos.map((paso) => (
              <Card key={paso.n} className="flex gap-4">
                <span className="numeral-lg pd-tnum text-ink-3 shrink-0">{paso.n}</span>
                <div>
                  <h3 className="heading-sm">{paso.titulo}</h3>
                  <p className="body-sm text-ink-2 mt-1">{paso.texto}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Precios para clubes (P3-9) */}
      <section id="precios" className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14 w-full">
        <h2 className="heading-lg mb-2">Precios para clubes</h2>
        <p className="body-sm text-ink-2 mb-5">Para jugadores, Padely es gratis. Los clubes empiezan con {DIAS_PRUEBA} días de prueba con todo incluido, desde su primera reserva.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <p className="pd-eyebrow m-0">Prueba</p>
            <Card.Title as="h3" className="mt-1!">{DIAS_PRUEBA} días gratis</Card.Title>
            <p className="body-sm text-ink-2 mt-2">Todo PRO: canchas, reservas, seña online, bar, caja, cuentas del turno y equipo. Sin tarjeta.</p>
          </Card>
          <Card>
            <p className="pd-eyebrow m-0">FREE</p>
            <Card.Title as="h3" className="mt-1!">$ 0 por mes</Card.Title>
            <p className="body-sm text-ink-2 mt-2">
              Canchas, reservas, turnos fijos, seña online con Mercado Pago, página del club y torneos. Padely retiene {COMISION_FREE_PCT.toLocaleString("es-AR")} % de cada pago online.
            </p>
          </Card>
          <Card>
            <p className="pd-eyebrow m-0">PRO</p>
            <Card.Title as="h3" className="mt-1!">Desde {formatPrecio(ESCALONES_PRO[0].precio)} por mes</Card.Title>
            <ul className="mt-2 flex flex-col gap-1">
              {ESCALONES_PRO.map((e) => (
                <li key={e.id} className="flex items-baseline justify-between gap-3 body-sm">
                  <span className="text-ink-2">{e.hasta ? `${e.desde} a ${e.hasta} canchas` : `${e.desde} o más canchas`}</span>
                  <span className="font-semibold pd-tnum">{formatPrecio(e.precio)}</span>
                </li>
              ))}
            </ul>
            <p className="body-sm text-ink-2 mt-2">Todo FREE más bar, caja, cuentas del turno, pedidos a la barra, reportes y cuentas para tu equipo. Sin comisión en los pagos online. Pagando el año, 2 meses gratis.</p>
          </Card>
        </div>
        <p className="caption text-ink-3 mt-3">Torneos: se cobran por torneo, según el tamaño. Precios finales en pesos argentinos.</p>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-line bg-surface-raised">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 body-sm text-ink-2">
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
                className="pd-btn pd-btn-sm"
              >
                <MessageCircle className="pd-icon" size={20} aria-hidden="true" />
                Contacto por WhatsApp
              </a>
            )}
          </div>
          <p className="caption text-ink-3">© Padely 2026</p>
        </div>
      </footer>
    </div>
  );
}
