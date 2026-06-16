import React from "react";
import ReactDOM from "react-dom/client";
import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";
import App from "./App";
import { applyTheme } from "./lib/applyTheme";
import { getInitialTheme } from "./store/useTheme";
import { config } from "./config";
import "./styles.css";

// Skin :root before first paint so there's no theme flash, and sync the title.
applyTheme(getInitialTheme());
document.title = config.brand.name;

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL as string);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ConvexAuthProvider client={convex}>
      <App />
    </ConvexAuthProvider>
  </React.StrictMode>
);
