import { NextResponse } from "next/server";
import { z } from "zod";
import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { settingsPath } from "@/lib/claude-code/paths";
import { scanInstalledPlugins } from "@/lib/claude-code/plugins";
import { scanSkills } from "@/lib/claude-code/skills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const Body = z.object({ skillId: z.string().min(1) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "bad body" }, { status: 400 });
  const { skillId } = parsed.data;
  const plugins = scanInstalledPlugins();
  const skill = scanSkills(plugins).find((s) => s.id === skillId);
  if (!skill) return NextResponse.json({ error: "skill not found" }, { status: 404 });
  if (skill.userLevel) return NextResponse.json({ error: "user-level skills cannot be toggled" }, { status: 400 });
  const plugin = plugins.find((p) => p.name === skill.plugin);
  if (!plugin) return NextResponse.json({ error: "parent plugin not found" }, { status: 404 });
  const path = settingsPath();
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>; }
  catch { raw = {}; }
  const enabledMap = (raw.enabledPlugins as Record<string, boolean> | undefined) ?? {};
  const newEnabled = !plugin.enabled;
  enabledMap[plugin.id] = newEnabled;
  raw.enabledPlugins = enabledMap;
  const tmp = path + ".cockpit.tmp";
  writeFileSync(tmp, JSON.stringify(raw, null, 2) + "\n", "utf8");
  renameSync(tmp, path);
  const affected = scanSkills(scanInstalledPlugins()).filter((s) => s.plugin === plugin.name);
  return NextResponse.json({ ok: true, newEnabled, affectedSkills: affected });
}
