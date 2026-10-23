import { useEffect, useState } from "react";
import { Copy, MessageCircle } from "lucide-react";
import { Alert, Button, Field, Input } from "../ui";
import { toast } from "../Toast";
import { crearInvitacionTurno } from "../../services/participantesService";
import { linkWhatsApp, mensajeInvitacion, telefonoWa, urlUnirse } from "../../utils/cuentas";
import { formatDiaCorto } from "../../utils/formatDate";

// Invitar al turno por WhatsApp (lo comparten el staff y el titular): pide el link a la Function (crea la cuenta si
// hace falta), un WhatsApp opcional (número argentino → 549…, nunca se guarda), "Compartir por WhatsApp" abre wa.me
// (con número, o sin número para elegir contacto o grupo) y "Copiar link".
//   clubId · grupoId · clubNombre · turno: { fecha, horaInicio, canchaNombre }
export default function InvitarWhatsApp({ clubId, grupoId, clubNombre, turno, compacto = false }) {
  const [estado, setEstado] = useState({ token: null, error: "" });
  const [telefono, setTelefono] = useState("");
  const [errorTel, setErrorTel] = useState("");

  useEffect(() => {
    if (!clubId || !grupoId) return undefined;
    let vivo = true;
    crearInvitacionTurno({ clubId, grupoId })
      .then((r) => vivo && setEstado({ token: r.token, error: "" }))
      .catch((err) => {
        console.error("Error creando la invitación:", err);
        if (vivo) setEstado({ token: null, error: err?.message || "No pudimos armar el link de invitación." });
      });
    return () => {
      vivo = false;
    };
  }, [clubId, grupoId]);

  const url = estado.token ? urlUnirse(clubId, estado.token) : "";
  const mensaje = url ? mensajeInvitacion({ fechaTexto: formatDiaCorto(turno?.fecha), hora: turno?.horaInicio || "", clubNombre: clubNombre || "el club", canchaNombre: turno?.canchaNombre || "", url }) : "";

  const compartir = () => {
    const limpio = telefono.trim();
    const numero = limpio ? telefonoWa(limpio) : "";
    if (limpio && !numero) {
      setErrorTel("Revisá el número: código de área y número, sin el 0 ni el 15 hace falta (ej. 385 412 3456).");
      return;
    }
    setErrorTel("");
    window.open(linkWhatsApp(numero, mensaje), "_blank", "noopener");
  };
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado");
    } catch {
      toast.error("No se pudo copiar. Seleccioná el link y copialo a mano.");
    }
  };

  if (estado.error) return <Alert tone="danger">{estado.error}</Alert>;
  if (!estado.token) return <div className="pd-skeleton h-24 rounded-lg" aria-busy="true" aria-label="Armando el link" />;

  return (
    <div className="flex flex-col gap-3">
      {!compacto && <p className="body-sm text-ink-2 m-0">El link lleva a una página donde cada persona se suma al turno con su nombre (con o sin cuenta de Padely), ve lo que le toca pagar y pide a la barra. Deja de servir cuando la cuenta se cierra.</p>}
      <Field label="WhatsApp del jugador (opcional)" help="Número argentino. Sin número, WhatsApp te deja elegir el contacto o el grupo." error={errorTel}>
        <Input type="tel" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="385 412 3456" maxLength={25} autoComplete="off" />
      </Field>
      <div className="pd-btn-group">
        <Button variant="primary" icon={<MessageCircle className="pd-icon" size={20} aria-hidden="true" />} onClick={compartir}>
          Compartir por WhatsApp
        </Button>
        <Button icon={<Copy className="pd-icon" size={20} aria-hidden="true" />} onClick={copiar}>
          Copiar link
        </Button>
      </div>
      <p className="body-sm text-ink-3 m-0 break-all pd-tnum" aria-label="Link de invitación">
        {url}
      </p>
    </div>
  );
}
