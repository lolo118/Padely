import { Component } from "react";

// Pantalla de error en español: nunca una página en blanco.
export function ErrorFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="themed-card rounded-2xl p-8 border text-center max-w-md w-full">
        <div className="text-5xl mb-4">😵</div>
        <h1 className="text-xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
          Algo salió mal. Recargá la página.
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
          Si el problema sigue, cerrá la app y volvé a abrirla.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="inline-block px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: "var(--accent)" }}
        >
          Recargar
        </button>
      </div>
    </div>
  );
}

// ErrorBoundary simple (sin Sentry): se usa cuando VITE_SENTRY_DSN está vacío
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error("Error no controlado:", error, info?.componentStack);
  }

  render() {
    if (this.state.hasError) return <ErrorFallback />;
    return this.props.children;
  }
}
