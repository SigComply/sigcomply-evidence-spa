// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
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
    expect(screen.queryByText("Select your framework")).toBeNull();
    // One framework: a static label, no switcher.
    expect(screen.queryByRole("group", { name: "Framework" })).toBeNull();
    expect(screen.getByText("SOC 2 Type II")).toBeTruthy();
  });

  it("asks once for a framework and remembers the choice", async () => {
    const user = userEvent.setup();
    await renderDashboard(["soc2", "iso27001"], {
      "data/catalogs/soc2.json": catalog("soc2", "SOC 2 acknowledgment"),
      "data/catalogs/iso27001.json": catalog("iso27001", "ISO acknowledgment"),
    });
    expect(await screen.findByText("Select your framework")).toBeTruthy();
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: /ISO/ }));
    expect(await screen.findByText("ISO acknowledgment")).toBeTruthy();
    expect(localStorage.getItem("sigcomply:framework")).toBe("iso27001");
  });

  it("opens the stored framework without asking", async () => {
    localStorage.setItem("sigcomply:framework", "iso27001");
    await renderDashboard(["soc2", "iso27001"], {
      "data/catalogs/iso27001.json": catalog("iso27001", "ISO acknowledgment"),
    });
    expect(await screen.findByText("ISO acknowledgment")).toBeTruthy();
    expect(screen.queryByText("Select your framework")).toBeNull();
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

  it("shows the framework labels in the switcher, not their ids, and marks the active one", async () => {
    localStorage.setItem("sigcomply:framework", "iso27001");
    await renderDashboard(["soc2", "iso27001"], {
      "data/catalogs/iso27001.json": catalog("iso27001", "ISO acknowledgment"),
    });
    await screen.findByText("ISO acknowledgment");
    const switcher = screen.getByRole("group", { name: "Framework" });
    expect(switcher.textContent).toContain("ISO 27001");
    expect(switcher.textContent).toContain("SOC 2 Type II");
    expect(switcher.textContent).not.toContain("iso27001");
    expect(switcher.textContent).not.toContain("soc2");
    const iso = within(switcher).getByRole("button", { name: "ISO 27001" });
    const soc2 = within(switcher).getByRole("button", { name: "SOC 2 Type II" });
    expect(iso.getAttribute("aria-pressed")).toBe("true");
    expect(soc2.getAttribute("aria-pressed")).toBe("false");
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
      // The period card shows the yearly window; the row carries it as the
      // period key's tooltip instead of repeating it.
      expect(screen.getAllByText("Jan 1 – Dec 31, 2026 (UTC)")).toHaveLength(1);
      const row = screen.getByTestId("evidence-row");
      expect(within(row).getByText("2026").getAttribute("title")).toBe("Jan 1 – Dec 31, 2026 (UTC)");
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
    await user.click(
      within(screen.getByRole("group", { name: "Framework" })).getByRole("button", { name: "ISO 27001" }),
    );
    expect(await screen.findByText("ISO acknowledgment")).toBeTruthy();
    expect((screen.getByRole("textbox", { name: /search attestations/i }) as HTMLInputElement).value).toBe("");
  });

  it("keeps a search chip's case and offers the period tiles as filters only with several frequencies", async () => {
    const user = userEvent.setup();
    const cat = catalog("soc2", "SOC 2 acknowledgment");
    cat.entries.push({ ...cat.entries[0], id: "soc2_monthly", name: "Monthly review", frequency: "monthly" });
    await renderDashboard(["soc2"], { "data/catalogs/soc2.json": cat });
    await screen.findByText("SOC 2 acknowledgment");
    const monthly = screen.getByRole("button", { name: /^monthly/i });
    expect(monthly.getAttribute("aria-pressed")).toBe("false");
    await user.click(monthly);
    expect(monthly.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByText("SOC 2 acknowledgment")).toBeNull();
    expect(screen.getByText("Monthly review")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Remove filter monthly" }));
    await user.type(screen.getByRole("textbox", { name: /search attestations/i }), "SOC");
    const chip = screen.getByRole("button", { name: "Remove filter “SOC”" });
    expect(chip.outerHTML).not.toContain("capitalize");
  });

  it("does not make a lone period tile a no-op filter", async () => {
    await renderDashboard(["soc2"], {
      "data/catalogs/soc2.json": catalog("soc2", "SOC 2 acknowledgment"),
    });
    await screen.findByText("SOC 2 acknowledgment");
    expect(screen.queryByRole("button", { name: /^yearly/i })).toBeNull();
    const periods = screen.getByRole("region", { name: "Current periods" });
    expect(within(periods).getByText("yearly")).toBeTruthy();
    expect(within(periods).queryByRole("button")).toBeNull();
  });
});
