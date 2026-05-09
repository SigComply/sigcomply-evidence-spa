import { Text, View } from "@react-pdf/renderer";
import { styles } from "./styles";
import type { PdfInput } from "@/types/pdf-input";

interface HeaderProps {
  input: PdfInput;
}

// Header renders the title + control/framework subtitle and the metadata block.
// Keep the metadata block layout consistent — it doubles as the auditor's
// human-readable view of the same fields encoded in the PDF Info dictionary.
export function Header({ input }: HeaderProps) {
  return (
    <View>
      <Text style={styles.title}>{input.entry_name}</Text>
      <Text style={styles.subtitle}>
        {input.framework.toUpperCase()} · {input.control} · {input.severity}
      </Text>

      <View style={styles.metadataBlock}>
        <MetadataRow label="Evidence ID" value={input.evidence_id} />
        <MetadataRow label="Period" value={input.period} />
        <MetadataRow label="Frequency" value={input.frequency} />
        <MetadataRow label="Completed by" value={input.completed_by || "—"} />
        <MetadataRow label="Completed at" value={input.completed_at} />
      </View>
    </View>
  );
}

function MetadataRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metadataRow}>
      <Text style={styles.metadataLabel}>{label}</Text>
      <Text style={styles.metadataValue}>{value}</Text>
    </View>
  );
}

interface FooterProps {
  input: PdfInput;
}

export function Footer({ input }: FooterProps) {
  return (
    <View style={styles.footer} fixed>
      <Text>
        SigComply Evidence — {input.evidence_id} — {input.period}
      </Text>
      <Text
        render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
      />
    </View>
  );
}
