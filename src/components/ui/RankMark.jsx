import { useId } from "react";
import { normalizarNivel } from "../../utils/categorias";

// Marca de rango: la pelota de pádel, más rápida en cada nivel. Dibujos copiados de design-system/assets/Ranks/*.svg
// (sin tocar). Van en lime para leerse en los dos temas; solo Libre es dorada.
// nivel: "8va" | "7ma" | "6ta" | "5ta" | "4ta" | "3era" | "2da" | "1era" | "Libre" (un nivel desconocido no dibuja nada)
// size: 20 (inline en texto) | 24 (default, pd-rank) | 40 (pd-rank-lg, la categoría propia del jugador)
// Siempre acompañada del nombre del nivel en texto: la marca sola no alcanza.

const PELOTA = (
  <>
    <circle cx="15" cy="12" r="5.5" fill="#84cc16" />
    <path d="M11.975 7.875a6.875 6.875 0 0 1 0 8.25M18.025 7.875a6.875 6.875 0 0 0 0 8.25" stroke="#0b1220" strokeWidth="1" opacity=".45" />
  </>
);

const DIBUJOS = {
  "8va": () => <circle cx="15" cy="12" r="5.5" stroke="#84cc16" strokeWidth="2" strokeDasharray="3 2.6" />,
  "7ma": () => PELOTA,
  "6ta": () => (
    <>
      <path d="M4 12H8" stroke="#84cc16" strokeWidth="2" />
      {PELOTA}
    </>
  ),
  "5ta": () => (
    <>
      <path d="M4 9H8" stroke="#84cc16" strokeWidth="2" />
      <path d="M4 15H8" stroke="#84cc16" strokeWidth="2" />
      {PELOTA}
    </>
  ),
  "4ta": () => (
    <>
      <path d="M2 12H8" stroke="#84cc16" strokeWidth="2" />
      <path d="M4 8H8" stroke="#84cc16" strokeWidth="2" />
      <path d="M4 16H8" stroke="#84cc16" strokeWidth="2" />
      {PELOTA}
    </>
  ),
  "3era": () => (
    <>
      <path d="M2 12 9.5 8.6V15.4Z" fill="#84cc16" opacity=".55" />
      <path d="M4 12H8" stroke="#84cc16" strokeWidth="2" />
      {PELOTA}
    </>
  ),
  "2da": () => (
    <>
      <path d="M1.5 12 9.5 8.2V15.8Z" fill="#84cc16" opacity=".55" />
      <circle cx="15" cy="12" r="5.5" fill="#84cc16" />
      <path d="M15.8 8.2 12.9 12.4h2.4l-1.3 3.4 3.3-4.6h-2.4z" fill="#0b1220" />
    </>
  ),
  "1era": () => (
    <>
      <path d="M1.5 12 9.5 8.2V15.8Z" fill="#84cc16" opacity=".55" />
      <circle cx="15" cy="12" r="5.5" fill="#84cc16" />
      <path d="M15 7.6l1.2 2.7 2.9.3-2.2 2 .7 2.9-2.6-1.5-2.6 1.5.7-2.9-2.2-2 2.9-.3z" fill="#0b1220" />
    </>
  ),
  Libre: (gradId) => (
    <>
      <defs>
        <radialGradient id={gradId} cx="35%" cy="30%" r="75%">
          <stop offset="0" stopColor="#f6dd8d" />
          <stop offset=".55" stopColor="#d9a927" />
          <stop offset="1" stopColor="#8b6514" />
        </radialGradient>
      </defs>
      <circle cx="12" cy="12" r="10" stroke="#d9a927" strokeWidth="1.2" opacity=".7" />
      <circle cx="12" cy="12" r="6" fill={`url(#${gradId})`} />
      <path d="M8.9 7.9a5.6 5.6 0 0 1 0 8.2M15.1 7.9a5.6 5.6 0 0 0 0 8.2" stroke="#8b6514" strokeWidth="1" opacity=".7" />
    </>
  ),
};

export default function RankMark({ nivel, size = 24, className = "", ...rest }) {
  const gradId = useId();
  const clave = normalizarNivel(nivel);
  if (!clave) return null;
  const clases = ["pd-rank", size === 40 && "pd-rank-lg", className].filter(Boolean).join(" ");
  const estilo = size === 20 ? { width: 20, height: 20 } : undefined;
  return (
    <svg
      className={clases}
      style={estilo}
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      {DIBUJOS[clave](gradId)}
    </svg>
  );
}
