import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// The app's HTML entry is `app.html`, not `index.html`. Root `index.html` is
// reserved for the GitHub Pages landing page and must stay outside the app
// build. The Tauri window loads `app.html` via `app.windows[].url` in
// tauri.conf.json.
const appEntry = fileURLToPath(new URL("./app.html", import.meta.url));

// https://vite.dev/config/
export default defineConfig(async () => ({
  build: {
    rollupOptions: {
      input: appEntry,
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
