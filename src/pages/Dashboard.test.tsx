// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { serveJson } from "@/test/component-env";
import type { Catalog } from "@/types/catalog";

function catalog(framework: string, name: string): Catalog {
  return {
    framework,
    version: "1.0",
    entries: [
      {
        id: `${framework}_ack`,
        control: "C1",
        type: "declaration",
        frequency: "yearly",
        temporal_rule: "retrospective",
        grace_period: "30d",
        name,
        description: "d",
        severity: "medium",
        declaration_text: "I confirm.",
      },
      {
        id: `${framework}_upload`,
        control: "C2",
        type: "document_upload",
        frequency: "yearly",
        temporal_rule: "retrospective",
        grace_period: "30d",
        name: "An upload entry",
        description: "d",
        severity: "low",
      },
    ],
  };
}

async function renderDashboard(frameworks: string[], catalogs: Record<string, unknown>) {
  serveJson({ "config.json": { frameworks }, ...catalogs });
  const { loadConfig } = await import("@/config/runtime");
  await loadConfig();
  const { Dashboard } = await import("./Dashboard");
  render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

describe("Dashboard", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.resetModules();
    localStorage.clear();
  });

  it("lists attestations only, without a picker for one framework", async () => {
    await renderDashboard(["soc2"], {
      "data/catalogs/soc2.json": catalog("soc2", "SOC 2 acknowledgment"),
    });
    expect(await screen.findByText("SOC 2 acknowledgment")).toBeTruthy();
    expect(screen.queryByText("An upload entry")).toBeNull();
    expect(screen.queryByText("Select Your Framework")).toBeNull();
  });

  it("asks once for a framework and remembers the choice", async () => {
    const user = userEvent.setup();
    await renderDashboard(["soc2", "iso27001"], {
      "data/catalogs/soc2.json": catalog("soc2", "SOC 2 acknowledgment"),
      "data/catalogs/iso27001.json": catalog("iso27001", "ISO acknowledgment"),
    });
    expect(await screen.findByText("Select Your Framework")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /ISO/ }));
    expect(await screen.findByText("ISO acknowledgment")).toBeTruthy();
    expect(localStorage.getItem("sigcomply:framework")).toBe("iso27001");
  });

  it("opens the stored framework without asking", async () => {
    localStorage.setItem("sigcomply:framework", "iso27001");
    await renderDashboard(["soc2", "iso27001"], {
      "data/catalogs/iso27001.json": catalog("iso27001", "ISO acknowledgment"),
    });
    expect(await screen.findByText("ISO acknowledgment")).toBeTruthy();
    expect(screen.queryByText("Select Your Framework")).toBeNull();
  });

  it("still renders when localStorage throws", async () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
      setItem: () => {
        throw new DOMException("denied", "SecurityError");
      },
    });
    await renderDashboard(["soc2"], {
      "data/catalogs/soc2.json": catalog("soc2", "SOC 2 acknowledgment"),
    });
    expect(await screen.findByText("SOC 2 acknowledgment")).toBeTruthy();
  });

  it("shows an error when the catalog is missing", async () => {
    await renderDashboard(["soc2"], {});
    expect(await screen.findByText("Could not load the soc2 catalog")).toBeTruthy();
    expect(screen.getByText("Failed to load catalog for soc2")).toBeTruthy();
  });
});
