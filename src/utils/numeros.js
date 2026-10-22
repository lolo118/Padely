// Números de listas de precios argentinas (texto de CSV/XLSX) → number | null.
// "$ 1.234,56" → 1234.56 · "1.234" → 1234 · "1234,5" → 1234.5 · "1,234.56" (US) → 1234.56 · " 1500 " → 1500
// "-" / "" / "s/p" → null. Un número que ya viene como number (celda numérica de Excel) se devuelve tal cual.
// Regla: un único "." seguido de exactamente 3 dígitos es separador de miles ("1.250" → 1250).

export function parsearNumero(valor) {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === "number") return Number.isFinite(valor) ? valor : null;
  let s = String(valor).trim();
  if (!s) return null;
  // Fuera moneda, espacios (incluidos los no separables) y todo lo que no sea dígito, separador o signo
  s = s.replace(/\s/g, "").replace(/^(ars|\$|u\$s|usd)/i, "").replace(/\$/g, "");
  let negativo = false;
  if (/^\(.*\)$/.test(s)) {
    negativo = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negativo = true;
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const puntos = (s.match(/\./g) || []).length;
  const comas = (s.match(/,/g) || []).length;
  let normal;
  if (puntos > 0 && comas > 0) {
    // El que aparece último es el decimal: "1.234,56" (AR) o "1,234.56" (US)
    if (s.lastIndexOf(",") > s.lastIndexOf(".")) normal = s.replace(/\./g, "").replace(",", ".");
    else normal = s.replace(/,/g, "");
  } else if (comas > 0) {
    // Solo comas: una sola es decimal ("1234,5"); varias son miles ("1,234,567")
    normal = comas === 1 ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (puntos > 0) {
    // Solo puntos: varios son miles ("1.234.567"); uno solo seguido de exactamente 3 dígitos también ("1.250")
    if (puntos > 1) normal = s.replace(/\./g, "");
    else {
      const decimales = s.split(".")[1];
      normal = decimales.length === 3 ? s.replace(".", "") : s;
    }
  } else {
    normal = s;
  }
  const n = Number(normal);
  if (!Number.isFinite(n)) return null;
  return negativo ? -n : n;
}
