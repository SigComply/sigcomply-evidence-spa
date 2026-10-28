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

  it("shows the framework label in the dropdown, not its id", async () => {
    localStorage.setItem("sigcomply:framework", "iso27001");
    await renderDashboard(["soc2", "iso27001"], {
      "data/catalogs/iso27001.json": catalog("iso27001", "ISO acknowledgment"),
    });
    await screen.findByText("ISO acknowledgment");
    const trigger = screen.getByRole("combobox");
    expect(trigger.textContent).toContain("ISO 27001");
    expect(trigger.textContent).not.toContain("iso27001");
  });

  it("hides a lone category heading and chips that can't change the list", async () => {
    await renderDashboard(["soc2"], {
      "data/catalogs/soc2.json": catalog("soc2", "SOC 2 acknowledgment"),
    });
    await screen.findByText("SOC 2 acknowledgment");
    expect(screen.queryByText(/uncategorized/i)).toBeNull();
    expect(screen.queryByRole("button", { name: "Required only" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Medium" })).toBeNull();
  });

  it("labels every period range UTC and promises no grace upload", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.UTC(2026, 4, 15, 12)));
    try {
      await renderDashboard(["soc2"], {
        "data/catalogs/soc2.json": catalog("soc2", "SOC 2 acknowledgment"),
      });
      await screen.findByText("SOC 2 acknowledgment");
      // The period card and the row both show the yearly window.
      expect(screen.getAllByText("Jan 1 – Dec 31, 2026 (UTC)")).toHaveLength(2);
      expect(screen.queryByText(/grace/)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("names each row's copy button after its entry and links the guide", async () => {
    await renderDashboard(["soc2"], {
      "data/catalogs/soc2.json": catalog("soc2", "SOC 2 acknowledgment"),
    });
    await screen.findByText("SOC 2 acknowledgment");
    expect(screen.getByRole("button", { name: "Copy upload path for SOC 2 acknowledgment" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "the manual evidence guide" }).getAttribute("href")).toBe(
      "https://github.com/SigComply/sigcomply-cli/blob/main/docs/guides/manual-evidence.md",
    );
    expect(screen.getByText(/next scheduled run \(daily by\s+default\)/)).toBeTruthy();
  });

  it("clears the search when the framework changes", async () => {
    const user = userEvent.setup();
    localStorage.setItem("sigcomply:framework", "soc2");
    await renderDashboard(["soc2", "iso27001"], {
      "data/catalogs/soc2.json": catalog("soc2", "SOC 2 acknowledgment"),
      "data/catalogs/iso27001.json": catalog("iso27001", "ISO acknowledgment"),
    });
    await screen.findByText("SOC 2 acknowledgment");
    const search = screen.getByRole("textbox", { name: /search attestations/i });
    await user.type(search, "acknowledgment");
    await user.click(screen.getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "ISO 27001" }));
    expect(await screen.findByText("ISO acknowledgment")).toBeTruthy();
    expect((screen.getByRole("textbox", { name: /search attestations/i }) as HTMLInputElement).value).toBe("");
  });
});
