import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { loadConfig } from "@/config/runtime";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { App } from "./App";
import "./index.css";

function mount(node: React.ReactNode) {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <ErrorBoundary>{node}</ErrorBoundary>
    </StrictMode>,
  );
}

async function init() {
  // loadConfig never rejects (it falls back to a built-in default on any
  // fetch/parse failure), but guard the whole bootstrap so a mounting error
  // still produces a message instead of a blank page.
  try {
    await loadConfig();
    mount(<App />);
  } catch (err) {
    console.error("Failed to start the app:", err);
    const root = document.getElementById("root");
    if (root) {
      root.textContent =
        "Failed to start. Please reload the page. If it persists, your browser may be unsupported.";
    }
  }
}

init();
