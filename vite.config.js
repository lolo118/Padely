import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["logo.png", "logo-dark.png", "apple-touch-icon.png"],
      manifest: {
        name: "Padely",
        short_name: "Padely",
        description: "Reservá canchas y jugá torneos de pádel",
        lang: "es-AR",
        start_url: "/inicio",
        display: "standalone",
        background_color: "#0f172a",
        theme_color: "#0f172a",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Solo se precachean los assets del build. Firestore/Auth (googleapis) nunca pasan por el SW:
        // no hay runtimeCaching y los pedidos cross-origin se dejan ir a la red.
        navigateFallback: "/index.html",
        globPatterns: ["**/*.{js,css,html,png,svg}"],
        runtimeCaching: [],
      },
    }),
  ],
});
