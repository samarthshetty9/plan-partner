import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: "::",
    port: 8082,
    hmr: {
      overlay: false,
    },
    proxy: {
      "/api": { target: "http://localhost:3002", changeOrigin: true },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["pwa-icon.svg", "favicon.ico", "apple-touch-icon.png", "placeholder.svg"],
      manifest: {
        name: "Mediimate Patient",
        short_name: "Mediimate",
        description: "Your health at a glance — chat with AI, log meals, vitals, and stay connected with your doctor.",
        start_url: "/patient",
        display: "standalone",
        orientation: "portrait-primary",
        background_color: "#0f172a",
        theme_color: "#0d9488",
        scope: "/",
        icons: [
          { src: "/pwa-192.png", type: "image/png", sizes: "192x192", purpose: "any" },
          { src: "/pwa-512.png", type: "image/png", sizes: "512x512", purpose: "any" },
          { src: "/pwa-512.png", type: "image/png", sizes: "512x512", purpose: "maskable" },
          { src: "/pwa-icon.svg", type: "image/svg+xml", sizes: "any" },
        ],
        categories: ["health", "medical", "lifestyle"],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/],
        runtimeCaching: [
          // auth/me is intentionally NOT cached — stale tokens cause phantom logouts
          {
            urlPattern: /\/api\/me\/(gamification|vitals|food_logs|medication-log|appointments|health-notes)/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "patient-data-cache",
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
              networkTimeoutSeconds: 8,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/.*\/api\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              expiration: { maxEntries: 64, maxAgeSeconds: 120 },
              networkTimeoutSeconds: 10,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: true },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
