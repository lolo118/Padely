// Impresión de tickets: el HTML del ticket (string, sin React) se mete en un iframe oculto con la hoja de estilos
// de tickets y una @page del ancho elegido, se imprime y se saca el iframe. En la PC del bar, Chrome con
// --kiosk-printing y la térmica como impresora por defecto imprime sin diálogo; en tablets sale el diálogo del sistema.
import css from "./ticket.css?raw";

export const ANCHOS_TICKET = [80, 58];
const ANCHO_POR_DEFECTO = 80;
const CLAVE_ANCHO = "padely-ticket-ancho";

const anchoValido = (n) => (ANCHOS_TICKET.includes(Number(n)) ? Number(n) : ANCHO_POR_DEFECTO);

// Ancho de papel recordado en este navegador (80 por defecto)
export function anchoTicketGuardado() {
  try {
    return anchoValido(localStorage.getItem(CLAVE_ANCHO));
  } catch {
    return ANCHO_POR_DEFECTO;
  }
}
export function guardarAnchoTicket(n) {
  try {
    localStorage.setItem(CLAVE_ANCHO, String(anchoValido(n)));
  } catch {
    /* sin localStorage: no se recuerda */
  }
}

// Texto seguro dentro de HTML
export function escapar(valor) {
  return String(valor ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Documento HTML completo de un ticket (lo usan el iframe de impresión y la vista previa)
export function documentoTicket(html, { ancho = ANCHO_POR_DEFECTO, titulo = "Ticket" } = {}) {
  const a = anchoValido(ancho);
  return (
    `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${escapar(titulo)}</title>` +
    `<style>@page { size: ${a}mm auto; margin: 0; }\n${css}</style></head>` +
    `<body class="ancho-${a}"><div class="ticket">${html}</div></body></html>`
  );
}

// Imprime el HTML de un ticket. Resuelve cuando se cerró el diálogo de impresión (o a los 60 s si el navegador no avisa).
export function imprimirHtml(html, { ancho = ANCHO_POR_DEFECTO, titulo = "Ticket" } = {}) {
  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.tabIndex = -1;
    iframe.title = "Impresión";
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
    let terminado = false;
    const limpiar = () => {
      if (terminado) return;
      terminado = true;
      setTimeout(() => iframe.remove(), 500);
      resolve();
    };
    iframe.onload = () => {
      const w = iframe.contentWindow;
      try {
        w.onafterprint = limpiar;
        w.focus();
        w.print();
      } catch (err) {
        console.error("No se pudo imprimir el ticket:", err);
        limpiar();
      }
      setTimeout(limpiar, 60000);
    };
    document.body.appendChild(iframe);
    iframe.srcdoc = documentoTicket(html, { ancho, titulo });
  });
}
