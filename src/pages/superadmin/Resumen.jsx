import { useEffect, useState } from "react";
import { Alert, Badge, Button, Card, StatTile } from "../../components/ui";
import { toast } from "../../components/Toast";
import { getResumenPlataforma, getUltimosUsuarios } from "../../services/superadminService";
import { reconstruirPerfilesPublicos } from "../../services/participantesService";

// createdAt (Timestamp de Firestore, Date, número o string ISO) -> "DD/MM/YY"; "—" sin fecha válida
const fechaAlta = (valor) => {
  if (!valor) return "—";
  const d = typeof valor.toDate === "function" ? valor.toDate() : valor instanceof Date ? valor : new Date(valor);
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "—";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
};

const rolesDe = (u) => {
  const r = Array.isArray(u?.role) ? u.role.filter(Boolean) : u?.role ? [u.role] : [];
  return r.length ? r : ["jugador"];
};

const numero = (n) => (n === null || n === undefined ? "—" : Number(n).toLocaleString("es-AR"));

const suspendidos = (n) => (n > 0 ? `${numero(n)} ${n === 1 ? "suspendido" : "suspendidos"}` : undefined);

const badgesRol = (u) => (
  <span className="pd-badge-group">
    {rolesDe(u).map((r) => (
      <Badge key={r}>{r}</Badge>
    ))}
  </span>
);

const esqueletoTiles = (n) =>
  Array.from({ length: n }, (_, i) => <div key={i} className="pd-skeleton h-[98px] rounded-lg!" aria-hidden="true" />);

export default function Resumen() {
  const [resumen, setResumen] = useState(null);
  const [cargandoResumen, setCargandoResumen] = useState(true);
  const [errorResumen, setErrorResumen] = useState(false);

  const [ultimos, setUltimos] = useState([]);
  const [cargandoUltimos, setCargandoUltimos] = useState(true);
  const [errorUltimos, setErrorUltimos] = useState(false);

  // Cada intento nuevo (Reintentar) vuelve a pedir los datos
  const [intentoResumen, setIntentoResumen] = useState(0);
  const [intentoUltimos, setIntentoUltimos] = useState(0);
  // Mantenimiento: la proyección perfilesPublicos (buscar jugadores para un turno) se rehace desde users
  const [reconstruyendo, setReconstruyendo] = useState(false);
  const reconstruirPerfiles = async () => {
    setReconstruyendo(true);
    try {
      const r = await reconstruirPerfilesPublicos({});
      toast.success(`Perfiles públicos: ${r.usuarios} usuarios, ${r.visibles} visibles`);
    } catch (err) {
      console.error("Error reconstruyendo perfiles públicos:", err);
      toast.error("No se pudieron reconstruir los perfiles.");
    } finally {
      setReconstruyendo(false);
    }
  };

  useEffect(() => {
    let vigente = true;
    getResumenPlataforma()
      .then((r) => {
        if (!vigente) return;
        setResumen(r);
        setErrorResumen(false);
        setCargandoResumen(false);
      })
      .catch((err) => {
        console.error("Error cargando el resumen:", err);
        if (!vigente) return;
        setErrorResumen(true);
        setCargandoResumen(false);
      });
    return () => {
      vigente = false;
    };
  }, [intentoResumen]);

  useEffect(() => {
    let vigente = true;
    getUltimosUsuarios(10)
      .then((u) => {
        if (!vigente) return;
        setUltimos(u);
        setErrorUltimos(false);
        setCargandoUltimos(false);
      })
      .catch((err) => {
        console.error("Error cargando los últimos registros:", err);
        if (!vigente) return;
        setErrorUltimos(true);
        setCargandoUltimos(false);
      });
    return () => {
      vigente = false;
    };
  }, [intentoUltimos]);

  const reintentar = () => {
    if (errorResumen) {
      setCargandoResumen(true);
      setErrorResumen(false);
      setIntentoResumen((n) => n + 1);
    }
    if (errorUltimos) {
      setCargandoUltimos(true);
      setErrorUltimos(false);
      setIntentoUltimos((n) => n + 1);
    }
  };

  const hayError = errorResumen || errorUltimos;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="heading-lg">Resumen</h1>
        <p className="body-sm text-ink-2">Padely · Super-admin</p>
      </header>

      {hayError && (
        <Alert tone="danger">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>No pudimos cargar {errorResumen && errorUltimos ? "el resumen ni los últimos registros" : errorResumen ? "los números de la plataforma" : "los últimos registros"}.</span>
            <Button size="sm" onClick={reintentar}>
              Reintentar
            </Button>
          </div>
        </Alert>
      )}

      {cargandoResumen ? (
        <section className="flex flex-col gap-4" aria-busy="true" aria-label="Cargando números">
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{esqueletoTiles(4)}</div>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{esqueletoTiles(2)}</div>
        </section>
      ) : (
        resumen && (
          <section className="flex flex-col gap-4" aria-label="Números de la plataforma">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatTile className="min-w-0!" value={numero(resumen.usuarios)} label="Usuarios" />
              <StatTile
                className="min-w-0!"
                value={numero(resumen.clubesActivos)}
                label="Clubes activos"
                delta={suspendidos(resumen.clubesSuspendidos)}
                down
              />
              <StatTile
                className="min-w-0!"
                value={numero(resumen.organizadoresActivos)}
                label="Organizadores activos"
                delta={suspendidos(resumen.organizadoresSuspendidos)}
                down
              />
              <StatTile className="min-w-0!" value={numero(resumen.torneos)} label="Torneos" />
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <StatTile className="min-w-0!" value={numero(resumen.reservas)} label="Reservas" />
              <StatTile className="min-w-0!" value={numero(resumen.reservasDesdeHoy)} label="Reservas desde hoy" />
            </div>
          </section>
        )
      )}

      <Card as="section" className="p-0! overflow-hidden" aria-labelledby="ultimos-registros-titulo">
        <div className="px-5 pt-5 pb-3">
          <Card.Title as="h2" id="ultimos-registros-titulo">
            Últimos registros
          </Card.Title>
        </div>

        {cargandoUltimos ? (
          <div className="flex flex-col gap-3 px-5 pb-5" aria-busy="true" aria-label="Cargando registros">
            {Array.from({ length: 5 }, (_, i) => (
              <div key={i} className="pd-skeleton h-10" aria-hidden="true" />
            ))}
          </div>
        ) : errorUltimos ? (
          <p className="body-sm text-ink-2 px-5 pb-5">No se pudieron cargar los registros.</p>
        ) : ultimos.length === 0 ? (
          <p className="body-sm text-ink-2 px-5 pb-5">Todavía no hay cuentas con fecha de alta.</p>
        ) : (
          <>
            <div className="hidden md:block">
              <table className="pd-table">
                <thead>
                  <tr>
                    <th scope="col">Nombre</th>
                    <th scope="col">Email</th>
                    <th scope="col">Rol</th>
                    <th scope="col" className="num">
                      Alta
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ultimos.map((u) => (
                    <tr key={u.id}>
                      <td>{u.nombre || <span className="text-ink-3">Sin nombre</span>}</td>
                      <td className="break-all">{u.email || "—"}</td>
                      <td>{badgesRol(u)}</td>
                      <td className="num">{fechaAlta(u.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="md:hidden border-t border-line">
              {ultimos.map((u) => (
                <li key={u.id} className="flex flex-col gap-1 px-5 py-3 border-b border-line last:border-b-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="heading-sm min-w-0 truncate">{u.nombre || "Sin nombre"}</span>
                    <span className="body-sm text-ink-3 pd-tnum shrink-0">{fechaAlta(u.createdAt)}</span>
                  </div>
                  <span className="body-sm text-ink-2 break-all">{u.email || "—"}</span>
                  {badgesRol(u)}
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="pd-help px-5 py-3 border-t border-line">Las cuentas sin fecha de alta no aparecen en este orden.</p>
      </Card>

      <Card as="section" aria-labelledby="mantenimiento-titulo">
        <Card.Title as="h2" id="mantenimiento-titulo">
          Mantenimiento
        </Card.Title>
        <p className="body-sm text-ink-2 mt-1">Vuelve a armar perfilesPublicos (nombre, foto y ciudad de cada jugador que acepta aparecer en las búsquedas) desde users. Una vez después de publicar la cuenta compartida; después se mantiene solo.</p>
        <div className="pd-btn-group mt-4">
          <Button onClick={reconstruirPerfiles} cargando={reconstruyendo ? "Reconstruyendo…" : ""}>
            Reconstruir perfiles públicos
          </Button>
        </div>
      </Card>
    </div>
  );
}
