import { pdf } from "@react-pdf/renderer";
import { DeclarationPdf } from "./DeclarationPdf";
import { ChecklistPdf } from "./ChecklistPdf";
import type { PdfInput } from "@/types/pdf-input";

// renderEvidencePdf is the lazy-loaded entry point for PDF generation. The
// SPA imports this module dynamically inside the form-submit handler so the
// dashboard route is not weighed down by @react-pdf/renderer's ~400 KB gz
// runtime.
export async function renderEvidencePdf(input: PdfInput): Promise<Blob> {
  const doc =
    input.type === "checklist" ? (
      <ChecklistPdf input={input} />
    ) : (
      <DeclarationPdf input={input} />
    );
  return pdf(doc).toBlob();
}
