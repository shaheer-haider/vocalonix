import { describe, expect, it } from "bun:test";

import {
  ALLOWED_DOCUMENT_EXTENSIONS,
  fileExtension,
  isAllowedDocumentFilename,
  matchesDocumentSignature,
} from "./uploads";

describe("document upload validation", () => {
  it("accepts the supported document extensions case-insensitively", () => {
    for (const ext of ALLOWED_DOCUMENT_EXTENSIONS) {
      expect(isAllowedDocumentFilename(`notes.${ext}`)).toBe(true);
      expect(isAllowedDocumentFilename(`NOTES.${ext.toUpperCase()}`)).toBe(true);
    }
  });

  it("rejects unsupported and extensionless filenames", () => {
    expect(isAllowedDocumentFilename("script.exe")).toBe(false);
    expect(isAllowedDocumentFilename("archive.zip")).toBe(false);
    expect(isAllowedDocumentFilename("image.png")).toBe(false);
    expect(isAllowedDocumentFilename("README")).toBe(false);
  });

  it("reads the trailing extension of dotted filenames", () => {
    expect(fileExtension("report.final.PDF")).toBe("pdf");
    expect(fileExtension("plain")).toBe("plain");
  });

  it("matches file signatures against the claimed extension", () => {
    const pdf = new TextEncoder().encode("%PDF-1.7 rest");
    const zip = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
    const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1]);
    const text = new TextEncoder().encode('{"hello":"world"}');
    const binary = new Uint8Array([0x4d, 0x5a, 0x00, 0x01]);

    expect(matchesDocumentSignature("a.pdf", pdf)).toBe(true);
    expect(matchesDocumentSignature("a.docx", zip)).toBe(true);
    expect(matchesDocumentSignature("a.doc", ole)).toBe(true);
    expect(matchesDocumentSignature("a.txt", text)).toBe(true);
    expect(matchesDocumentSignature("a.json", text)).toBe(true);

    expect(matchesDocumentSignature("a.pdf", binary)).toBe(false);
    expect(matchesDocumentSignature("a.docx", pdf)).toBe(false);
    expect(matchesDocumentSignature("a.txt", binary)).toBe(false);
    expect(matchesDocumentSignature("a.exe", binary)).toBe(false);
  });
});
