import react from "@vitejs/plugin-react";
import { copyFileSync, createReadStream, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const rootDirectory = fileURLToPath(new URL(".", import.meta.url));
const widgetSource = resolve(rootDirectory, "../../dograh/ui/public/embed/dograh-widget.js");
const widgetRoute = "/embed/dograh-widget.js";

export default defineConfig({
  // The repo's single `.env` at the root is what docker-compose and the API read,
  // and it is where `VITE_API_BASE_URL` is defined. Without this, Vite looked only
  // in app/web, found nothing, and the dev build fell back to same-origin — so a
  // locally-run API on :3001 was unreachable from the dev server on :3000.
  // Only VITE_-prefixed keys are ever exposed to the client.
  envDir: resolve(rootDirectory, "../.."),
  plugins: [
    react(),
    {
      name: "dograh-widget",
      configureServer(server) {
        server.middlewares.use(widgetRoute, (_request, response) => {
          response.setHeader("Content-Type", "application/javascript; charset=utf-8");
          createReadStream(widgetSource).pipe(response);
        });
      },
      closeBundle() {
        const destination = resolve(rootDirectory, "dist/embed");
        mkdirSync(destination, { recursive: true });
        copyFileSync(widgetSource, resolve(destination, "dograh-widget.js"));
      },
    },
  ],
  server: {
    port: 3000,
  },
});
