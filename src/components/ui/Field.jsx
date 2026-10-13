import { Children, cloneElement, isValidElement } from "react";

// Campo de formulario (pd-field): label arriba, control, ayuda o error abajo. Marca aria-invalid en el control
// cuando hay error. El wrapper es un <label>, así tocar el label enfoca el control.
export default function Field({ label, help, error, className = "", children, as = "label" }) {
  const Tag = as;
  const control = Children.map(children, (child) =>
    isValidElement(child) && error ? cloneElement(child, { "aria-invalid": "true" }) : child,
  );
  return (
    <Tag className={["pd-field", className].filter(Boolean).join(" ")}>
      {label && <span className="pd-label">{label}</span>}
      {control}
      {error ? (
        <span className="pd-error" role="alert">
          {error}
        </span>
      ) : (
        help && <span className="pd-help">{help}</span>
      )}
    </Tag>
  );
}
