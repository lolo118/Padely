// tests/e2e/publicas.spec.js — humo de las páginas públicas (P3-13). Lee datos públicos de Firestore (club y torneo
// de prueba de padely-dev); no escribe nada. Cada página: se ve el contenido clave y no hay errores en la consola.
import { expect, test } from "@playwright/test";

const CLUB = globalThis.process?.env?.E2E_CLUB_ID || "evOKh8Ktaqjpl1VgNkdI"; // Club Padely Central (padely-dev)
const TORNEO = globalThis.process?.env?.E2E_TORNEO_ID || "xMfGZrUgI2iKIU8VklBm"; // "Prueba Sede" (padely-dev)

// Errores de consola que no son de la app (extensiones, favicon de terceros)
const IGNORAR = [/favicon/i, /chrome-extension/i];

function vigilarConsola(page) {
  const errores = [];
  page.on("console", (m) => {
    if (m.type() === "error" && !IGNORAR.some((r) => r.test(m.text()))) errores.push(m.text());
  });
  page.on("pageerror", (e) => errores.push(`pageerror: ${e.message}`));
  return errores;
}

test("landing: hero, precios para clubes y footer", async ({ page }) => {
  const errores = vigilarConsola(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Precios para clubes/ })).toBeVisible();
  await expect(page.getByText("$ 35.000").first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Términos y condiciones" })).toBeVisible();
  expect(errores).toEqual([]);
});

test("club público: nombre, grilla y título de la pestaña", async ({ page }) => {
  const errores = vigilarConsola(page);
  await page.goto(`/club/${CLUB}`);
  await expect(page.getByRole("heading", { name: /Club Padely Central/ }).first()).toBeVisible({ timeout: 15000 });
  await expect(page).toHaveTitle(/Club Padely Central · Padely/);
  expect(errores).toEqual([]);
});

test("torneo público: nombre y título de la pestaña", async ({ page }) => {
  const errores = vigilarConsola(page);
  await page.goto(`/torneos/${TORNEO}`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 15000 });
  await expect(page).toHaveTitle(/· Padely$/);
  expect(errores).toEqual([]);
});

test("estado: sin aviso dice que todo funciona", async ({ page }) => {
  const errores = vigilarConsola(page);
  await page.goto("/estado");
  await expect(page.getByRole("heading", { name: "Estado de Padely" })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/Todo funciona normalmente|Hay un aviso/)).toBeVisible();
  expect(errores).toEqual([]);
});

test("términos: sección de planes", async ({ page }) => {
  const errores = vigilarConsola(page);
  await page.goto("/terminos");
  await expect(page.getByText("4 bis. Planes para clubes")).toBeVisible();
  expect(errores).toEqual([]);
});

test("ruta inexistente: 404 en castellano", async ({ page }) => {
  await page.goto("/esto-no-existe");
  await expect(page.getByText("Esta página no existe")).toBeVisible({ timeout: 15000 });
});
