// Un número con su nombre (pd-stat): el valor en numeral-lg, la etiqueta abajo, un delta opcional con su signo
// y su período ("+89 este mes"). `down` lo pinta en danger. `children` va junto al valor (por ejemplo RankMark).
export default function StatTile({ value, label, delta, down = false, className = "", children, ...rest }) {
  return (
    <div className={["pd-stat", className].filter(Boolean).join(" ")} {...rest}>
      {children ? (
        <span className="flex items-center gap-2">
          {children}
          <span className="pd-stat-value">{value}</span>
        </span>
      ) : (
        <span className="pd-stat-value">{value}</span>
      )}
      <span className="pd-stat-label">{label}</span>
      {delta && <span className={["pd-stat-delta", down && "is-down"].filter(Boolean).join(" ")}>{delta}</span>}
    </div>
  );
}
