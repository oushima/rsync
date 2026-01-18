import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

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
