// Piezas compartidas de /terminos y /privacidad.
// <Dato> marca los datos que faltan completar ([RAZÓN SOCIAL], [CUIT], etc.) con un resaltado visible.

export function Dato({ children }) {
  return (
    <span
      className="px-1 rounded font-semibold"
      style={{ backgroundColor: "#fef3c7", color: "#92400e" }}
    >
      {children}
    </span>
  );
}

export function Seccion({ titulo, children }) {
  return (
    <section className="mb-6">
      <h2 className="text-base font-bold mb-2" style={{ color: "var(--text-primary)" }}>
        {titulo}
      </h2>
      <div className="flex flex-col gap-2 text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
        {children}
      </div>
    </section>
  );
}

export function LegalPage({ titulo, actualizado, children }) {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="themed-card rounded-2xl border p-5 sm:p-8">
        <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
          {titulo}
        </h1>
        <p className="text-xs mb-6" style={{ color: "var(--text-muted)" }}>
          Última actualización: {actualizado}
        </p>
        {children}
      </div>
    </div>
  );
}
