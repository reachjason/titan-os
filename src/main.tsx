import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { applyTheme } from "./lib/applyTheme";
import { getInitialTheme } from "./store/useTheme";
import { config } from "./config";
import "./styles.css";

// Skin :root before first paint so there's no theme flash, and sync the title.
applyTheme(getInitialTheme());
document.title = config.brand.name;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
