// Plantilla de importación de productos del bar (XLSX). SheetJS se carga recién al descargarla (chunk propio).

export const ENCABEZADOS_PLANTILLA = ["Nombre", "Categoría", "Precio", "Costo", "SKU", "Código de barras", "Stock", "Stock mínimo", "Unidad"];

const EJEMPLOS = [
  ["Agua mineral 500 ml", "Bebidas", 1500, 800, "AG500", "7790001000011", 24, 6, "u"],
  ["Pelotas Head x3", "Pádel", 12000, 7500, "PH3", "", 10, 2, "u"],
];

export async function descargarPlantilla() {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([ENCABEZADOS_PLANTILLA, ...EJEMPLOS]);
  // El código de barras va como texto (string) para que Excel no lo muestre en notación científica
  ws["!cols"] = [{ wch: 28 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 18 }, { wch: 8 }, { wch: 12 }, { wch: 8 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Productos");
  XLSX.writeFile(wb, "plantilla-productos-padely.xlsx");
}
