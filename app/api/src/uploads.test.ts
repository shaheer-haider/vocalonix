import { describe, expect, it } from "bun:test";

import {
  ALLOWED_DOCUMENT_EXTENSIONS,
  fileExtension,
  isAllowedDocumentFilename,
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
});
