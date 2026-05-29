// One-off Resend deliverability test. Key comes from env (never hardcoded).
// Run: RESEND_API_KEY=xxx node scripts/resend-test.mjs
import { readFileSync } from "node:fs";

const key = process.env.RESEND_API_KEY;
if (!key) {
  console.error("RESEND_API_KEY env var required");
  process.exit(1);
}
const to = process.env.TEST_TO || "e.bajemon@tw3partners.com";
const from = process.env.TEST_FROM || "Cockpit <onboarding@resend.dev>";
const html = readFileSync(new URL("../previews/daily-digest.html", import.meta.url), "utf8");

const res = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    from,
    to,
    subject: "Digest quotidien 2026-05-29 (test Cockpit)",
    html,
  }),
});
console.log("HTTP", res.status);
console.log(await res.text());
