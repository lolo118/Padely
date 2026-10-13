import { Component } from "react";
import { AlertTriangle } from "lucide-react";
import Button from "./ui/Button";

// Pantalla de error en español: nunca una página en blanco.
export function ErrorFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-surface">
      <div className="pd-card text-center max-w-md w-full">
        <AlertTriangle className="pd-icon-lg mx-auto mb-4 text-danger" size={24} aria-hidden="true" />
        <h1 className="heading-md mb-2">Algo salió mal. Recargá la página.</h1>
        <p className="body-sm text-ink-2 mb-6">Si el problema sigue, cerrá la app y volvé a abrirla.</p>
        <Button variant="primary" onClick={() => window.location.reload()}>
          Recargar
        </Button>
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
