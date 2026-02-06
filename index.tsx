import React from "react";
import { createRoot } from "react-dom/client";
import App from "./src/App";

import RequireAuth from "./src/components/RequireAuth"; // Pre-load to avoid missing chunks

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root container missing");
}

try {
  createRoot(container).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} catch (error: any) {
  console.error("Critical app crash:", error);
  container.innerHTML = `
    <div style="padding: 40px; color: #ef4444; font-family: sans-serif; text-align: center;">
      <h1 style="font-weight: 900;">Application Error</h1>
      <p style="color: #6b7280; margin-top: 10px;">${error.message || "An unknown error occurred during initialization."}</p>
      <div style="margin-top: 20px; padding: 20px; background: #f9fafb; border-radius: 20px; font-family: monospace; font-size: 12px; text-align: left; overflow: auto;">
        ${error.stack || ""}
      </div>
    </div>
  `;
}
