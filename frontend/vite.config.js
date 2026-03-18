import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

// Read APP_NAME from config.js at build time
function getAppName() {
  const src = readFileSync(resolve(__dirname, "src/config.js"), "utf-8");
  const shortMatch = src.match(/short:\s*"([^"]+)"/);
  const arMatch = src.match(/ar:\s*"([^"]+)"/);
  return {
    short: shortMatch?.[1] || "CheckTracker",
    ar: arMatch?.[1] || "",
  };
}

// Plugin: generate manifest.json from config.js at build time
function manifestPlugin() {
  return {
    name: "generate-manifest",
    writeBundle() {
      const app = getAppName();
      const manifest = {
        name: app.ar,
        short_name: app.short,
        description: "إدارة شيكات الإيجار العائلية",
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
      };
      writeFileSync(resolve(__dirname, "dist/manifest.json"), JSON.stringify(manifest, null, 2));
    },
  };
}

export default defineConfig({
  plugins: [react(), manifestPlugin()],
  base: "/rent-check-tracker/",
  build: { outDir: "dist" },
});
