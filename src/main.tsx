import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { loadConfig } from "@/config/runtime";
import { App } from "./App";
import "./index.css";

async function init() {
  await loadConfig();
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

init();
