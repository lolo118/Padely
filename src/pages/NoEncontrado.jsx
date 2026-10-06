import { Link } from "react-router-dom";

export default function NoEncontrado() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ backgroundColor: "var(--bg-primary)" }}>
      <div className="themed-card rounded-2xl p-8 border text-center max-w-md w-full">
        <div className="text-5xl mb-4">🎾</div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
          Error 404
        </p>
        <h1 className="text-xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
          Esta página no existe
        </h1>
        <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
          El link puede estar mal escrito o la página ya no está disponible.
        </p>
        <Link
          to="/inicio"
          className="inline-block px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: "var(--accent)" }}
        >
          Ir al inicio
        </Link>
      </div>
    </div>
  );
}
