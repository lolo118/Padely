// Secciones de una página (pd-tabs): la seleccionada lleva el subrayado lime-text. Cinco como máximo.
// items: [{ value, label, count? }] · value · onChange(value). El count se omite cuando es 0.
export default function Tabs({ items = [], value, onChange, ariaLabel, className = "", ...rest }) {
  return (
    <div className={["pd-tabs", className].filter(Boolean).join(" ")} role="tablist" aria-label={ariaLabel} {...rest}>
      {items.map((item) => (
        <button
          key={String(item.value)}
          type="button"
          role="tab"
          className="pd-tab"
          aria-selected={item.value === value}
          onClick={() => onChange?.(item.value)}
        >
          {item.label}
          {item.count ? <span className="pd-count">{item.count}</span> : null}
        </button>
      ))}
    </div>
  );
}
