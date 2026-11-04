// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { AppLayout } from "./AppLayout";
import { PageHeader } from "@/components/common/PageHeader";
import { NotFound } from "@/pages/NotFound";

function First() {
  return (
    <>
      <PageHeader title="First page" />
      <Link to="/second">Go to second</Link>
      <Link to="/late">Go to late</Link>
      <Link to="/missing">Go to missing</Link>
    </>
  );
}

// A page whose heading appears only after its data loads, like a form.
function Late() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), 10);
    return () => clearTimeout(t);
  }, []);
  return ready ? <PageHeader title="Late page" /> : <p>Loading</p>;
}

function renderApp() {
  render(
    <MemoryRouter initialEntries={["/"]}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<First />} />
          <Route path="/second" element={<PageHeader title="Second page" />} />
          <Route path="/late" element={<Late />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe("AppLayout route focus", () => {
  beforeEach(() => {
    vi.stubGlobal("scrollTo", vi.fn());
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("leaves focus alone on the first load", () => {
    renderApp();
    expect(document.activeElement).toBe(document.body);
  });

  it("scrolls up and focuses the new page's heading on a route change", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("link", { name: "Go to second" }));
    const heading = screen.getByRole("heading", { level: 1, name: "Second page" });
    expect(document.activeElement).toBe(heading);
    expect(heading.getAttribute("tabindex")).toBe("-1");
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it("focuses a heading that renders after the route change", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("link", { name: "Go to late" }));
    const heading = await screen.findByRole("heading", { level: 1, name: "Late page" });
    expect(document.activeElement).toBe(heading);
  });

  it("titles and focuses the 404 page", async () => {
    const user = userEvent.setup();
    renderApp();
    await user.click(screen.getByRole("link", { name: "Go to missing" }));
    expect(document.activeElement).toBe(screen.getByRole("heading", { level: 1, name: "Page not found" }));
    expect(document.title).toBe("Page not found · SigComply Evidence");
  });
});
