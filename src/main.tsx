import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import { AuthProvider } from "./context/AuthContext.tsx";

// ── Globaler 429 Guard ──────────────────────────────────────
// Verhindert dass Rate-Limit-Fehler zur Endlosschleife werden
let rateLimitHits = 0;
const RATE_LIMIT_THRESHOLD = 2;

window.addEventListener("unhandledrejection", (event) => {
  const msg = (
    event.reason?.message ??
    event.reason?.toString() ??
    ""
  ).toLowerCase();
  const isRateLimit =
    msg.includes("429") ||
    msg.includes("too many") ||
    msg.includes("rate limit") ||
    msg.includes("over_request_rate_limit") ||
    msg.includes("email rate limit");

  if (isRateLimit) {
    rateLimitHits++;
    event.preventDefault(); // Verhindert Console-Error
    if (rateLimitHits >= RATE_LIMIT_THRESHOLD) {
      console.warn(
        `⚠️ ShiftFlow: Rate-Limit erreicht (${rateLimitHits}x). ` +
          "Bitte 15 Minuten warten."
      );
    }
  }
});

// Register Service Worker
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then(() => {
        console.log("SW registered successfully");
      })
      .catch((err) => {
        console.log("SW nicht verfügbar", err);
      });
  });
}

const rootElement = document.getElementById("root")!;
const app = (
  <AuthProvider>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </AuthProvider>
);

// Entwicklung UND Produktion jetzt mit StrictMode (wurde behoben)
createRoot(rootElement).render(
  <StrictMode>{app}</StrictMode>
);
