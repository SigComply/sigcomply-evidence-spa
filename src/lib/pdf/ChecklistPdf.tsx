import { Document, Page, Text, View } from "@react-pdf/renderer";
import { styles } from "./styles";
import { Header, Footer } from "./shared";
import { metadataKeywords } from "./metadata";
import type { PdfInput } from "@/types/pdf-input";

interface Props {
  input: PdfInput;
}

// ChecklistPdf renders a multi-item user attestation: each catalog item with
// a drawn checkbox, the item text, an asterisk for required items, and an
// optional notes line if the user provided one.
//
// A checklist is conceptually a multi-point declaration — the user is
// attesting that each listed step has been performed. The signature line at
// the bottom carries `completed_by` + `completed_at`.
export function ChecklistPdf({ input }: Props) {
  const items = input.items ?? [];

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

        <Text style={styles.sectionHeading}>Checklist</Text>

        {items.length === 0 ? (
          <Text style={{ fontSize: 10, color: "#666" }}>
            (No items in this checklist.)
          </Text>
        ) : (
          items.map((item) => (
            <View key={item.id} wrap={false}>
              <View style={styles.checklistItem}>
                <Text
                  style={item.checked ? styles.checkboxChecked : styles.checkbox}
                >
                  {item.checked ? "X" : " "}
                </Text>
                <Text style={styles.itemText}>
                  {item.text}
                  {item.required ? (
                    <Text style={styles.itemRequiredMarker}> *</Text>
                  ) : null}
                </Text>
              </View>
              {item.notes ? (
                <Text style={styles.itemNotes}>Notes: {item.notes}</Text>
              ) : null}
            </View>
          ))
        )}

        <Text style={styles.signatureLine}>
          Signed by {input.completed_by || "—"} on {input.completed_at}
        </Text>

        <Footer input={input} />
      </Page>
    </Document>
  );
}
