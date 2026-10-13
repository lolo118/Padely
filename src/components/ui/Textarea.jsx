// Área de texto del design system (textarea.pd-input).
export default function Textarea({ className = "", rows = 3, ...rest }) {
  return <textarea className={["pd-input", className].filter(Boolean).join(" ")} rows={rows} {...rest} />;
}
