import { CircleDot } from "lucide-react";
import Button from "../components/ui/Button";

export default function NoEncontrado() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-surface">
      <div className="pd-card text-center max-w-md w-full">
        <CircleDot className="pd-icon-lg mx-auto mb-4 text-ink-3" size={24} aria-hidden="true" />
        <p className="pd-eyebrow mb-1!">Error 404</p>
        <h1 className="heading-md mb-2">Esta página no existe</h1>
        <p className="body-sm text-ink-2 mb-6">El link puede estar mal escrito o la página ya no está disponible.</p>
        <Button as="link" to="/inicio" variant="primary">
          Ir al inicio
        </Button>
      </div>
    </div>
  );
}
