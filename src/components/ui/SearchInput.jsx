import { Search } from "lucide-react";

// Buscador: pd-input-icon con la lupa del sistema dentro del campo.
export default function SearchInput({ className = "", wrapperClassName = "", ...rest }) {
  return (
    <span className={["pd-input-icon", wrapperClassName].filter(Boolean).join(" ")}>
      <Search className="pd-icon" size={20} aria-hidden="true" />
      <input type="search" className={["pd-input", className].filter(Boolean).join(" ")} {...rest} />
    </span>
  );
}
