import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // "prompt": la versión nueva espera a que la app la active (main.jsx: toast "Hay una versión nueva" con
      // "Actualizar", o solo si nadie toca la pantalla 30 s y no hay formularios a medio escribir)
      registerType: "prompt",
      includeAssets: ["logo.png", "logo-dark.png", "apple-touch-icon.png"],
      manifest: {
        id: "/inicio",
        name: "Padely",
        short_name: "Padely",
        description: "Reservá canchas y jugá torneos de pádel",
        lang: "es-AR",
        start_url: "/inicio",
        scope: "/",
        categories: ["sports", "lifestyle"],
        display: "standalone",
        background_color: "#0b1220",
        theme_color: "#0b1220",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Assets con hash: precacheados (caché primero). index.html y la app shell: RED PRIMERO, con la copia en caché
        // solo sin conexión (así un deploy nuevo se ve en la próxima carga y nadie queda con el bundle viejo).
        // Firestore/Auth (googleapis) nunca pasan por el SW: los pedidos cross-origin van directo a la red.
        cacheId: "padely-v2",
        navigateFallback: null,
        globPatterns: ["**/*.{js,css,png,svg}"],
        globIgnores: ["**/index.html"],
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) => request.mode === "navigate" && url.origin === self.location.origin,
            handler: "NetworkFirst",
            options: { cacheName: "padely-shell-v2", networkTimeoutSeconds: 4, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: false,
      },
    }),
  ],
});
