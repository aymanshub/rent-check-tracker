import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { APP_NAME } from "./config";
import "./styles/global.css";

// Set HTML title + apple meta from config (single source of truth)
document.title = APP_NAME.short;
const appleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
if (appleMeta) appleMeta.content = APP_NAME.short;

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// Register service worker for PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/rent-check-tracker/sw.js").catch(() => {
      // SW registration failed — non-critical
    });
  });
}
