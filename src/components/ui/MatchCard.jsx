import { Check, Clock, Trophy } from "lucide-react";

// Un partido de un cuadro o de un grupo (pd-match). La ronda decide el vestido:
// variant "default" (grupos y rondas tempranas) | "semi" (banda heat) | "final" (negro y oro, data-theme="dark")
// | "pending" (sin rivales definidos o sin resultado).
// parejas: [{ nombre, sets: [6, 4, 7] }, { nombre, sets: [3, 6, 5] }] · ganador: 0 | 1 | null
// ronda: texto del eyebrow ("Cuartos") · cuadro: se agrega al eyebrow ("Cuartos · 6ta M")
// cancha / hora: a la derecha del eyebrow ("Cancha 3 · 18:30"); sin ninguno, "A definir"
// foot: texto del pie; footIcon: ícono Lucide del pie (por defecto Check con resultado, Clock sin horario)
export default function MatchCard({
  ronda,
  cuadro,
  cancha,
  hora,
  parejas = [],
  ganador = null,
  variant = "default",
  foot,
  footIcon,
  className = "",
  onClick,
  ...rest
}) {
  const clases = [
    "pd-match",
    variant === "semi" && "pd-match-semi",
    variant === "final" && "pd-match-final",
    variant === "pending" && "pd-match-pending",
    onClick && "cursor-pointer",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const tema = variant === "final" ? { "data-theme": "dark" } : {};
  const eyebrow = [ronda, cuadro].filter(Boolean).join(" · ");
  const lugar = [cancha, hora].filter(Boolean).join(" · ") || "A definir";
  const conResultado = ganador === 0 || ganador === 1;
  const Pie = footIcon || (conResultado ? Check : Clock);

  return (
    <div className={clases} {...tema} onClick={onClick} {...rest}>
      <div className="pd-match-head">
        <span className="pd-eyebrow">
          {variant === "final" && <Trophy className="pd-icon" size={16} aria-hidden="true" />}
          {eyebrow}
        </span>
        <span>{lugar}</span>
      </div>
      {parejas.slice(0, 2).map((p, i) => {
        const estado = conResultado ? (ganador === i ? "is-winner" : "is-loser") : "";
        return (
          <div key={i} className={["pd-match-team", estado].filter(Boolean).join(" ")}>
            <span className="pd-ball" aria-hidden="true" />
            <span className="name">{p?.nombre || "Por definir"}</span>
            {Array.isArray(p?.sets) && p.sets.length > 0 && (
              <span className="pd-score">
                {p.sets.map((s, si) => (
                  <b key={si}>{s}</b>
                ))}
              </span>
            )}
          </div>
        );
      })}
      {foot && (
        <div className="pd-match-foot">
          <Pie className="pd-icon" size={20} aria-hidden="true" />
          {foot}
        </div>
      )}
    </div>
  );
}
