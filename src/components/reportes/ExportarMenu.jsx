import { useState } from "react";
import { Download } from "lucide-react";
import Dialogo from "../Dialogo";
import { toast } from "../Toast";
import { Alert, Button } from "../ui";
import { getVentasEntre } from "../../services/reportesService";
import { aCsv, filasExportacion, nombreArchivo } from "../../utils/reportes";
import { formatDiaCorto } from "../../utils/formatDate";

// "Exportar": CSV de ventas (sin librería) o XLSX para el contador (SheetJS, cargado al momento como en la
// importación): Ventas, Ítems y Medios del período, desde `ventas` (tope 5.000).

const descargar = (contenido, nombre, tipo) => {
  const blob = contenido instanceof Blob ? contenido : new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

export default function ExportarMenu({ clubId, club, rango, categorias = [] }) {
  const [abierto, setAbierto] = useState(false);
  const [ocupado, setOcupado] = useState("");
  const [aviso, setAviso] = useState("");

  const cargar = async () => {
    const { ventas, truncado } = await getVentasEntre(clubId, rango.desde, rango.hasta);
    setAviso(truncado ? "Se exportaron las primeras 5.000 ventas del período; achicá el rango para el resto." : "");
    if (!ventas.length) throw new Error("sin ventas");
    return filasExportacion(ventas, Object.fromEntries(categorias.map((c) => [c.id, c.nombre])));
  };

  const csv = async () => {
    setOcupado("csv");
    try {
      const f = await cargar();
      descargar(aCsv(f.ventas), nombreArchivo(club?.nombre, rango.desde, rango.hasta, "csv"), "text/csv;charset=utf-8");
      toast.success("CSV de ventas descargado");
    } catch (e) {
      toast.error(e?.message === "sin ventas" ? "No hay ventas en el período." : "No se pudo exportar.");
    } finally {
      setOcupado("");
    }
  };
  const xlsx = async () => {
    setOcupado("xlsx");
    try {
      const f = await cargar();
      const XLSX = await import("xlsx");
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(f.ventas), "Ventas");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(f.items), "Ítems");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(f.medios), "Medios");
      XLSX.writeFile(wb, nombreArchivo(club?.nombre, rango.desde, rango.hasta, "xlsx"));
      toast.success("Planilla para el contador descargada");
    } catch (e) {
      console.error("Error exportando:", e);
      toast.error(e?.message === "sin ventas" ? "No hay ventas en el período." : "No se pudo exportar.");
    } finally {
      setOcupado("");
    }
  };

  return (
    <>
      <Button icon={<Download className="pd-icon" size={20} aria-hidden="true" />} onClick={() => setAbierto(true)}>
        Exportar
      </Button>
      {abierto && (
        <Dialogo
          titulo="Exportar ventas"
          descripcion={`${formatDiaCorto(rango.desde)}${rango.desde !== rango.hasta ? ` – ${formatDiaCorto(rango.hasta)}` : ""}`}
          onCerrar={() => setAbierto(false)}
          acciones={
            <Button variant="primary" onClick={() => setAbierto(false)}>
              Listo
            </Button>
          }
        >
          <div className="mt-4 flex flex-col gap-3">
            <Button onClick={csv} cargando={ocupado === "csv" ? "Armando…" : ""} disabled={!!ocupado}>
              CSV de ventas
            </Button>
            <p className="pd-help -mt-2 m-0">Una fila por venta, separado por punto y coma, listo para Excel en español.</p>
            <Button variant="primary" onClick={xlsx} cargando={ocupado === "xlsx" ? "Armando…" : ""} disabled={!!ocupado}>
              XLSX para el contador
            </Button>
            <p className="pd-help -mt-2 m-0">Tres hojas: Ventas, Ítems (con costo y tipo) y Medios de pago.</p>
            {aviso && <Alert tone="warning">{aviso}</Alert>}
          </div>
        </Dialogo>
      )}
    </>
  );
}
