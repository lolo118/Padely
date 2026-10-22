// Preferencias del POS por navegador (localStorage): imprimir sin vista previa. El ancho del ticket vive en
// src/print/imprimir.js (padely-ticket-ancho) y el nombre del dispositivo en cajaService (padely-dispositivo).

const CLAVE_IMPRIMIR_DIRECTO = "padely-pos-imprimir-directo";

export function imprimirDirectoGuardado() {
  try {
    return localStorage.getItem(CLAVE_IMPRIMIR_DIRECTO) === "1";
  } catch {
    return false;
  }
}

export function guardarImprimirDirecto(valor) {
  try {
    localStorage.setItem(CLAVE_IMPRIMIR_DIRECTO, valor ? "1" : "0");
  } catch {
    /* sin localStorage */
  }
}
