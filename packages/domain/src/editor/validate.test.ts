import { describe, expect, it } from "vitest";
import { createDefaultEditorProject } from "./projectFactory.js";
import { validateEditorProject } from "./validate.js";

describe("validateEditorProject", () => {
  it("accepts default project", () => {
    const p = createDefaultEditorProject();
    expect(validateEditorProject(p)).toEqual([]);
  });
});
