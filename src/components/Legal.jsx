// Piezas compartidas de /terminos y /privacidad.
// <Dato> marca los datos que faltan completar ([RAZÓN SOCIAL], [CUIT], etc.) con un resaltado visible.

export function Dato({ children }) {
  return <span className="px-1 rounded-sm font-semibold bg-warning-soft text-warning">{children}</span>;
}

export function Seccion({ titulo, children }) {
  return (
    <section className="mb-6">
      <h2 className="heading-sm mb-2">{titulo}</h2>
      <div className="flex flex-col gap-2 body-md text-ink-2">{children}</div>
    </section>
  );
}

export function LegalPage({ titulo, actualizado, children }) {
  return (
    <div className="max-w-3xl mx-auto">
      <div className="pd-card sm:p-8">
        <h1 className="heading-lg mb-1">{titulo}</h1>
        <p className="caption text-ink-3 mb-6">Última actualización: {actualizado}</p>
        {children}
      </div>
    </div>
  );
}
