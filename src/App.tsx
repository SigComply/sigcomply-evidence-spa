import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Dashboard } from "@/pages/Dashboard";
import { EvidenceForm } from "@/pages/EvidenceForm";
import { Verify } from "@/pages/Verify";
import { NotFound } from "@/pages/NotFound";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Dashboard />} />
          <Route
            path="/evidence/:framework/:evidenceId"
            element={<EvidenceForm />}
          />
          <Route path="/verify" element={<Verify />} />
        </Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
