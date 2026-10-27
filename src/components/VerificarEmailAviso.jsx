import { useState } from "react";
import { useAuthStore } from "../store/authStore";
import { necesitaVerificar, reenviarVerificacion } from "../services/authService";
import { toast } from "./Toast";
import { Alert, Button } from "./ui";

// Aviso "Verificá tu email" (P3-10) para cuentas con email y contraseña sin verificar: el mail se manda al
// registrarse y hace falta para aceptar una invitación al equipo de un club (las reglas lo exigen).
export default function VerificarEmailAviso({ className = "" }) {
  const user = useAuthStore((s) => s.user);
  const [estado, setEstado] = useState(""); // "" | "enviando" | "enviado" | "chequeando" | "listo"
  if (!necesitaVerificar(user) || estado === "listo") return null;
  const reenviar = async () => {
    setEstado("enviando");
    try {
      await reenviarVerificacion();
      setEstado("enviado");
      toast.success(`Te mandamos el mail a ${user.email}`);
    } catch (err) {
      console.error("No se pudo reenviar la verificación:", err);
      setEstado("");
      toast.error(err?.code === "auth/too-many-requests" ? "Ya te mandamos varios mails: esperá unos minutos." : "No pudimos mandar el mail. Probá de nuevo.");
    }
  };
  const yaVerifique = async () => {
    setEstado("chequeando");
    try {
      const { auth } = await import("../lib/firebase");
      await auth.currentUser?.reload();
      await auth.currentUser?.getIdToken(true);
      if (auth.currentUser?.emailVerified) {
        setEstado("listo");
        toast.success("Email verificado");
        // Recarga para que la página (y las reglas, con el token nuevo) lo vean verificado
        setTimeout(() => window.location.reload(), 600);
      } else {
        setEstado("");
        toast.info("Todavía no figura verificado. Abrí el link del mail y volvé a probar.");
      }
    } catch (err) {
      console.error("No se pudo chequear la verificación:", err);
      setEstado("");
    }
  };
  return (
    <Alert tone="warning" className={className}>
      <strong>Verificá tu email.</strong> Te mandamos un link a {user.email}
      {estado === "enviado" ? " (recién reenviado)" : ""}. Hace falta para sumarte al equipo de un club.
      <span className="pd-btn-group mt-2 flex">
        <Button size="sm" onClick={reenviar} cargando={estado === "enviando" ? "Enviando…" : ""} disabled={estado === "chequeando"}>
          Reenviar mail
        </Button>
        <Button size="sm" variant="ghost" onClick={yaVerifique} cargando={estado === "chequeando" ? "Chequeando…" : ""} disabled={estado === "enviando"}>
          Ya lo verifiqué
        </Button>
      </span>
    </Alert>
  );
}
