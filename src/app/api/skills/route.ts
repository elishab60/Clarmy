import { NextResponse } from "next/server";
import { scanInstalledPlugins } from "@/lib/claude-code/plugins";
import { scanSkills } from "@/lib/claude-code/skills";
import { scanSkillInvocations } from "@/lib/claude-code/skill-stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const plugins = scanInstalledPlugins();
  const skills = scanSkills(plugins);
  const now = Date.now();
  const invs = scanSkillInvocations();
  const counts7 = new Map<string, { count: number; lastTs: number }>();
  const counts30 = new Map<string, number>();
  for (const i of invs) {
    if (i.ts > now - 7 * 24 * 3600 * 1000) {
      const e = counts7.get(i.skillName) ?? { count: 0, lastTs: 0 };
      e.count++; e.lastTs = Math.max(e.lastTs, i.ts);
      counts7.set(i.skillName, e);
    }
    if (i.ts > now - 30 * 24 * 3600 * 1000) counts30.set(i.skillName, (counts30.get(i.skillName) ?? 0) + 1);
  }
  return NextResponse.json({
    skills: skills.map((s) => ({
      ...s,
      invocations7d: counts7.get(s.name)?.count ?? 0,
      invocations30d: counts30.get(s.name) ?? 0,
      lastTs: counts7.get(s.name)?.lastTs ?? null,
    })),
    totals: { total: skills.length, enabled: skills.filter((s) => s.enabled).length },
  });
}
