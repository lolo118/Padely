import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { GraduationCap } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import useTituloPagina from "../../hooks/useTituloPagina";
import { getProfes, useFlagProfes } from "../../services/profesService";
import { getClubesPublicos } from "../../services/canchaService";
import { filtrarProfes } from "../../utils/profes";
import ProfeCard, { ProfesApagado } from "../../components/profes/ProfeCard";
import { Button, Card, Field, SearchInput, Select } from "../../components/ui";

// /profes (flags.profes): el directorio público de profes. Búsqueda por nombre, ciudad o especialidad, y filtros por
// ciudad (la del profe o la de sus clubes) y por club.

export default function Profes() {
  useTituloPagina("Profes");
  const flag = useFlagProfes();
  const user = useAuthStore((s) => s.user);
  const [profes, setProfes] = useState(null);
  const [clubes, setClubes] = useState([]);
  const [texto, setTexto] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [clubId, setClubId] = useState("");

  useEffect(() => {
    if (flag !== true) return undefined;
    let vivo = true;
    getProfes()
      .then((l) => vivo && setProfes(l))
      .catch((err) => {
        console.error("Error cargando profes:", err);
        if (vivo) setProfes([]);
      });
    getClubesPublicos()
      .then((c) => vivo && setClubes(c))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [flag]);

  const ciudades = useMemo(() => {
    const set = new Set();
    (profes || []).forEach((p) => {
      if (p.ciudad) set.add(p.ciudad);
      Object.values(p.clubes || {}).forEach((c) => c?.estado === "activo" && c.ciudad && set.add(c.ciudad));
    });
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [profes]);
  const clubesConProfes = useMemo(() => {
    const ids = new Set((profes || []).flatMap((p) => p.clubIds || []));
    return clubes.filter((c) => ids.has(c.id));
  }, [profes, clubes]);
  const lista = useMemo(() => filtrarProfes(profes || [], { texto, ciudad, clubId }), [profes, texto, ciudad, clubId]);

  if (flag === null) return <div className="pd-skeleton h-40 rounded-lg" aria-busy="true" aria-label="Cargando" />;
  if (!flag) return <ProfesApagado />;

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="display-lg m-0">Profes</h1>
          <p className="body-sm text-ink-2 mt-1 mb-0">Encontrá un profe de pádel y reservá tu clase.</p>
        </div>
        {user && !user.isAnonymous && (
          <Button as="link" to="/profe/panel" variant="ghost" size="sm" icon={<GraduationCap className="pd-icon" size={20} aria-hidden="true" />}>
            Soy profe
          </Button>
        )}
      </header>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        <Field label="Buscar">
          <SearchInput value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Nombre, ciudad o especialidad" aria-label="Buscar profes" />
        </Field>
        <Field label="Ciudad">
          <Select value={ciudad} onChange={(e) => setCiudad(e.target.value)}>
            <option value="">Todas</option>
            {ciudades.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Club">
          <Select value={clubId} onChange={(e) => setClubId(e.target.value)}>
            <option value="">Todos</option>
            {clubesConProfes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      {profes === null ? (
        <div className="grid gap-4 sm:grid-cols-2" aria-busy="true">
          <span className="sr-only">Cargando profes…</span>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="pd-skeleton h-32 rounded-lg!" />
          ))}
        </div>
      ) : lista.length === 0 ? (
        <Card className="text-center py-10!">
          <span className="pd-ball mx-auto mb-3 block!" aria-hidden="true" />
          <p className="body-md text-ink-2 m-0">{profes.length === 0 ? "Todavía no hay profes en Padely." : "No encontramos profes con esos filtros."}</p>
          {profes.length === 0 && user && !user.isAnonymous && (
            <p className="body-sm text-ink-3 mt-2 mb-0">
              ¿Das clases? <Link to="/profe/panel" className="underline">Armá tu perfil de profe</Link>.
            </p>
          )}
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {lista.map((p) => (
            <ProfeCard key={p.id} profe={p} />
          ))}
        </div>
      )}
    </div>
  );
}
