import { useEffect, useState } from "react";
import { formatFecha } from "../utils/formatDate";
import { formatPrecio } from "../utils/format";
import { useNavigate } from "react-router-dom";
import { getTodosLosTorneos } from "../services/torneoService";
import { Badge, Card, MarcaCategoria, Pills, SearchInput } from "../components/ui";

// Abierto y en curso llevan el marco heat (Card torneo) y su badge; finalizado y cancelado, tarjeta quieta
const estadoTone = {
  inscripcion: "heat",
  en_curso: "heat",
  finalizado: "neutral",
  cancelado: "danger",
};

const estadoLabel = {
  inscripcion: "Inscripción abierta",
  en_curso: "En curso",
  finalizado: "Finalizado",
  cancelado: "Cancelado",
};

const filtros = [
  { value: "todos", label: "Todos" },
  { value: "inscripcion", label: "Inscripción abierta" },
  { value: "en_curso", label: "En curso" },
  { value: "finalizado", label: "Finalizados" },
];

const esActivo = (t) => t.status === "inscripcion" || t.status === "en_curso";

export default function Torneos() {
  const navigate = useNavigate();
  const [torneos, setTorneos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("todos");

  useEffect(() => {
    getTodosLosTorneos()
      .then(setTorneos)
      .catch((err) => console.error("Error al cargar torneos:", err))
      .finally(() => setLoading(false));
  }, []);

  const torneosFiltrados = torneos.filter((t) => {
    const coincideBusqueda =
      !busqueda.trim() ||
      t.nombre?.toLowerCase().includes(busqueda.toLowerCase()) ||
      t.sede?.toLowerCase().includes(busqueda.toLowerCase()) ||
      t.ciudad?.toLowerCase().includes(busqueda.toLowerCase());

    const coincideEstado =
      filtroEstado === "todos" || t.status === filtroEstado;

    return coincideBusqueda && coincideEstado;
  });

  return (
    <div>
      <h1 className="display-lg mb-4">Torneos</h1>

      {/* Buscador y filtros */}
      <div className="flex flex-col gap-3 mb-6">
        <SearchInput
          placeholder="Buscar por nombre, sede o ciudad…"
          aria-label="Buscar torneos"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        <Pills items={filtros} value={filtroEstado} onChange={setFiltroEstado} ariaLabel="Filtrar por estado" />
      </div>

      {loading && (
        <div className="flex flex-col gap-4" aria-busy="true">
          <span className="sr-only">Cargando torneos…</span>
          {[0, 1, 2].map((i) => (
            <div key={i} className="pd-skeleton h-36 rounded-lg!" />
          ))}
        </div>
      )}

      {!loading && torneosFiltrados.length === 0 && (
        <div className="pd-card text-center py-10">
          <div className="flex justify-center mb-4">
            <span className="pd-ball" aria-hidden="true" />
          </div>
          <h2 className="heading-md">No se encontraron torneos</h2>
          <p className="body-sm text-ink-2 mt-1">Probá con otra búsqueda o filtro</p>
        </div>
      )}

      {!loading && torneosFiltrados.length > 0 && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
          {torneosFiltrados.map((t) => {
            const activo = esActivo(t);
            const abrir = () => navigate(`/torneos/${t.id}`);
            return (
              <Card
                key={t.id}
                variant={activo ? "torneo" : "default"}
                hover={!activo}
                className="cursor-pointer"
                role="link"
                tabIndex={0}
                onClick={abrir}
                onKeyDown={(e) => {
                  if (e.key === "Enter") abrir();
                }}
              >
                <Card.Row>
                  <Card.Eyebrow>
                    {formatFecha(t.fechaInicio)} – {formatFecha(t.fechaFin)}
                  </Card.Eyebrow>
                  <Badge tone={estadoTone[t.status] || "neutral"}>{estadoLabel[t.status] || t.status}</Badge>
                </Card.Row>
                <Card.Title as="h2" className="mt-2!">
                  {t.nombre}
                </Card.Title>
                <Card.Meta>
                  {t.sede} · {t.ciudad}, {t.provincia}
                </Card.Meta>
                <div className="flex flex-wrap gap-2 mt-3">
                  {Array.isArray(t.categoriaGenero) &&
                    t.categoriaGenero.map((g) => (
                      <Badge key={g} className="capitalize">
                        {g}
                      </Badge>
                    ))}
                  {t.categoriasConfig &&
                    Object.entries(t.categoriasConfig).map(([genero, niveles]) =>
                      niveles.map((n) => (
                        <Badge key={`${genero}-${n}`}>
                          <MarcaCategoria cat={n} size={20} />
                          {n}
                        </Badge>
                      )),
                    )}
                  <Badge>{t.maxParejas} parejas</Badge>
                  {t.inscripcion > 0 && <Badge>{formatPrecio(t.inscripcion)}</Badge>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
