export const ALLOWED_DOCUMENT_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "txt",
  "json",
]);

export const ALLOWED_DOCUMENT_TYPES_LABEL = "PDF, DOC, DOCX, TXT, JSON";

export function fileExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

export function isAllowedDocumentFilename(filename: string): boolean {
  return ALLOWED_DOCUMENT_EXTENSIONS.has(fileExtension(filename));
}
