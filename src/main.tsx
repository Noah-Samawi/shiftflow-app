import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "./index.css";
import App from "./App.tsx";
import { AuthProvider } from "./context/AuthContext.tsx";

// ── Verhindert Auth-Dauerfeuer bei 429 ─────────────────────
let authErrorCount = 0;
const MAX_AUTH_ERRORS = 3;

window.addEventListener("unhandledrejection", (event) => {
  const msg = event.reason?.message ?? "";
  if (
    msg.includes("429") ||
    msg.includes("Too Many") ||
    msg.includes("rate limit") ||
    msg.includes("over_request_rate_limit")
  ) {
    authErrorCount++;
    if (authErrorCount >= MAX_AUTH_ERRORS) {
      console.warn(
        "ShiftFlow: Rate-Limit erkannt. Auth-Anfragen werden pausiert."
      );
      event.preventDefault();
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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </AuthProvider>
  </StrictMode>
);
