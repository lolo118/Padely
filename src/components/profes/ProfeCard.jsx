import { Link } from "react-router-dom";
import { GraduationCap, MapPin } from "lucide-react";
import { Badge, Card } from "../ui";
import { formatPrecio } from "../../utils/format";
import { clasesActivas, labelTipoClase, precioDesde, topElogios } from "../../utils/profes";

// flags.profes apagado: la sección todavía no está
export function ProfesApagado() {
  return (
    <Card className="text-center py-10!">
      <GraduationCap className="pd-icon-lg mx-auto mb-3 text-ink-3" size={24} aria-hidden="true" />
      <p className="body-md text-ink-2 m-0">Las clases con profes llegan pronto a Padely.</p>
    </Card>
  );
}

// Foto del profe (o su inicial), redonda
export function AvatarProfe({ profe, size = 56 }) {
  const nombre = profe?.nombre || profe?.profeNombre || "P";
  const foto = profe?.foto || profe?.profeFoto || null;
  const estilo = { width: size, height: size };
  return foto ? (
    <img src={foto} alt="" style={estilo} className="rounded-pill object-cover shrink-0 bg-surface-sunken" />
  ) : (
    <span style={estilo} className="rounded-pill shrink-0 bg-surface-sunken text-ink font-display font-bold grid place-items-center text-[20px]" aria-hidden="true">
      {nombre.charAt(0).toUpperCase()}
    </span>
  );
}

// Los elogios más repetidos como badges ("Paciente · 12")
export function ElogiosTop({ elogios, max = 3, className = "" }) {
  const top = topElogios(elogios, max);
  if (!top.length) return null;
  return (
    <div className={["flex flex-wrap gap-1.5", className].join(" ")}>
      {top.map((e) => (
        <Badge key={e.id} tone="lime">
          {e.label} <span className="pd-tnum">· {e.n}</span>
        </Badge>
      ))}
    </div>
  );
}

// Tarjeta del directorio y de la pestaña Profes del club: toda la tarjeta es el link al perfil
export default function ProfeCard({ profe }) {
  const desde = precioDesde(profe);
  const tipos = clasesActivas(profe).map((c) => labelTipoClase(c.tipo));
  const clubes = Object.values(profe.clubes || {}).filter((c) => c && c.estado === "activo").map((c) => c.nombre).filter(Boolean);
  return (
    <Card as={Link} to={`/profe/${profe.id || profe.uid}`} hover className="block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
      <div className="flex items-start gap-3">
        <AvatarProfe profe={profe} />
        <div className="min-w-0 flex-1">
          <Card.Title as="h2" className="truncate">{profe.nombre}</Card.Title>
          {(profe.ciudad || clubes.length > 0) && (
            <Card.Meta className="flex items-center gap-1 truncate">
              <MapPin className="pd-icon text-ink-3 shrink-0" size={16} aria-hidden="true" />
              <span className="truncate">{[profe.ciudad, clubes.join(", ")].filter(Boolean).join(" · ")}</span>
            </Card.Meta>
          )}
          {tipos.length > 0 && <Card.Meta className="truncate">{tipos.join(" · ")}</Card.Meta>}
        </div>
        {desde > 0 && (
          <div className="shrink-0 text-right">
            <span className="caption text-ink-3 block">Desde</span>
            <span className="numeral-md pd-tnum text-ink">{formatPrecio(desde)}</span>
          </div>
        )}
      </div>
      <ElogiosTop elogios={profe.elogios} className="mt-3" />
    </Card>
  );
}
