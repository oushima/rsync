import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import './i18n';

const showFatalError = (label: string, error: unknown) => {
  const root = document.getElementById("root");
  if (!root) return;
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error);
  root.innerHTML = `
    <div style="padding:24px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
      <h2 style="margin:0 0 12px;font-size:18px;">${label}</h2>
      <pre style="white-space:pre-wrap;word-break:break-word;background:#f6f6f6;padding:12px;border-radius:8px;">${message}</pre>
    </div>
  `;
};

window.addEventListener("error", (event) => {
  showFatalError("App error", event.error ?? event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  showFatalError("Unhandled promise rejection", event.reason);
});

// Initialize theme from localStorage or system preference
const initializeTheme = () => {
  const stored = localStorage.getItem('rsync-settings');
  let theme = 'system';
  
  if (stored) {
    try {
      const settings = JSON.parse(stored);
      theme = settings.state?.theme || 'system';
    } catch {
      // Ignore parse errors
    }
  }
  
  if (theme === 'system') {
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
  } else {
    document.documentElement.setAttribute('data-theme', theme);
  }
};

initializeTheme();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
