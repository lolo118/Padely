// Campo de texto del design system (pd-input). Pasa todo lo demás al <input>.
export default function Input({ className = "", ...rest }) {
  return <input className={["pd-input", className].filter(Boolean).join(" ")} {...rest} />;
}
