import { StyleSheet } from "@react-pdf/renderer";

// Shared StyleSheet for every evidence.pdf the SPA generates. Keep this small
// and consistent across declaration/checklist documents — auditors should
// recognize SigComply-rendered evidence at a glance.
export const styles = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 40,
    fontSize: 11,
    fontFamily: "Helvetica",
    lineHeight: 1.4,
    color: "#111",
  },
  title: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 10,
    color: "#444",
    marginBottom: 16,
  },
  metadataBlock: {
    marginBottom: 20,
    padding: 10,
    borderWidth: 0.5,
    borderColor: "#ccc",
    borderRadius: 3,
  },
  metadataRow: {
    flexDirection: "row",
    marginBottom: 2,
  },
  metadataLabel: {
    width: 110,
    color: "#555",
    fontSize: 10,
  },
  metadataValue: {
    flex: 1,
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
  },
  sectionHeading: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    marginTop: 12,
    marginBottom: 8,
  },
  declarationBox: {
    padding: 12,
    borderWidth: 0.5,
    borderColor: "#666",
    borderRadius: 3,
    marginBottom: 16,
    backgroundColor: "#fafafa",
  },
  acceptedLine: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    marginBottom: 12,
  },
  signatureLine: {
    marginTop: 24,
    borderTopWidth: 0.5,
    borderTopColor: "#888",
    paddingTop: 6,
    fontSize: 10,
  },
  checklistItem: {
    flexDirection: "row",
    marginBottom: 8,
    paddingRight: 8,
  },
  checkbox: {
    width: 12,
    height: 12,
    borderWidth: 1,
    borderColor: "#444",
    marginRight: 8,
    marginTop: 2,
    textAlign: "center",
    fontSize: 10,
    lineHeight: 1,
  },
  checkboxChecked: {
    width: 12,
    height: 12,
    borderWidth: 1,
    borderColor: "#444",
    marginRight: 8,
    marginTop: 2,
    textAlign: "center",
    fontSize: 10,
    lineHeight: 1,
    backgroundColor: "#222",
    color: "#fff",
  },
  itemText: {
    flex: 1,
    fontSize: 11,
  },
  itemRequiredMarker: {
    color: "#a00",
    fontFamily: "Helvetica-Bold",
  },
  itemNotes: {
    marginTop: 2,
    marginLeft: 20,
    fontSize: 9,
    fontStyle: "italic",
    color: "#555",
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#888",
    flexDirection: "row",
    justifyContent: "space-between",
  },
});
