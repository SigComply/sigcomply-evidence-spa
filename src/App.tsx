import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Dashboard } from "@/pages/Dashboard";
import { EvidenceForm } from "@/pages/EvidenceForm";
import { Verify } from "@/pages/Verify";
import { NotFound } from "@/pages/NotFound";

export function App() {
  // basename carries the deploy sub-path (BASE_URL, e.g.
  // "/sigcomply-evidence-spa/" on GitHub Pages, "/" locally) so client-side
  // routing resolves correctly under a sub-path deploy. React Router tolerates
  // the trailing slash BASE_URL always carries.
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route
            path="/evidence/:framework/:evidenceId"
            element={<EvidenceForm />}
          />
          <Route path="/verify" element={<Verify />} />
          {/* Keep 404 inside the layout so a mistyped URL retains the
              header/nav and stays centered rather than dropping onto a
              chrome-less page. */}
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
