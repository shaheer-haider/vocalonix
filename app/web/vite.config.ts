import react from "@vitejs/plugin-react";
import { copyFileSync, createReadStream, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const rootDirectory = fileURLToPath(new URL(".", import.meta.url));
const widgetSource = resolve(rootDirectory, "../../dograh/ui/public/embed/dograh-widget.js");
const widgetRoute = "/embed/dograh-widget.js";

export default defineConfig({
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
