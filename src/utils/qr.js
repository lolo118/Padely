// Generador de códigos QR mínimo (sin dependencias): modo byte, corrección M, versiones 1 a 6 (hasta 106 bytes),
// máscara elegida por penalización como manda la norma. Devuelve la matriz de módulos y un SVG. Lo usa el QR de
// cada cancha (/c/{clubId}/{canchaId}?t=token, ~70 caracteres → versión 5).
// Referencias: ISO/IEC 18004; la estructura sigue la implementación de dominio público de Project Nayuki.

// ----- GF(256) y Reed-Solomon -----
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
})();
const mul = (a, b) => (a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]]);

// Polinomio generador de grado n: Π (x − α^i), i = 0..n−1 (coeficiente principal primero)
export function polinomioGenerador(n) {
  let g = [1];
  for (let i = 0; i < n; i++) {
    const ng = new Array(g.length + 1).fill(0);
    for (let j = 0; j < g.length; j++) {
      ng[j] ^= g[j];
      ng[j + 1] ^= mul(g[j], EXP[i]);
    }
    g = ng;
  }
  return g;
}

// Códigos de corrección (n bytes) de un bloque de datos
export function reedSolomon(datos, n) {
  const g = polinomioGenerador(n);
  const res = new Array(n).fill(0);
  for (const b of datos) {
    const factor = b ^ res.shift();
    res.push(0);
    if (factor !== 0) for (let j = 0; j < n; j++) res[j] ^= mul(g[j + 1], factor);
  }
  return res;
}

// ----- Tablas (nivel M) -----
// total: códigos por símbolo · ec: códigos de corrección por bloque · bloques: cantidad · datos: códigos de datos por bloque
const VERSIONES = {
  1: { total: 26, ec: 10, bloques: 1, datos: 16, alineacion: null },
  2: { total: 44, ec: 16, bloques: 1, datos: 28, alineacion: 18 },
  3: { total: 70, ec: 26, bloques: 1, datos: 44, alineacion: 22 },
  4: { total: 100, ec: 18, bloques: 2, datos: 32, alineacion: 26 },
  5: { total: 134, ec: 24, bloques: 2, datos: 43, alineacion: 30 },
  6: { total: 172, ec: 16, bloques: 4, datos: 27, alineacion: 34 },
};
export const VERSION_MAXIMA = 6;
// Bytes útiles en modo byte (cabecera 4 + 8 bits)
export const capacidadBytes = (version) => Math.floor((VERSIONES[version].datos * VERSIONES[version].bloques * 8 - 12) / 8);
export const versionPara = (largo) => {
  for (let v = 1; v <= VERSION_MAXIMA; v++) if (largo <= capacidadBytes(v)) return v;
  return null;
};

// ----- Bits de formato: BCH(15,5) · nivel M = 00 ----
export function bitsDeFormato(mascara, nivel = 0) {
  const data = ((nivel & 3) << 3) | (mascara & 7);
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

const utf8 = (texto) => Array.from(new TextEncoder().encode(String(texto)));
const bit = (x, i) => ((x >>> i) & 1) === 1;

// Códigos finales (datos + corrección, intercalados) de un texto en una versión
export function codigosDe(texto, version) {
  const t = VERSIONES[version];
  const bytes = utf8(texto);
  if (bytes.length > capacidadBytes(version)) throw new Error("Texto demasiado largo para la versión");
  const bits = [];
  const push = (valor, n) => {
    for (let i = n - 1; i >= 0; i--) bits.push((valor >>> i) & 1);
  };
  push(4, 4); // modo byte
  push(bytes.length, 8);
  bytes.forEach((b) => push(b, 8));
  const capacidadBits = t.datos * t.bloques * 8;
  push(0, Math.min(4, capacidadBits - bits.length)); // terminador
  while (bits.length % 8 !== 0) bits.push(0);
  const datos = [];
  for (let i = 0; i < bits.length; i += 8) datos.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  for (let pad = 0xec; datos.length < t.datos * t.bloques; pad ^= 0xec ^ 0x11) datos.push(pad);
  // Bloques (todos del mismo largo en las versiones 1–6 nivel M) y corrección por bloque
  const bloques = [];
  for (let b = 0; b < t.bloques; b++) {
    const d = datos.slice(b * t.datos, (b + 1) * t.datos);
    bloques.push({ datos: d, ec: reedSolomon(d, t.ec) });
  }
  const salida = [];
  for (let i = 0; i < t.datos; i++) bloques.forEach((b) => salida.push(b.datos[i]));
  for (let i = 0; i < t.ec; i++) bloques.forEach((b) => salida.push(b.ec[i]));
  if (salida.length !== t.total) throw new Error("Cantidad de códigos inesperada");
  return salida;
}

// ----- Matriz -----
function matrizVacia(n) {
  return Array.from({ length: n }, () => new Array(n).fill(false));
}

function construir(version, codigos, mascara) {
  const size = 17 + 4 * version;
  const modulos = matrizVacia(size);
  const funcion = matrizVacia(size);
  const set = (x, y, oscuro) => {
    modulos[y][x] = oscuro;
    funcion[y][x] = true;
  };
  // Patrones de posición (con separador)
  const buscador = (cx, cy) => {
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, d !== 2 && d !== 4);
      }
  };
  // Sincronización primero: los buscadores la pisan donde se cruzan
  for (let i = 0; i < size; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  buscador(3, 3);
  buscador(size - 4, 3);
  buscador(3, size - 4);
  // Alineación (una sola en las versiones 2–6)
  const a = VERSIONES[version].alineacion;
  if (a) for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(a + dx, a + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  // Información de formato (dos copias) y módulo oscuro
  const formato = (bits) => {
    for (let i = 0; i <= 5; i++) set(8, i, bit(bits, i));
    set(8, 7, bit(bits, 6));
    set(8, 8, bit(bits, 7));
    set(7, 8, bit(bits, 8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(bits, i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(bits, i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(bits, i));
    set(8, size - 8, true);
  };
  formato(bitsDeFormato(mascara));
  // Datos en zigzag, de derecha a izquierda, saltando la columna 6
  let i = 0;
  const totalBits = codigos.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!funcion[y][x] && i < totalBits) {
          modulos[y][x] = bit(codigos[i >>> 3], 7 - (i & 7));
          i++;
        }
      }
    }
  }
  // Máscara sobre los módulos de datos
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) if (!funcion[y][x] && mascaraActiva(mascara, x, y)) modulos[y][x] = !modulos[y][x];
  return { size, modulos, funcion };
}

export function mascaraActiva(m, x, y) {
  switch (m) {
    case 0:
      return (x + y) % 2 === 0;
    case 1:
      return y % 2 === 0;
    case 2:
      return x % 3 === 0;
    case 3:
      return (x + y) % 3 === 0;
    case 4:
      return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
    case 5:
      return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default:
      return false;
  }
}

// Penalización de una matriz (N1 rachas, N2 bloques 2×2, N3 patrón 1:1:3:1:1, N4 proporción de oscuros)
export function penalizacion(modulos) {
  const n = modulos.length;
  let p = 0;
  const lineas = [];
  for (let y = 0; y < n; y++) lineas.push(modulos[y]);
  for (let x = 0; x < n; x++) lineas.push(modulos.map((fila) => fila[x]));
  for (const l of lineas) {
    let run = 1;
    for (let i = 1; i <= n; i++) {
      if (i < n && l[i] === l[i - 1]) run++;
      else {
        if (run >= 5) p += 3 + (run - 5);
        run = 1;
      }
    }
    // 1011101 con 0000 antes o después
    for (let i = 0; i + 7 <= n; i++) {
      const s = l.slice(i, i + 7);
      if (s[0] && !s[1] && s[2] && s[3] && s[4] && !s[5] && s[6]) {
        const antes = i >= 4 && !l[i - 1] && !l[i - 2] && !l[i - 3] && !l[i - 4];
        const despues = i + 10 < n + 0 ? !l[i + 7] && !l[i + 8] && !l[i + 9] && !l[i + 10] : false;
        if (antes) p += 40;
        if (despues) p += 40;
      }
    }
  }
  for (let y = 0; y + 1 < n; y++) for (let x = 0; x + 1 < n; x++) if (modulos[y][x] === modulos[y][x + 1] && modulos[y][x] === modulos[y + 1][x] && modulos[y][x] === modulos[y + 1][x + 1]) p += 3;
  let oscuros = 0;
  for (const fila of modulos) for (const m of fila) if (m) oscuros++;
  const total = n * n;
  const k = Math.floor(Math.abs(oscuros * 20 - total * 10) / total);
  p += k * 10;
  return p;
}

// Matriz del QR de un texto: { version, size, mascara, modulos (bool[y][x]) }
export function matrizQr(texto) {
  const largo = utf8(texto).length;
  const version = versionPara(largo);
  if (!version) throw new Error(`Texto demasiado largo (${largo} bytes; máximo ${capacidadBytes(VERSION_MAXIMA)})`);
  const codigos = codigosDe(texto, version);
  let mejor = null;
  for (let m = 0; m < 8; m++) {
    const r = construir(version, codigos, m);
    const p = penalizacion(r.modulos);
    if (!mejor || p < mejor.p) mejor = { ...r, mascara: m, p };
  }
  return { version, size: mejor.size, mascara: mejor.mascara, modulos: mejor.modulos };
}

// SVG (cuadrado) del QR de un texto; margen en módulos (la norma pide 4)
export function svgQr(texto, { margen = 4, color = "#000", fondo = "#fff", ancho = null, titulo = "" } = {}) {
  const { modulos, size } = matrizQr(texto);
  const n = size + margen * 2;
  let d = "";
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (modulos[y][x]) d += `M${x + margen} ${y + margen}h1v1h-1z`;
  const attrs = ancho ? ` width="${ancho}" height="${ancho}"` : "";
  const etiqueta = titulo ? `<title>${String(titulo).replace(/[<&]/g, "")}</title>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}"${attrs} shape-rendering="crispEdges" role="img">${etiqueta}<rect width="${n}" height="${n}" fill="${fondo}"/><path d="${d}" fill="${color}"/></svg>`;
}
