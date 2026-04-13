import { describe, expect, it } from "vitest";
import { createDefaultEditorProject } from "./projectFactory.js";
import { validateEditorProject } from "./validate.js";

describe("validateEditorProject", () => {
  it("accepts default project", () => {
    const p = createDefaultEditorProject();
    expect(validateEditorProject(p)).toEqual([]);
  });

  it("rejects unsupported reference image mime", () => {
    const p = createDefaultEditorProject();
    p.referenceImage = {
      fileName: "x.gif",
      mimeType: "image/gif",
      dataBase64: "R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==",
    };
    const issues = validateEditorProject(p);
    expect(issues.some((i) => i.path === "referenceImage.mimeType")).toBe(true);
  });

  it("accepts png reference image", () => {
    const p = createDefaultEditorProject();
    p.referenceImage = {
      fileName: "x.png",
      mimeType: "image/png",
      dataBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    };
    expect(validateEditorProject(p)).toEqual([]);
  });
});
