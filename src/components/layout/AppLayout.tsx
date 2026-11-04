import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { focusPageHeading } from "@/components/common/page-focus";
import { Header } from "./Header";
import { Footer } from "./Footer";

export function AppLayout() {
  const { pathname } = useLocation();
  // The first load keeps the browser's own focus and scroll; only a route
  // change inside the app moves them. Comparing paths, not counting runs,
  // keeps StrictMode's double effect from counting as a change.
  const shown = useRef(pathname);
  useEffect(() => {
    if (shown.current === pathname) return;
    shown.current = pathname;
    focusPageHeading();
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-900 text-slate-100">
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
