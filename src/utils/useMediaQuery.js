import { useEffect, useState } from "react";

// ¿Se cumple una media query? (p. ej. "(min-width: 768px)"). Sirve para renderizar UN solo layout, no dos ocultos.
export default function useMediaQuery(query) {
  const [coincide, setCoincide] = useState(() => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia(query).matches : false));
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia(query);
    const onChange = (e) => setCoincide(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return coincide;
}
