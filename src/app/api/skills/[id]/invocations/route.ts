import { NextResponse } from "next/server";
import { scanInstalledPlugins } from "@/lib/claude-code/plugins";
import { scanSkills } from "@/lib/claude-code/skills";
import { scanSkillInvocations } from "@/lib/claude-code/skill-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const url = new URL(req.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 50, 1), 500);
  const skill = scanSkills(scanInstalledPlugins()).find((s) => s.id === id);
  if (!skill) return NextResponse.json({ error: "not found" }, { status: 404 });
  const all = scanSkillInvocations().filter((i) => i.skillName === skill.name).slice(0, limit);
  return NextResponse.json({ invocations: all });
}
