import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { useAuthStore } from "../../../store/authStore";
import SinPermiso from "../../../components/SinPermiso";
import { Alert, Button, Card } from "../../../components/ui";

// Guía para la PC de barra: Chrome en modo kiosco de impresión abre Vender como app y manda los tickets a la
// térmica sin mostrar el diálogo de impresión (la misma receta que usa la caja de la pizzería).

const ORIGEN = typeof window !== "undefined" && window.location?.origin ? window.location.origin : "https://padely.netlify.app";
const URL_VENDER = `${ORIGEN}/admin/bar/vender`;
const COMANDO = `"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --kiosk-printing --app=${URL_VENDER}`;

export default function Kiosk() {
  const clubActual = useAuthStore((s) => s.clubActual);
  const clubCargado = useAuthStore((s) => s.clubCargado);
  const puede = useAuthStore((s) => s.puede);
  const [copiado, setCopiado] = useState(false);

  if (!clubCargado) return <div className="pd-skeleton h-40 rounded-lg" aria-busy="true" aria-label="Cargando" />;
  if (!clubActual || !puede("vender")) {
    return (
      <div>
        <h1 className="heading-lg m-0 mb-4">PC de barra</h1>
        <SinPermiso />
      </div>
    );
  }

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(COMANDO);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch (err) {
      console.error("No se pudo copiar:", err);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-[760px]">
      <div>
        <h1 className="heading-lg m-0">Configurar la PC de barra</h1>
        <p className="body-md text-ink-2 mt-1 mb-0">Una vez por computadora. Después, un doble clic abre Vender a pantalla completa y cada ticket sale solo por la impresora térmica.</p>
      </div>

      <Card>
        <Card.Eyebrow>Paso 1</Card.Eyebrow>
        <Card.Title>La impresora térmica como predeterminada</Card.Title>
        <p className="body-md text-ink-2 mt-2 mb-0">
          En Windows: Configuración → Bluetooth y dispositivos → Impresoras y escáneres → la térmica → "Establecer como predeterminada". Desactivá "Permitir que Windows administre
          mi impresora predeterminada" para que no cambie sola. En las preferencias de la impresora, poné el ancho de papel (80 mm o 58 mm) y márgenes en 0.
        </p>
      </Card>

      <Card>
        <Card.Eyebrow>Paso 2</Card.Eyebrow>
        <Card.Title>Un acceso directo de Chrome que imprime sin preguntar</Card.Title>
        <p className="body-md text-ink-2 mt-2 mb-3">
          Clic derecho en el escritorio → Nuevo → Acceso directo, y pegá esta línea como ubicación. <code className="body-sm">--kiosk-printing</code> manda cada impresión directo a la
          impresora predeterminada; <code className="body-sm">--app</code> abre Vender como una aplicación, sin barra de direcciones.
        </p>
        <pre className="m-0 p-3 rounded-md bg-surface-sunken border border-line body-sm overflow-x-auto whitespace-pre-wrap break-all">{COMANDO}</pre>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button icon={copiado ? <Check className="pd-icon" size={20} aria-hidden="true" /> : <Copy className="pd-icon" size={20} aria-hidden="true" />} onClick={copiar}>
            {copiado ? "Copiado" : "Copiar la línea"}
          </Button>
        </div>
        <p className="pd-help mt-3 mb-0">Si Chrome está instalado en otra carpeta, cambiá la ruta del .exe. Para probar sin acceso directo, pegá la línea en Ejecutar (Win + R).</p>
      </Card>

      <Card>
        <Card.Eyebrow>Paso 3</Card.Eyebrow>
        <Card.Title>En Padely, en esa PC</Card.Title>
        <ul className="m-0 mt-2 pl-5 body-md text-ink-2 grid gap-1">
          <li>Iniciá sesión con la cuenta del club o de quien vende (queda recordada).</li>
          <li>En Caja, ponele nombre al dispositivo ("Caja 1") y abrí la caja del turno.</li>
          <li>En Vender, abajo: elegí el ancho del ticket (80 mm o 58 mm) y activá "Imprimir sin vista previa".</li>
          <li>Probá una venta: el ticket tiene que salir solo, sin diálogo de impresión.</li>
        </ul>
      </Card>

      <Alert>
        Sin internet se sigue vendiendo: los tickets usan números reservados de antemano y las ventas se suben solas cuando vuelve la conexión. Una tablet también vende, pero imprime
        con el diálogo del sistema (o manda el ticket por WhatsApp).
      </Alert>

      <div>
        <Button as="link" to="/admin/bar/vender" variant="primary">
          Volver a Vender
        </Button>
      </div>
    </div>
  );
}
