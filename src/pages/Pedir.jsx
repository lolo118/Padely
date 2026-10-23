import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CircleDot } from "lucide-react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuthStore } from "../store/authStore";
import { getClubConfig } from "../services/canchaService";
import { getCuenta } from "../services/cuentasService";
import { normalizarReserva } from "../utils/reservas";
import { puedePedir } from "../utils/pedidos";
import { Button, Card } from "../components/ui";
import PedirUI from "../components/pedidos/PedirUI";

// /pedir/:clubId/:grupoId — quien reservó, o cualquier participante de la cuenta del turno, pide a la barra durante
// el turno (desde 15 min antes hasta el final)
export default function Pedir() {
  const { clubId, grupoId } = useParams();
  const user = useAuthStore((s) => s.user);
  const perfil = useAuthStore((s) => s.perfil);
  const [estado, setEstado] = useState({ reserva: null, club: null, participante: false, cargado: false, error: false });

  useEffect(() => {
    if (!clubId || !grupoId || !user) return undefined;
    let vivo = true;
    Promise.all([getDoc(doc(db, "clubs", clubId, "reservas", grupoId)), getClubConfig(clubId), getCuenta(clubId, grupoId).catch(() => null)])
      .then(([rs, club, cuenta]) => {
        if (!vivo) return;
        const participante = !!cuenta && Array.isArray(cuenta.participantesUids) && cuenta.participantesUids.includes(user.uid);
        setEstado({ reserva: rs.exists() ? normalizarReserva({ id: rs.id, clubId, ...rs.data() }) : null, club, participante, cargado: true, error: false });
      })
      .catch((err) => {
        console.error("Error cargando la reserva:", err);
        if (vivo) setEstado({ reserva: null, club: null, participante: false, cargado: true, error: true });
      });
    return () => {
      vivo = false;
    };
  }, [clubId, grupoId, user]);

  const volver = (
    <Link to="/mis-reservas" className="body-sm text-ink-2 inline-flex items-center gap-1 hover:underline self-start">
      <ArrowLeft className="pd-icon" size={16} aria-hidden="true" /> Mis reservas
    </Link>
  );
  if (!estado.cargado) {
    return (
      <div className="max-w-2xl mx-auto flex flex-col gap-4" aria-busy="true" aria-label="Cargando">
        {volver}
        <div className="pd-skeleton h-8 w-48" />
        <div className="pd-skeleton h-40 rounded-lg" />
      </div>
    );
  }
  const { reserva, club } = estado;
  const propia = reserva && (reserva.jugadorUid === user?.uid || estado.participante);
  const enVentana = reserva && puedePedir(reserva);
  if (estado.error || !reserva || !propia || !enVentana) {
    const titulo = estado.error ? "No pudimos abrir el turno" : !reserva ? "Esta reserva no existe" : !propia ? "No estás en este turno" : "Todavía no se puede pedir";
    const texto = !estado.error && reserva && propia && !enVentana ? `Se puede pedir desde 15 minutos antes de las ${reserva.horaInicio} hasta las ${reserva.horaFin || "el final del turno"}, el día del turno.` : "Si estás en la cancha, escaneá el QR que tiene cada una.";
    return (
      <div className="max-w-2xl mx-auto flex flex-col gap-4">
        {volver}
        <Card className="text-center">
          <CircleDot className="pd-icon-lg mx-auto mb-3 text-ink-3" size={24} aria-hidden="true" />
          <p className="heading-sm">{titulo}</p>
          <p className="body-sm text-ink-2 mt-1">{texto}</p>
          <Button as="link" to="/mis-reservas" variant="primary" className="mt-4">
            Volver a mis reservas
          </Button>
        </Card>
      </div>
    );
  }
  return (
    <div className="max-w-2xl mx-auto flex flex-col gap-4">
      {volver}
      <PedirUI clubId={clubId} club={club} reserva={reserva} uid={user.uid} nombre={perfil?.nombre || user.displayName || ""} origen="celular" anonimo={false} />
    </div>
  );
}
