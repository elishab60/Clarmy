// Outbound email via the Resend HTTP API (native fetch, no npm dependency).
// The API key and default sender/recipient are read server side from the secret
// store, so callers (including the digest agent) never see RESEND_API_KEY.

import { getSecret } from "./secrets.ts";
import { createLogger } from "../util/logger.ts";

const log = createLogger("email");

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface SendEmailInput {
  readonly to?: string;
  readonly from?: string;
  readonly subject: string;
  readonly html?: string;
  readonly text?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<{ id: string }> {
  const key = getSecret("RESEND_API_KEY");
  if (!key) {
    throw new Error("RESEND_API_KEY secret is not set. Store it with the set_secret tool first.");
  }
  const to = input.to ?? getSecret("COCKPIT_REPORT_TO") ?? undefined;
  const from = input.from ?? getSecret("COCKPIT_REPORT_FROM") ?? undefined;
  if (!to) throw new Error("no recipient: pass `to` or set the COCKPIT_REPORT_TO secret");
  if (!from) throw new Error("no sender: pass `from` or set the COCKPIT_REPORT_FROM secret (must be on a Resend-verified domain)");
  if (!input.html && !input.text) throw new Error("email needs html or text");

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject: input.subject, html: input.html, text: input.text }),
  });
  const bodyText = await res.text();
  if (!res.ok) {
    log.warn("resend send failed", { status: res.status, body: bodyText.slice(0, 300) });
    throw new Error(`resend responded ${res.status}: ${bodyText}`);
  }
  let id = "";
  try { id = (JSON.parse(bodyText) as { id?: string }).id ?? ""; } catch { /* keep empty */ }
  log.info("email sent", { to, id });
  return { id };
}
