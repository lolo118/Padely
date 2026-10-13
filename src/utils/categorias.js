// Categorías de pádel: la escalera de niveles (de abajo arriba) y las categorías "Suma N" de los torneos.
// Los descriptores son copy (CategorySelect los muestra junto a la marca del nivel), no reglas.

export const NIVELES = ["8va", "7ma", "6ta", "5ta", "4ta", "3era", "2da", "1era", "Libre"];

export const DESCRIPTORES = {
  "8va": "Primeros partidos",
  "7ma": "Iniciación",
  "6ta": "Intermedia",
  "5ta": "Intermedia alta",
  "4ta": "Avanzada",
  "3era": "Competitiva",
  "2da": "Alto rendimiento",
  "1era": "Elite",
  Libre: "Sin tope",
};

// Categorías que puede tener un torneo, en el orden que ya usaban CrearTorneo y DetalleTorneo (no cambiar)
export const CATEGORIAS_TORNEO = [
  "8va",
  "Suma 15",
  "7ma",
  "Suma 13",
  "6ta",
  "Suma 11",
  "5ta",
  "Suma 9",
  "4ta",
  "Suma 7",
  "3era",
  "Suma 5",
  "2da",
  "Suma 3",
  "1era",
  "Libre",
];

// Nombre canónico de un nivel ("libre" → "Libre", " 6ta " → "6ta"); null si no es un nivel de la escalera
export function normalizarNivel(nivel) {
  if (typeof nivel !== "string") return null;
  const limpio = nivel.trim();
  if (limpio.toLowerCase() === "libre") return "Libre";
  return NIVELES.includes(limpio) ? limpio : null;
}

// "Suma 13" → true
export function esSuma(cat) {
  return typeof cat === "string" && /^Suma \d+$/.test(cat.trim());
}

// Número de un nivel ("7ma" → 7); Libre y las sumas no tienen
const NUMERO_NIVEL = { "8va": 8, "7ma": 7, "6ta": 6, "5ta": 5, "4ta": 4, "3era": 3, "2da": 2, "1era": 1 };
const NIVEL_POR_NUMERO = Object.fromEntries(Object.entries(NUMERO_NIVEL).map(([k, v]) => [v, k]));

export function numeroDeNivel(nivel) {
  return NUMERO_NIVEL[nivel] ?? null;
}

// Pares de niveles que suman N, del más parejo al más desparejo: "Suma 13" → ["7ma + 6ta", "8va + 5ta"]
export function paresDeSuma(cat) {
  const n = esSuma(cat) ? Number(cat.trim().slice(5)) : NaN;
  if (!Number.isFinite(n)) return [];
  const pares = [];
  for (let a = Math.ceil(n / 2); a <= 8; a++) {
    const b = n - a;
    if (b < 1 || b > a) continue;
    pares.push(`${NIVEL_POR_NUMERO[a]} + ${NIVEL_POR_NUMERO[b]}`);
  }
  return pares;
}

// Descriptor corto de una categoría: el del nivel, o los dos primeros pares de una suma ("7ma + 6ta, 8va + 5ta…")
export function descriptorDeCategoria(cat) {
  if (esSuma(cat)) {
    const pares = paresDeSuma(cat);
    if (pares.length === 0) return "";
    return pares.slice(0, 2).join(", ") + (pares.length > 2 ? "…" : "");
  }
  return DESCRIPTORES[cat] || "";
}
