import { z } from "zod";
import { setSecret, listSecretKeys, deleteSecret, isValidSecretKey } from "../../claude-code/secrets.ts";
import { jsonResult, errorResult, type ToolDef } from "./types.ts";

const SetSchema = z.object({ key: z.string().min(1).max(128), value: z.string().min(1).max(20_000) });
const DeleteSchema = z.object({ key: z.string().min(1).max(128) });

const setSecretTool: ToolDef = {
  name: "set_secret",
  description: "Store an encrypted secret (e.g. an API key) for later injection into cron sessions or use by server-side tools. The value is encrypted at rest and never echoed back.",
  inputSchema: {
    type: "object",
    properties: {
      key: { type: "string", description: "Env-var style name: letters, digits, underscore; not starting with a digit." },
      value: { type: "string", description: "The secret value. Encrypted at rest, never returned." },
    },
    required: ["key", "value"],
    additionalProperties: false,
  },
  async handle(args) {
    const parsed = SetSchema.safeParse(args);
    if (!parsed.success) return errorResult(`invalid_input: ${parsed.error.message}`);
    if (!isValidSecretKey(parsed.data.key)) return errorResult(`invalid_key: "${parsed.data.key}" must match [A-Za-z_][A-Za-z0-9_]*`);
    const r = setSecret(parsed.data.key, parsed.data.value);
    return jsonResult({ ok: true, key: r.key, updatedAt: r.updatedAt });
  },
};

const listSecretsTool: ToolDef = {
  name: "list_secrets",
  description: "List stored secret keys with their last-updated time. Never returns the secret values.",
  inputSchema: { type: "object", properties: {}, additionalProperties: false },
  async handle() {
    const keys = listSecretKeys();
    return jsonResult({ count: keys.length, keys });
  },
};

const deleteSecretTool: ToolDef = {
  name: "delete_secret",
  description: "Delete a stored secret by key.",
  inputSchema: {
    type: "object",
    properties: { key: { type: "string" } },
    required: ["key"],
    additionalProperties: false,
  },
  async handle(args) {
    const parsed = DeleteSchema.safeParse(args);
    if (!parsed.success) return errorResult(`invalid_input: ${parsed.error.message}`);
    const deleted = deleteSecret(parsed.data.key);
    return jsonResult({ deleted, key: parsed.data.key });
  },
};

export const secretTools: readonly ToolDef[] = [setSecretTool, listSecretsTool, deleteSecretTool];
