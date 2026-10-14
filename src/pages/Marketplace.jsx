import { Percent, ShoppingBag, Tag } from "lucide-react";

const temas = [
  { icono: ShoppingBag, texto: "Compra y venta de paletas, zapatillas y accesorios" },
  { icono: Tag, texto: "Promociones y packs especiales de clubes" },
  { icono: Percent, texto: "Ofertas exclusivas para la comunidad Padely" },
];

// Función, no componente: así la lista no se desmonta en cada render
function tema({ icono, texto }) {
  const Icono = icono;
  return (
    <li key={texto} className="flex items-center gap-3 rounded-md px-4 py-3 bg-surface-sunken text-left">
      <Icono className="pd-icon text-ink-3" size={20} aria-hidden="true" />
      <span className="body-sm text-ink-2">{texto}</span>
    </li>
  );
}

export default function Marketplace() {
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="display-lg mb-4">Tienda</h1>
      <div className="pd-card sm:p-8 text-center">
        <div className="flex justify-center mb-4">
          <span className="pd-ball" aria-hidden="true" />
        </div>
        <h2 className="heading-md mb-2">Próximamente</h2>
        <p className="body-md text-ink-2 mb-4">
          El marketplace de Padely va a permitirte comprar, vender e intercambiar
          equipamiento de padel con otros jugadores y acceder a ofertas exclusivas de clubes.
        </p>
        <ul className="flex flex-col gap-2 max-w-sm mx-auto">{temas.map(tema)}</ul>
      </div>
    </div>
  );
}
