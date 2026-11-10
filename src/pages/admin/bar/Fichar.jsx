import { useCallback, useEffect, useRef, useState } from "react";
import { Delete, QrCode, Users } from "lucide-react";
import { useAuthStore } from "../../../store/authStore";
import SinPermiso from "../../../components/SinPermiso";
import { Alert, Button, Card } from "../../../components/ui";
import { fichar, mensajeError, pedirTokenQr } from "../../../services/fichajesService";
import { PERMISOS_FICHAR, PIN_LARGO, QR_REFRESCO_SEG, formatMinutos } from "../../../utils/fichajes";
import { svgQr } from "../../../utils/qr";

// Fichar en la PC de la caja: cada empleado teclea su PIN de 4 números y la Function decide entrada o salida con
// la hora del servidor. La sesión abierta en la PC (alguien del bar o la caja) es la que llama; los PINs mal se
// limitan por dispositivo. "Con el celular": un QR que cambia cada 30 s para el staff con cuenta de Padely.

const RESULTADO_SEG = 6;
const ORIGEN = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "https://padely.netlify.app";
const TECLAS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

function QrFichaje({ clubId }) {
  const [qr, setQr] = useState({ url: "", error: "" });
  useEffect(() => {
    let vivo = true;
    const pedir = async () => {
      try {
        const { token } = await pedirTokenQr({ clubId });
        if (vivo) setQr({ url: `${ORIGEN}/fichar/${clubId}/${token}`, error: "" });
      } catch (err) {
        console.error("Error pidiendo el QR de fichaje:", err);
        if (vivo) setQr((q) => ({ ...q, error: mensajeError(err, "No pudimos generar el QR. Revisá la conexión.") }));
      }
    };
    pedir();
    const id = setInterval(pedir, QR_REFRESCO_SEG * 1000);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [clubId]);

  return (
    <Card className="flex flex-col items-center text-center gap-3">
      <Card.Eyebrow>Con el celular</Card.Eyebrow>
      {qr.url ? (
        <div className="w-full max-w-[260px] rounded-md overflow-hidden bg-white p-2" dangerouslySetInnerHTML={{ __html: svgQr(qr.url, { titulo: "QR para fichar" }) }} />
      ) : (
        <div className="pd-skeleton w-full max-w-[260px] aspect-square rounded-md" aria-busy="true" aria-label="Cargando el QR" />
      )}
      <p className="body-sm text-ink-2 m-0">Escaneá con la cámara del celular, con tu cuenta de Padely. El código cambia cada {QR_REFRESCO_SEG} segundos.</p>
      {qr.error && <Alert tone="danger">{qr.error}</Alert>}
    </Card>
  );
}

export default function Fichar() {
  const clubActual = useAuthStore((s) => s.clubActual);
  const clubCargado = useAuthStore((s) => s.clubCargado);
  const puede = useAuthStore((s) => s.puede);
  const clubId = clubActual?.id || null;
  const puedeFichar = !!clubActual && PERMISOS_FICHAR.some((p) => puede(p));
  const puedeAdmin = !!clubActual && puede("gestionarStaff");
  const [pin, setPin] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null); // { nombre, tipo, hora, minutos }
  const [error, setError] = useState("");
  const [conQr, setConQr] = useState(false);
  const enviandoRef = useRef(false);
  const pinRef = useRef("");

  const cambiarPin = useCallback((valor) => {
    pinRef.current = valor;
    setPin(valor);
  }, []);

  const enviar = useCallback(
    async (valor) => {
      if (enviandoRef.current || !clubId) return;
      enviandoRef.current = true;
      setEnviando(true);
      setError("");
      try {
        const r = await fichar({ clubId, pin: valor });
        setResultado(r);
      } catch (err) {
        setResultado(null);
        setError(mensajeError(err, "No se pudo fichar. Revisá la conexión y probá de nuevo."));
      } finally {
        pinRef.current = "";
        setPin("");
        setEnviando(false);
        enviandoRef.current = false;
      }
    },
    [clubId],
  );

  // Con el cuarto número se manda solo
  const tecla = useCallback(
    (t) => {
      if (enviandoRef.current) return;
      setResultado(null);
      if (t === "borrar") {
        cambiarPin(pinRef.current.slice(0, -1));
        return;
      }
      setError("");
      if (pinRef.current.length >= PIN_LARGO) return;
      const nuevo = pinRef.current + t;
      cambiarPin(nuevo);
      if (nuevo.length === PIN_LARGO) enviar(nuevo);
    },
    [enviar, cambiarPin],
  );

  // Teclado físico: números, Borrar y Escape
  useEffect(() => {
    const onKey = (e) => {
      if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
      if (/^\d$/.test(e.key)) tecla(e.key);
      else if (e.key === "Backspace") tecla("borrar");
      else if (e.key === "Escape") cambiarPin("");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tecla, cambiarPin]);

  // El saludo se borra solo para el siguiente
  useEffect(() => {
    if (!resultado) return undefined;
    const id = setTimeout(() => setResultado(null), RESULTADO_SEG * 1000);
    return () => clearTimeout(id);
  }, [resultado]);

  if (!clubCargado) return <div className="pd-skeleton h-64 rounded-lg" aria-busy="true" aria-label="Cargando" />;
  if (!puedeFichar) {
    return (
      <div>
        <h1 className="heading-lg m-0 mb-4">Fichar</h1>
        <SinPermiso />
      </div>
    );
  }

  const teclaBtn = (t, contenido = t, extra = {}) => (
    <button
      key={t}
      type="button"
      className="pd-btn h-20! text-[28px]! font-semibold pd-tnum justify-center"
      onClick={() => tecla(t)}
      disabled={enviando}
      {...extra}
    >
      {contenido}
    </button>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="heading-lg m-0">Fichar</h1>
          <p className="body-md text-ink-2 mt-1 mb-0">Poné tu PIN para marcar la entrada o la salida.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<QrCode className="pd-icon" size={20} aria-hidden="true" />} onClick={() => setConQr((v) => !v)} aria-pressed={conQr}>
            {conQr ? "Ocultar el QR" : "Con el celular"}
          </Button>
          {puedeAdmin && (
            <Button as="link" to="/admin/bar/fichajes" icon={<Users className="pd-icon" size={20} aria-hidden="true" />}>
              Ver fichajes
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-6">
        <Card className="w-full max-w-[420px] flex flex-col gap-4">
          <div className="flex justify-center gap-4 py-2" role="status" aria-label={`${pin.length} de ${PIN_LARGO} números`}>
            {Array.from({ length: PIN_LARGO }, (_, i) => (
              <span key={i} className={["w-5 h-5 rounded-pill border-2 border-ink", i < pin.length ? "bg-ink" : "bg-transparent"].join(" ")} aria-hidden="true" />
            ))}
          </div>

          <div aria-live="polite" className="min-h-[88px] flex items-center justify-center text-center">
            {enviando ? (
              <p className="body-md text-ink-2 m-0">Fichando…</p>
            ) : resultado ? (
              <div>
                <p className="heading-md m-0">Hola {resultado.nombre}</p>
                <p className={["heading-sm m-0 mt-1", resultado.tipo === "entrada" ? "text-success" : "text-ink"].join(" ")}>
                  {resultado.tipo === "entrada" ? "Entrada" : "Salida"} {resultado.hora}
                  {resultado.tipo === "salida" && Number.isFinite(resultado.minutos) ? ` · ${formatMinutos(resultado.minutos)}` : ""}
                </p>
                {resultado.cerroOlvido && <p className="pd-help m-0 mt-1">Tu turno anterior quedó sin salida: avisale al encargado.</p>}
              </div>
            ) : error ? (
              <Alert tone="danger">{error}</Alert>
            ) : (
              <p className="body-sm text-ink-3 m-0">Tu PIN es personal: no lo compartas.</p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            {TECLAS.map((t) => teclaBtn(t))}
            {teclaBtn("borrar", <Delete className="pd-icon" size={28} aria-hidden="true" />, { "aria-label": "Borrar" })}
            {teclaBtn("0")}
            <span aria-hidden="true" />
          </div>
        </Card>

        {conQr && (
          <div className="w-full max-w-[320px]">
            <QrFichaje clubId={clubId} />
          </div>
        )}
      </div>
    </div>
  );
}
