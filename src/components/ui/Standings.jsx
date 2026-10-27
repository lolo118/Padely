import Badge from "./Badge";

// Tabla de posiciones de un grupo (pd-table-wrap + pd-table). Las filas que clasifican llevan la pelota.
// grupo: título · cuadroLabel: badge court a la derecha · help: línea de desempate debajo
// rows: [{ id, nombre, pj, pg, pp, sf, sc, gf, gc, pts, clasifica }] (pts opcional: si falta se muestra pg)
// columnas: "completa" (PJ PG PP SF SC GF GC) | "compacta" (PJ PG Sets Pts)
export default function Standings({ grupo, cuadroLabel, rows = [], help, columnas = "compacta", children, className = "", ...rest }) {
  const completa = columnas === "completa";
  return (
    <div className={["pd-table-wrap", className].filter(Boolean).join(" ")} {...rest}>
      {(grupo || cuadroLabel || children) && (
        <div className="pd-table-head">
          {grupo && <h3>{grupo}</h3>}
          {children}
          {cuadroLabel && <Badge tone="court">{cuadroLabel}</Badge>}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="pd-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Pareja</th>
              <th className="num">PJ</th>
              <th className="num">PG</th>
              {completa ? (
                <>
                  <th className="num">PP</th>
                  <th className="num">SF</th>
                  <th className="num">SC</th>
                  <th className="num">GF</th>
                  <th className="num">GC</th>
                </>
              ) : (
                <>
                  <th className="num">Sets</th>
                  <th className="num">Pts</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={row.id ?? i} className={row.clasifica ? "pd-qualifies" : undefined}>
                <td className="pos">{i + 1}</td>
                <td>{row.nombre}</td>
                <td className="num">{row.pj ?? 0}</td>
                <td className="num">{row.pg ?? 0}</td>
                {completa ? (
                  <>
                    <td className="num">{row.pp ?? 0}</td>
                    <td className="num">{row.sf ?? 0}</td>
                    <td className="num">{row.sc ?? 0}</td>
                    <td className="num">{row.gf ?? 0}</td>
                    <td className="num">{row.gc ?? 0}</td>
                  </>
                ) : (
                  <>
                    <td className="num">{`${row.sf ?? 0}–${row.sc ?? 0}`}</td>
                    <td className="num pts">{row.pts ?? row.pg ?? 0}</td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {help && (
        <p className="pd-help px-4 py-3 border-t border-line">
          {help}
        </p>
      )}
    </div>
  );
}
