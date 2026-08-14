export const ALLOWED_DOCUMENT_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "txt",
  "json",
]);

export const ALLOWED_DOCUMENT_TYPES_LABEL = "PDF, DOC, DOCX, TXT, JSON";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const MAX_UPLOAD_LABEL = "10 MB";

export function fileExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

export function isAllowedDocumentFilename(filename: string): boolean {
  return ALLOWED_DOCUMENT_EXTENSIONS.has(fileExtension(filename));
}

function startsWithBytes(bytes: Uint8Array, signature: number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((byte, index) => bytes[index] === byte);
}

export function matchesDocumentSignature(
  filename: string,
  bytes: Uint8Array,
): boolean {
  switch (fileExtension(filename)) {
    case "pdf":
      return startsWithBytes(bytes, [0x25, 0x50, 0x44, 0x46]); // %PDF
    case "docx":
      return startsWithBytes(bytes, [0x50, 0x4b]); // ZIP container
    case "doc":
      return startsWithBytes(bytes, [0xd0, 0xcf, 0x11, 0xe0]); // OLE container
    case "txt":
    case "json":
      return !bytes.subarray(0, 1024).includes(0);
    default:
      return false;
  }
}
