/// <reference types="vitest" />
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const BASE = "/trading-dashboard/";
// data/ à la racine du repo : écrit UNIQUEMENT par tools/export_results.py
// (trading-bot). Jamais copié ailleurs dans le repo : servi tel quel en dev,
// copié dans dist/data/ au build seulement.
export const DATA_DIR = path.join(ROOT, "data");

const TYPES: Record<string, string> = {
  ".json": "application/json; charset=utf-8",
  ".parquet": "application/octet-stream",
};

/** Sert <repo>/data/ sous <base>data/ en dev ; le copie dans dist/data/ au build. */
export function dataDir(dir: string = DATA_DIR): Plugin {
  let outDir = "";
  let isBuild = false;
  return {
    name: "trading-dashboard-data",
    configResolved(cfg) {
      outDir = path.resolve(cfg.root, cfg.build.outDir);
      // Vitest déclenche aussi closeBundle (outDir fictif) : copie au seul vrai build.
      isBuild = cfg.command === "build" && !process.env.VITEST;
    },
    configureServer(server) {
      const prefix = `${BASE}data/`;
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        if (!url.startsWith(prefix)) return next();
        const file = path.resolve(dir, decodeURIComponent(url.slice(prefix.length)));
        if (!file.startsWith(dir + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          res.statusCode = 404;
          res.end("introuvable");
          return;
        }
        res.setHeader("Content-Type", TYPES[path.extname(file)] ?? "application/octet-stream");
        res.setHeader("Cache-Control", "no-store");
        fs.createReadStream(file).pipe(res);
      });
    },
    closeBundle() {
      if (!isBuild || !outDir || !fs.existsSync(dir)) return;
      fs.cpSync(dir, path.join(outDir, "data"), { recursive: true });
    },
  };
}

export default defineConfig({
  base: BASE,
  publicDir: false,
  plugins: [react(), dataDir()],
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
