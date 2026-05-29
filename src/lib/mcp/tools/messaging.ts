import { z } from "zod";
import { getControl } from "../../orchestrator/control.ts";
import { getBus } from "../bus.ts";
import { jsonResult, errorResult, type ToolDef } from "./types.ts";

const SendSchema = z.object({
  to: z.string().min(1).max(80),
  text: z.string().min(1).max(8_000),
});

const sendMessage: ToolDef = {
  name: "send_message",
  description: "Send a message to one session's inbox. The recipient reads it with read_messages.",
  inputSchema: {
    type: "object",
    properties: {
      to: { type: "string", description: "Target session id." },
      text: { type: "string" },
    },
    required: ["to", "text"],
    additionalProperties: false,
  },
  async handle(args, ctx) {
    const parsed = SendSchema.safeParse(args);
    if (!parsed.success) return errorResult(`invalid_input: ${parsed.error.message}`);
    const target = await getControl().get(parsed.data.to);
    if (!target) return errorResult(`not_found: ${parsed.data.to}`);
    const msg = getBus().send(ctx.sessionId, parsed.data.to, parsed.data.text);
    return jsonResult({ delivered: true, id: msg.id, to: msg.to });
  },
};

const BroadcastSchema = z.object({ text: z.string().min(1).max(8_000) });

const broadcast: ToolDef = {
  name: "broadcast",
  description: "Send a message to every other live session.",
  inputSchema: {
    type: "object",
    properties: { text: { type: "string" } },
    required: ["text"],
    additionalProperties: false,
  },
  async handle(args, ctx) {
    const parsed = BroadcastSchema.safeParse(args);
    if (!parsed.success) return errorResult(`invalid_input: ${parsed.error.message}`);
    const ids = (await getControl().list()).map((s) => s.id);
    const delivered = getBus().broadcast(ctx.sessionId, ids, parsed.data.text);
    return jsonResult({ delivered });
  },
};

const ReadSchema = z.object({ peek: z.boolean().optional() });

const readMessages: ToolDef = {
  name: "read_messages",
  description: "Read (and by default clear) the calling session's inbox.",
  inputSchema: {
    type: "object",
    properties: { peek: { type: "boolean", description: "If true, do not clear the inbox." } },
    additionalProperties: false,
  },
  async handle(args, ctx) {
    const parsed = ReadSchema.safeParse(args ?? {});
    if (!parsed.success) return errorResult(`invalid_input: ${parsed.error.message}`);
    if (!ctx.sessionId) return errorResult("no calling session id (missing x-cockpit-session header)");
    const messages = getBus().read(ctx.sessionId, !parsed.data.peek);
    return jsonResult({ count: messages.length, messages });
  },
};

export const messagingTools: readonly ToolDef[] = [sendMessage, broadcast, readMessages];
