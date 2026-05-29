// Renders the digest email template to static HTML files for visual review.
// Run: node --experimental-transform-types scripts/preview-digest-email.ts
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderDigestEmail, SAMPLE_DIGEST, type DigestData } from "../src/lib/claude-code/email-template.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "previews");
mkdirSync(outDir, { recursive: true });

const empty: DigestData = {
  date: "2026-05-30",
  generatedAt: "2026-05-30 17:00",
  totals: { sessions: 0, inputTokens: 0, outputTokens: 0, cost: 0 },
  projects: [],
};

const cases: Array<{ name: string; data: DigestData }> = [
  { name: "daily-digest", data: SAMPLE_DIGEST },
  { name: "daily-digest-empty", data: empty },
];

for (const c of cases) {
  const { subject, html } = renderDigestEmail(c.data);
  const path = join(outDir, `${c.name}.html`);
  writeFileSync(path, html, "utf8");
  console.log(`wrote ${path}  subject="${subject}"`);
}
