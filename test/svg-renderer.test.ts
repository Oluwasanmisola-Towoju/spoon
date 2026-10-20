import { describe, it, expect } from "vitest";
import { renderWidget } from "../src/services/svg-renderer.js";
import type { WidgetData } from "../src/types/widget.js";

// a small helper so each test only specifies what it cares about.
function makeData(overrides: Partial<WidgetData> = {}): WidgetData {
  return {
    owner: "octocat",
    repo: "hello-world",
    forkCount: 1284,
    mergedPrTotal: 96,
    topForkers: [{ login: "ada", mergedPrCount: 1 }],
    ...overrides,
  };
}

describe("renderWidget", () => {
  it("produces an SVG containing the repo name and a formatted count", () => {
    const svg = renderWidget(makeData());
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("octocat/hello-world");
    expect(svg).toContain("1.3k");
  });

  it("escapes hostile input instead of injecting markup", () => {
    const svg = renderWidget(
      makeData({ topForkers: [{ login: "<script>alert(1)</script>", mergedPrCount: 1 }] })
    );
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
  });

  it("shows a friendly message when there are no forkers", () => {
    const svg = renderWidget(makeData({ topForkers: [] }));
    expect(svg).toContain("No forks yet");
  });

  it("uses singular wording for exactly one merged PR", () => {
    const svg = renderWidget(makeData());
    expect(svg).toContain("1 merged PR<");
  });
});