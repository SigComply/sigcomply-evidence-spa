import { Document, Page, Text, View } from "@react-pdf/renderer";
import { styles } from "./styles";
import { Header, Footer } from "./shared";
import { metadataKeywords } from "./metadata";
import type { PdfInput } from "@/types/pdf-input";

interface Props {
  input: PdfInput;
}

// DeclarationPdf renders a single-statement attestation: the catalog's
// `declaration_text` in a bordered block, the user's accepted yes/no, and
// a signature line carrying `completed_by` + `completed_at`.
//
// Both visible body and PDF Info dict carry the same data so a future
// text-extractor can find it without parsing prose.
export function DeclarationPdf({ input }: Props) {
  return (
    <Document
      title={input.entry_name}
      subject={input.evidence_id}
      author={input.completed_by || "SigComply Evidence SPA"}
      keywords={metadataKeywords(input)}
      producer="SigComply Evidence SPA"
      creator="SigComply Evidence SPA"
    >
      <Page size="A4" style={styles.page}>
        <Header input={input} />

        <Text style={styles.sectionHeading}>Declaration</Text>
        {input.declaration_text ? (
          <View style={styles.declarationBox}>
            <Text>{input.declaration_text}</Text>
          </View>
        ) : null}

        <Text style={styles.acceptedLine}>
          Accepted: {input.accepted ? "YES" : "NO"}
        </Text>

        <Text style={styles.signatureLine}>
          Signed by {input.completed_by || "—"} on {input.completed_at}
        </Text>

        <Footer input={input} />
      </Page>
    </Document>
  );
}
