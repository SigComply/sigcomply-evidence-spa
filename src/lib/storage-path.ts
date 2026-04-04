export function computeUploadPath(
  prefix: string,
  framework: string,
  evidenceId: string,
  period: string
): string {
  return `${prefix}/${framework}/${evidenceId}/${period}/evidence.json`;
}
