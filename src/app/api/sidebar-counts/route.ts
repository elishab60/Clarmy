import { NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { scanInstalledPlugins } from "@/lib/claude-code/plugins";
import { scanAgents } from "@/lib/claude-code/agents";
import { scanSkills } from "@/lib/claude-code/skills";
import { listCrons } from "@/lib/claude-code/crons";
import { readMcpServers } from "@/lib/claude-code/mcp-config";
import { settingsPath } from "@/lib/claude-code/paths";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function countHooks(): number {
  try {
    const s = JSON.parse(readFileSync(settingsPath(), "utf8")) as {
      hooks?: Record<string, unknown[]>;
    };
    if (!s.hooks || typeof s.hooks !== "object") return 0;
    return Object.values(s.hooks).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
  } catch {
    return 0;
  }
}

export async function GET() {
  const plugins = scanInstalledPlugins();
  const { enabled, disabled } = readMcpServers();
  return NextResponse.json({
    agents: scanAgents(plugins).length,
    crons: listCrons().length,
    skills: scanSkills(plugins).length,
    mcp: Object.keys(enabled).length + Object.keys(disabled).length,
    plugins: plugins.length,
    hooks: countHooks(),
  });
}
