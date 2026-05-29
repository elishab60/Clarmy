import { describe, it, expect } from "vitest";
import { renderDigestEmail, type DigestData } from "../../src/lib/claude-code/email-template.ts";

const withData: DigestData = {
  date: "2026-05-29",
  totals: { sessions: 3, inputTokens: 1_000, outputTokens: 500, cost: 1.23 },
  projects: [
    { project: "alpha", cwd: "/Users/u/code/alpha", sessions: 2, inputTokens: 800, outputTokens: 400, cost: 1.0, summary: "Refactored the parser." },
    { project: "beta", cwd: "/Users/u/code/beta", sessions: 1, inputTokens: 200, outputTokens: 100, cost: 0.23, summary: "Fixed a flaky test." },
  ],
};

const empty: DigestData = {
  date: "2026-05-30",
  totals: { sessions: 0, inputTokens: 0, outputTokens: 0, cost: 0 },
  projects: [],
};

describe("renderDigestEmail", () => {
  it("builds a subject with sessions and cost", () => {
    const { subject } = renderDigestEmail(withData);
    expect(subject).toContain("2026-05-29");
    expect(subject).toContain("3 sessions");
    expect(subject).toContain("$1.23");
  });

  it("includes each project, its summary and a tilde-shortened path", () => {
    const { html, text } = renderDigestEmail(withData);
    expect(html).toContain("alpha");
    expect(html).toContain("Refactored the parser.");
    expect(html).toContain("~/code/alpha");
    expect(html).not.toContain("/Users/u/");
    expect(text).toContain("beta");
  });

  it("escapes HTML in summaries", () => {
    const evil: DigestData = {
      ...withData,
      projects: [{ ...withData.projects[0]!, summary: "<script>alert(1)</script>" }],
    };
    const { html } = renderDigestEmail(evil);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("renders the roast on an empty day", () => {
    const { html, subject } = renderDigestEmail(empty);
    expect(subject).toContain("rien fait");
    expect(html).toContain("faignon travaille pas les pieds");
  });
});
