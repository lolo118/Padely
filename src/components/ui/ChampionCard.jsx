import { Trophy } from "lucide-react";

// Los campeones de un cuadro (pd-champion): negro y oro en los dos temas (data-theme="dark"). Una por cuadro.
// cuadroLabel: "6ta Masculino" · campeones / subcampeones: "Gómez / Pérez" · torneo, club, fecha: la línea meta
export default function ChampionCard({ cuadroLabel, campeones, subcampeones, torneo, club, fecha, className = "", ...rest }) {
  const meta = [torneo, club, fecha].filter(Boolean).join(" · ");
  return (
    <div className={["pd-champion", className].filter(Boolean).join(" ")} data-theme="dark" {...rest}>
      <span className="pd-champion-ball" aria-hidden="true" />
      <p className="pd-eyebrow">
        <Trophy className="pd-icon" size={16} aria-hidden="true" />
        {cuadroLabel ? `Campeones · ${cuadroLabel}` : "Campeones"}
      </p>
      <h2 className="pd-champion-names">{campeones}</h2>
      {meta && <p className="pd-champion-meta">{meta}</p>}
      {subcampeones && (
        <>
          <div className="pd-champion-rule" />
          <div className="pd-champion-sub">
            <span className="pd-ball" aria-hidden="true" />
            Subcampeones: <strong>{subcampeones}</strong>
          </div>
        </>
      )}
    </div>
  );
}
