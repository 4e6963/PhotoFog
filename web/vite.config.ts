import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { VitePWA } from "vite-plugin-pwa";

const root = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");

export default defineConfig({
  root,
  build: { outDir: "dist", emptyOutDir: true },
  server: {
    port: 5173,
    // shared/ lives outside the Vite root
    fs: { allow: [".."] },
    proxy: { "/api": "http://localhost:8000" },
  },
  plugins: [
    preact(),
    VitePWA({
      strategies: "injectManifest",
      srcDir: "src",
      filename: "sw.ts",
      registerType: "prompt",
      injectRegister: false,
      devOptions: { enabled: true, type: "module" },
      injectManifest: { globPatterns: ["**/*.{js,css,html,svg,png}"] },
      // globPatterns already precaches everything in public/
      includeManifestIcons: false,
      manifest: {
        name: "PhotoFog – photo weather alerts",
        short_name: "PhotoFog",
        description: "Fog, colorful sunrise/sunset and sea-of-clouds forecasts for photographers.",
        theme_color: "#1e2a44",
        background_color: "#121826",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml" },
        ],
      },
    }),
  ],
});
