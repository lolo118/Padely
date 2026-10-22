// node --test src/utils/qr.test.js
import { test } from "node:test";
import assert from "node:assert/strict";
import { bitsDeFormato, capacidadBytes, codigosDe, mascaraActiva, matrizQr, penalizacion, reedSolomon, svgQr, versionPara } from "./qr.js";

test("Reed-Solomon coincide con el ejemplo conocido (HELLO WORLD, 1-Q, 17 códigos de corrección)", () => {
  const datos = [32, 65, 205, 69, 41, 220, 46, 128, 236];
  assert.deepEqual(reedSolomon(datos, 17), [42, 159, 74, 221, 244, 169, 239, 150, 138, 70, 237, 85, 224, 96, 74, 219, 61]);
});

test("bits de formato (nivel M) coinciden con la tabla de la norma", () => {
  assert.equal(bitsDeFormato(0), 0b101010000010010);
  assert.equal(bitsDeFormato(1), 0b101000100100101);
  assert.equal(bitsDeFormato(5), 0b100000011001110);
  assert.equal(bitsDeFormato(7), 0b100101010100000);
});

test("capacidades y elección de versión", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6].map(capacidadBytes), [14, 26, 42, 62, 84, 106]);
  assert.equal(versionPara(11), 1);
  assert.equal(versionPara(14), 1);
  assert.equal(versionPara(15), 2);
  assert.equal(versionPara(70), 5);
  assert.equal(versionPara(106), 6);
  assert.equal(versionPara(107), null);
});

test("códigos de datos: cabecera, relleno y cantidad total", () => {
  const c = codigosDe("HELLO WORLD", 1);
  assert.equal(c.length, 26);
  // 0100 (byte) + 00001011 (11) + 'H' 0x48 + 'E' 0x45 → 0x40, 0xB4, 0x84…
  assert.equal(c[0], 0x40);
  assert.equal(c[1], 0xb4);
  assert.equal(c[2], 0x84);
  // relleno 0xEC / 0x11 alternado antes de la corrección
  assert.equal(c[13], 0xec);
  assert.equal(c[14], 0x11);
});

test("máscaras", () => {
  assert.equal(mascaraActiva(0, 0, 0), true);
  assert.equal(mascaraActiva(0, 1, 0), false);
  assert.equal(mascaraActiva(1, 5, 2), true);
  assert.equal(mascaraActiva(2, 3, 9), true);
  assert.equal(mascaraActiva(4, 2, 1), true);
});

test("la matriz es estructuralmente un QR: tamaño, buscadores, sincronización, módulo oscuro y formato legible", () => {
  const url = "https://padely.netlify.app/c/evOKh8Ktaqjpl1VgNkdI/1YXwofwjIR5w67thm0db?t=abcdefghjk";
  const { version, size, mascara, modulos } = matrizQr(url);
  assert.equal(version, 5);
  assert.equal(size, 37);
  assert.ok(mascara >= 0 && mascara <= 7);
  // Buscadores: centro oscuro, anillo claro, borde oscuro (en las tres esquinas)
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    assert.equal(modulos[cy][cx], true);
    assert.equal(modulos[cy][cx + 2], false);
    assert.equal(modulos[cy][cx + 3], true);
    assert.equal(modulos[cy + 3][cx], true);
  }
  // Separadores claros
  assert.equal(modulos[7][7], false);
  assert.equal(modulos[7][size - 8], false);
  // Sincronización alternada en la fila y la columna 6
  for (let i = 8; i < size - 8; i++) {
    assert.equal(modulos[6][i], i % 2 === 0);
    assert.equal(modulos[i][6], i % 2 === 0);
  }
  // Módulo oscuro fijo (fila 4v+9, columna 8)
  assert.equal(modulos[4 * version + 9][8], true);
  // Alineación en (30,30): centro oscuro, anillo claro, borde oscuro
  assert.equal(modulos[30][30], true);
  assert.equal(modulos[30][31], false);
  assert.equal(modulos[30][32], true);
  // La información de formato se lee de las dos copias y coincide con la máscara elegida
  const esperado = bitsDeFormato(mascara);
  let copia1 = 0;
  for (let i = 0; i <= 5; i++) copia1 |= (modulos[i][8] ? 1 : 0) << i;
  copia1 |= (modulos[7][8] ? 1 : 0) << 6;
  copia1 |= (modulos[8][8] ? 1 : 0) << 7;
  copia1 |= (modulos[8][7] ? 1 : 0) << 8;
  for (let i = 9; i < 15; i++) copia1 |= (modulos[8][14 - i] ? 1 : 0) << i;
  assert.equal(copia1, esperado);
  let copia2 = 0;
  for (let i = 0; i < 8; i++) copia2 |= (modulos[8][size - 1 - i] ? 1 : 0) << i;
  for (let i = 8; i < 15; i++) copia2 |= (modulos[size - 15 + i][8] ? 1 : 0) << i;
  assert.equal(copia2, esperado);
  // Proporción de módulos oscuros razonable (la máscara la acerca al 50 %)
  const oscuros = modulos.flat().filter(Boolean).length;
  assert.ok(oscuros / (size * size) > 0.35 && oscuros / (size * size) < 0.65);
  assert.ok(penalizacion(modulos) >= 0);
});

test("los datos se pueden volver a leer de la matriz (desenmascarando) y son los códigos originales", () => {
  const texto = "HELLO WORLD";
  const { version, size, mascara, modulos } = matrizQr(texto);
  assert.equal(version, 1);
  assert.equal(size, 21);
  const codigos = codigosDe(texto, version);
  // Módulos de función de la versión 1: buscadores + separadores, sincronización, formato, módulo oscuro
  const funcion = Array.from({ length: size }, () => new Array(size).fill(false));
  const marca = (x, y) => {
    if (x >= 0 && y >= 0 && x < size && y < size) funcion[y][x] = true;
  };
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) marca(cx + dx, cy + dy);
  for (let i = 0; i < size; i++) {
    marca(6, i);
    marca(i, 6);
  }
  for (let i = 0; i <= 8; i++) {
    marca(8, i);
    marca(i, 8);
  }
  for (let i = 0; i < 8; i++) {
    marca(size - 1 - i, 8);
    marca(8, size - 1 - i);
  }
  const bits = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!funcion[y][x]) bits.push(modulos[y][x] !== mascaraActiva(mascara, x, y) ? 1 : 0);
      }
    }
  }
  const leidos = [];
  for (let i = 0; i + 8 <= codigos.length * 8; i += 8) leidos.push(parseInt(bits.slice(i, i + 8).join(""), 2));
  assert.deepEqual(leidos, codigos);
});

test("SVG", () => {
  const svg = svgQr("padely", { ancho: 200, titulo: "Cancha <1>" });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 29 29" width="200" height="200"/);
  assert.match(svg, /<path d="M4 4h1v1h-1z/);
  assert.match(svg, /<title>Cancha 1><\/title>/);
});
