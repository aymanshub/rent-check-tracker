import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

// Read APP_NAME fields from config.js at build time
function getAppName() {
  const src = readFileSync(resolve(__dirname, "src/config.js"), "utf-8");
  const get = (key) => {
    const m = src.match(new RegExp(`${key}:\\s*"([^"]+)"`));
    return m?.[1] || "";
  };
  return { short: get("short"), ar: get("ar"), description: get("description") };
}

function buildManifest() {
  const app = getAppName();
  return JSON.stringify({
    name: app.ar,
    short_name: app.short,
    description: app.description,
    start_url: "/rent-check-tracker/",
    scope: "/rent-check-tracker/",
    display: "standalone",
    background_color: "#f5f0e8",
    theme_color: "#1a6b5a",
    orientation: "portrait",
    icons: [
      { src: "/rent-check-tracker/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/rent-check-tracker/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  }, null, 2);
}

// Plugin: generate manifest.json from config.js
function manifestPlugin() {
  return {
    name: "generate-manifest",
    // Dev: regenerate public/manifest.json on server start
    configureServer() {
      writeFileSync(resolve(__dirname, "public/manifest.json"), buildManifest());
    },
    // Build: write to dist/
    writeBundle() {
      writeFileSync(resolve(__dirname, "dist/manifest.json"), buildManifest());
    },
  };
}

export default defineConfig({
  plugins: [react(), manifestPlugin()],
  base: "/rent-check-tracker/",
  build: { outDir: "dist" },
});
