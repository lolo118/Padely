// Filtro de una sola elección (pd-pills): la selección invierte la tinta. Nada lime: las pastillas navegan.
// items: [{ value, label, count? }] · value: la seleccionada · onChange(value)
// multi: varias encendidas a la vez (aria-pressed) en vez de una sola (role="tablist" + aria-selected)
export default function Pills({ items = [], value, onChange, multi = false, ariaLabel, className = "", ...rest }) {
  const seleccionado = (item) => (multi ? (Array.isArray(value) ? value.includes(item.value) : false) : item.value === value);
  return (
    <div
      className={["pd-pills", className].filter(Boolean).join(" ")}
      role={multi ? "group" : "tablist"}
      aria-label={ariaLabel}
      {...rest}
    >
      {items.map((item) => {
        const activo = seleccionado(item);
        const aria = multi ? { "aria-pressed": activo } : { role: "tab", "aria-selected": activo };
        return (
          <button key={String(item.value)} type="button" className="pd-pill" onClick={() => onChange?.(item.value)} {...aria}>
            {item.label}
            {item.count !== undefined && item.count !== null && <span className="pd-count">{item.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
