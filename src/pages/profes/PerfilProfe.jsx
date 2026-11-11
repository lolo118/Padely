import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { CalendarPlus, ChevronLeft, MapPin, MessageCircle } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import useTituloPagina from "../../hooks/useTituloPagina";
import { getElogios, getProfe, useFlagProfes } from "../../services/profesService";
import { clasesActivas, labelTipoClase, topElogios } from "../../utils/profes";
import { formatPrecio } from "../../utils/format";
import { formatFecha } from "../../utils/formatDate";
import { AvatarProfe, ProfesApagado } from "../../components/profes/ProfeCard";
import { Badge, Button, Card } from "../../components/ui";

// /profe/:id (flags.profes): perfil público del profe. Elogios: cuántas veces le dieron cada uno y los comentarios
// recientes (solo positivos: no hay estrellas ni críticas públicas).
export default function PerfilProfe() {
  const { id } = useParams();
  const flag = useFlagProfes();
  const user = useAuthStore((s) => s.user);
  const [profe, setProfe] = useState(undefined);
  const [elogios, setElogios] = useState([]);
  useTituloPagina(profe?.nombre ? `${profe.nombre} · Profe` : "Profe");

  useEffect(() => {
    if (flag !== true) return undefined;
    let vivo = true;
    getProfe(id)
      .then((p) => vivo && setProfe(p))
      .catch(() => vivo && setProfe(null));
    getElogios(id)
      .then((l) => vivo && setElogios(l))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [id, flag]);

  if (flag === null || (flag && profe === undefined)) return <div className="pd-skeleton h-60 rounded-lg" aria-busy="true" aria-label="Cargando" />;
  if (!flag) return <ProfesApagado />;
  if (!profe || profe.activo === false) {
    return (
      <Card className="text-center py-10!">
        <span className="pd-ball mx-auto mb-3 block!" aria-hidden="true" />
        <p className="body-md text-ink-2 m-0">Este profe no está dando clases por ahora.</p>
        <Button as="link" to="/profes" className="mt-4">
          Ver profes
        </Button>
      </Card>
    );
  }

  const clases = clasesActivas(profe);
  const clubes = Object.entries(profe.clubes || {}).filter(([, c]) => c?.estado === "activo");
  const tags = topElogios(profe.elogios);
  const comentarios = elogios.filter((e) => e.comentario);
  const esYo = user?.uid === id;
  const linkReservar = `/profe/${id}/reservar`;
  const puedeReservar = clases.length > 0 && clubes.length > 0 && !esYo;

  return (
    <div className="flex flex-col gap-4 max-w-3xl mx-auto">
      <div className="flex items-start gap-3">
        <Button as="link" to="/profes" variant="ghost" iconOnly aria-label="Volver a profes" icon={<ChevronLeft className="pd-icon" size={20} aria-hidden="true" />} className="-ml-3 shrink-0" />
        <AvatarProfe profe={profe} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="display-lg m-0 break-words">{profe.nombre}</h1>
          <p className="body-sm text-ink-2 mt-1 mb-0">
            {[profe.ciudad, profe.experienciaAnios > 0 ? `${profe.experienciaAnios} ${profe.experienciaAnios === 1 ? "año" : "años"} de experiencia` : null].filter(Boolean).join(" · ")}
          </p>
          {profe.elogios?.total > 0 && (
            <p className="body-sm text-ink-3 mt-1 mb-0">
              {profe.elogios.total} {profe.elogios.total === 1 ? "alumno lo elogió" : "alumnos lo elogiaron"}
            </p>
          )}
        </div>
      </div>

      <div className="pd-btn-group">
        {puedeReservar && (
          <Button as="link" to={user && !user.isAnonymous ? linkReservar : `/login?next=${encodeURIComponent(linkReservar)}`} variant="primary" icon={<CalendarPlus className="pd-icon" size={20} aria-hidden="true" />}>
            Reservar una clase
          </Button>
        )}
        {profe.mostrarWhatsapp && profe.whatsapp && (
          <a href={`https://wa.me/${profe.whatsapp}`} target="_blank" rel="noreferrer" className="pd-btn">
            <MessageCircle className="pd-icon" size={20} aria-hidden="true" />
            WhatsApp
          </a>
        )}
        {esYo && (
          <Button as="link" to="/profe/panel">
            Editar mi perfil
          </Button>
        )}
      </div>

      {profe.bio && (
        <Card>
          <Card.Title as="h2">Sobre mí</Card.Title>
          <p className="body-md text-ink-2 mt-2 mb-0 whitespace-pre-line">{profe.bio}</p>
          {[...(profe.niveles || []), ...(profe.edades || []), ...(profe.especialidades || [])].length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {(profe.niveles || []).map((n) => (
                <Badge key={`n-${n}`}>{n}</Badge>
              ))}
              {(profe.edades || []).map((n) => (
                <Badge key={`e-${n}`}>{n}</Badge>
              ))}
              {(profe.especialidades || []).map((n) => (
                <Badge key={`s-${n}`} tone="court">
                  {n}
                </Badge>
              ))}
            </div>
          )}
        </Card>
      )}

      <Card>
        <Card.Title as="h2">Clases</Card.Title>
        {clases.length === 0 ? (
          <Card.Meta className="mt-2!">Todavía no cargó sus clases.</Card.Meta>
        ) : (
          <ul className="flex flex-col divide-y divide-line mt-2">
            {clases.map((c) => (
              <li key={c.tipo} className="flex items-center justify-between gap-3 py-2">
                <span className="body-md">
                  {labelTipoClase(c.tipo)}
                  <span className="body-sm text-ink-3 block">
                    {c.duracion} min{c.capacidad > 1 ? ` · hasta ${c.capacidad}` : ""}
                    {c.capacidad > 1 ? " · precio por alumno" : ""}
                  </span>
                </span>
                <span className="numeral-md pd-tnum">{formatPrecio(c.precio)}</span>
              </li>
            ))}
          </ul>
        )}
        <Card.Meta className="mt-2!">El club puede tener su propia tarifa: la ves al reservar.</Card.Meta>
      </Card>

      <Card>
        <Card.Title as="h2">Dónde da clases</Card.Title>
        {clubes.length === 0 ? (
          <Card.Meta className="mt-2!">Todavía no está en ningún club de Padely.</Card.Meta>
        ) : (
          <ul className="flex flex-col gap-2 mt-3">
            {clubes.map(([cid, c]) => (
              <li key={cid} className="flex items-center gap-2 body-sm">
                <MapPin className="pd-icon text-ink-3" size={20} aria-hidden="true" />
                <Link to={`/club/${cid}`} className="underline">
                  {c.nombre}
                </Link>
                {c.ciudad && <span className="text-ink-3">· {c.ciudad}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <Card.Title as="h2">Elogios de sus alumnos</Card.Title>
        {tags.length === 0 ? (
          <Card.Meta className="mt-2!">Todavía no tiene elogios. Después de cada clase, sus alumnos pueden dejarle uno.</Card.Meta>
        ) : (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {tags.map((t) => (
              <Badge key={t.id} tone="lime">
                {t.label} <span className="pd-tnum">· {t.n}</span>
              </Badge>
            ))}
          </div>
        )}
        {comentarios.length > 0 && (
          <ul className="flex flex-col gap-3 mt-4">
            {comentarios.map((e) => (
              <li key={e.id} className="border-l-2 border-line pl-3">
                <p className="body-md m-0">“{e.comentario}”</p>
                <p className="body-sm text-ink-3 mt-1 mb-0">
                  {e.nombre || "Alumno"}
                  {e.fecha ? ` · ${formatFecha(e.fecha)}` : ""}
                  {e.clubNombre ? ` · ${e.clubNombre}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
