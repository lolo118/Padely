import { Repeat } from "lucide-react";

// Una cancha a una hora dentro de la grilla pd-grid (cancha × hora).
// estado: "libre" | "elegido" | "reservada" | "pendiente" | "fijo" | "bloqueada" | "pasado"
// linea1: el texto principal (por defecto la palabra del estado) · linea2: segunda línea (precio, nombre)
// libre y elegido son botones (onClick); el resto, celdas estáticas. Cada estado lleva su palabra.
const CLASE = {
  libre: "pd-slot-free",
  elegido: "pd-slot-free",
  reservada: "pd-slot-booked",
  pendiente: "pd-slot-pending",
  fijo: "pd-slot-fixed",
  bloqueada: "pd-slot-blocked",
  pasado: "pd-slot-past",
};

const PALABRA = {
  libre: "Libre",
  elegido: "Elegido",
  reservada: "Reservada",
  pendiente: "Pendiente",
  fijo: "Turno fijo",
  bloqueada: "Bloqueada",
  pasado: "Pasado",
};

export default function SlotCell({ estado = "libre", linea1, linea2, onClick, disabled = false, className = "", ...rest }) {
  const clases = ["pd-slot", CLASE[estado] || "pd-slot-past", className].filter(Boolean).join(" ");
  const texto = linea1 ?? PALABRA[estado] ?? "";
  const contenido = (
    <>
      {estado === "fijo" && <Repeat className="pd-icon" size={20} aria-hidden="true" />}
      {texto}
      {linea2 && <small>{linea2}</small>}
    </>
  );
  if (estado === "libre" || estado === "elegido") {
    return (
      <button
        type="button"
        className={clases}
        aria-selected={estado === "elegido" ? "true" : undefined}
        aria-pressed={estado === "elegido" ? "true" : undefined}
        onClick={onClick}
        disabled={disabled}
        {...rest}
      >
        {contenido}
      </button>
    );
  }
  return (
    <div className={clases} {...rest}>
      {contenido}
    </div>
  );
}
