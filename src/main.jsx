import React from "react";
import { createRoot } from "react-dom/client";
import { AuthenticatedApp } from "./auth/AuthenticatedApp.tsx";
import "./cadence.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthenticatedApp />
  </React.StrictMode>,
);
