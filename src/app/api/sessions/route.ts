import { NextResponse } from "next/server";
import { z } from "zod";
import { statSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { getControl } from "@/lib/orchestrator/control";
import { getDriver } from "@/lib/providers/registry";
import type { ApprovalMode, Effort, ModelId, ProviderId } from "@/lib/shared/types";
import { isModelId, MODEL_IDS, ALL_EFFORTS, providerOfModel } from "@/lib/shared/models";
import { PROVIDER_IDS } from "@/lib/shared/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SpawnSchema = z.object({
  provider: z.enum(PROVIDER_IDS).default("claude"),
  project: z.string().min(1).max(200),
  cwd: z.string().min(1).max(500),
  name: z.string().min(1).max(200),
  model: z.string().refine(isModelId, { message: `model must be one of: ${MODEL_IDS.join(", ")}` }),
  prompt: z.string().max(50_000),
  allowedTools: z.array(z.string().min(1).max(60)).max(40),
  approvalMode: z.enum(["auto", "prompt", "strict"]),
  branch: z.string().max(200).optional(),
  dangerouslySkipPermissions: z.boolean().optional(),
  resumeSessionId: z.string().min(1).max(80).optional(),
  effort: z.enum(ALL_EFFORTS).optional(),
}).refine((v) => v.prompt.length > 0 || !!v.resumeSessionId, {
  message: "prompt is required unless resumeSessionId is set",
  path: ["prompt"],
}).refine((v) => providerOfModel(v.model) === v.provider, {
  message: "model does not belong to the selected provider",
  path: ["model"],
});

export async function GET() {
  return NextResponse.json({ sessions: await getControl().list() });
}

export async function POST(req: Request) {
  const json = (await req.json().catch(() => null)) as unknown;
  const parsed = SpawnSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input", issues: parsed.error.issues }, { status: 400 });
  }
  const cwd = expandHome(parsed.data.cwd);
  try {
    const stat = statSync(cwd);
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: `cwd_not_directory: ${cwd}` }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: `cwd_not_found: ${cwd}` }, { status: 400 });
  }
  const provider = parsed.data.provider as ProviderId;
  const driver = getDriver(provider);
  if (process.env.COCKPIT_MOCK !== "1" && !driver.findCli()) {
    return NextResponse.json({
      error: `${provider} CLI not found — install the "${provider}" binary or set ${provider.toUpperCase()}_CLI_PATH, or run with COCKPIT_MOCK=1`,
    }, { status: 500 });
  }
  try {
    const id = await getControl().spawn({
      ...parsed.data,
      provider,
      cwd,
      model: parsed.data.model as ModelId,
      approvalMode: parsed.data.approvalMode as ApprovalMode,
      effort: parsed.data.effort as Effort | undefined,
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}

function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return resolve(homedir(), p.slice(2));
  return resolve(p);
}
