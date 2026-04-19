import { NextResponse } from "next/server";
import { scanInstalledPlugins } from "@/lib/claude-code/plugins";
import { scanSkills, readSkillBody } from "@/lib/claude-code/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const skill = scanSkills(scanInstalledPlugins()).find((s) => s.id === id);
  if (!skill) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = readSkillBody(skill.path);
  if (body == null) return NextResponse.json({ error: "unreadable" }, { status: 500 });
  return NextResponse.json({ body });
}
