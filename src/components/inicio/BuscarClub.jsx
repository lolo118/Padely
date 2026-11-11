import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SearchInput } from "../ui";

// Inicio: buscador compacto que abre el Hub (/clubes) con la búsqueda ya escrita (location.state.busqueda). Sin
// geolocalización: el Hub ya filtra por la ciudad del perfil.
export default function BuscarClub() {
  const navigate = useNavigate();
  const [texto, setTexto] = useState("");
  const buscar = (e) => {
    e.preventDefault();
    const q = texto.trim();
    navigate("/clubes", q ? { state: { busqueda: q } } : undefined);
  };
  return (
    <form role="search" onSubmit={buscar} className="flex flex-col gap-2" aria-labelledby="inicio-buscar">
      <h2 id="inicio-buscar" className="heading-sm m-0">
        Buscar club
      </h2>
      <SearchInput wrapperClassName="block" placeholder="Nombre del club o ciudad…" aria-label="Buscar club por nombre o ciudad" value={texto} onChange={(e) => setTexto(e.target.value)} enterKeyHint="search" />
    </form>
  );
}
