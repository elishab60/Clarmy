import { NextResponse } from "next/server";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { scanInstalledPlugins } from "@/lib/claude-code/plugins";
import { scanAgents } from "@/lib/claude-code/agents";
import { userAgentsDir, projectAgentsDir } from "@/lib/claude-code/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cwd = url.searchParams.get("cwd") ?? undefined;
  const agents = scanAgents(scanInstalledPlugins(), cwd);
  return NextResponse.json({
    agents,
    totals: {
      total: agents.length,
      user: agents.filter((a) => a.source === "user").length,
      project: agents.filter((a) => a.source === "project").length,
      plugin: agents.filter((a) => a.source === "plugin").length,
      builtin: agents.filter((a) => a.source === "builtin").length,
    },
  });
}

const CreateBody = z.object({
  name: z.string().min(1).regex(/^[a-zA-Z0-9_-]+$/, "name must be alphanumeric, dashes or underscores"),
  description: z.string().min(1).max(2000),
  model: z.enum(["inherit", "haiku", "sonnet", "opus"]).default("inherit"),
  tools: z.string().optional(),
  body: z.string().min(1),
  scope: z.enum(["user", "project"]).default("user"),
  projectCwd: z.string().optional(),
});

export async function POST(req: Request) {
  let parsed: z.infer<typeof CreateBody>;
  try { parsed = CreateBody.parse(await req.json()); }
  catch (e) { return NextResponse.json({ error: String(e) }, { status: 400 }); }

  const dir = parsed.scope === "project"
    ? (parsed.projectCwd ? projectAgentsDir(parsed.projectCwd) : null)
    : userAgentsDir();
  if (!dir) return NextResponse.json({ error: "projectCwd required for project scope" }, { status: 400 });

  const filePath = join(dir, `${parsed.name}.md`);
  if (existsSync(filePath)) return NextResponse.json({ error: "agent already exists" }, { status: 409 });

  const fm: string[] = ["---", `name: ${parsed.name}`, `description: ${JSON.stringify(parsed.description)}`, `model: ${parsed.model}`];
  if (parsed.tools && parsed.tools.trim()) fm.push(`tools: ${parsed.tools.trim()}`);
  fm.push("---", "");
  const file = `${fm.join("\n")}\n${parsed.body.trim()}\n`;

  try {
    mkdirSync(dir, { recursive: true });
    writeFileSync(filePath, file, "utf8");
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
  return NextResponse.json({ id: parsed.scope === "user" ? `user:${parsed.name}` : `project:${parsed.name}`, path: filePath });
}
