import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import type { PluginInfo } from "./plugins.ts";
import { userAgentsDir, projectAgentsDir } from "./paths.ts";
import { parseFrontMatter } from "./skills.ts";
import { createLogger } from "../util/logger.ts";

const log = createLogger("cc-agents");

export type AgentSource = "user" | "project" | "plugin" | "builtin";

export interface AgentInfo {
  readonly id: string;
  readonly name: string;
  readonly source: AgentSource;
  readonly plugin?: string;
  readonly marketplace?: string;
  readonly description: string;
  readonly model: string;
  readonly tools?: string;
  readonly color?: string;
  readonly path?: string;
  readonly editable: boolean;
}

const BUILTINS: readonly AgentInfo[] = [
  { id: "builtin:claude-code-guide", name: "claude-code-guide", source: "builtin", description: "Answers questions about Claude Code (CLI), the Claude Agent SDK, and the Claude API.", model: "haiku", editable: false },
  { id: "builtin:Explore", name: "Explore", source: "builtin", description: "Fast agent specialized for exploring codebases — finding files, searching code, answering questions.", model: "haiku", editable: false },
  { id: "builtin:general-purpose", name: "general-purpose", source: "builtin", description: "General-purpose agent for research, code search, and multi-step tasks.", model: "inherit", editable: false },
  { id: "builtin:Plan", name: "Plan", source: "builtin", description: "Software architect agent for designing implementation plans.", model: "inherit", editable: false },
  { id: "builtin:statusline-setup", name: "statusline-setup", source: "builtin", description: "Configures the user's Claude Code status line setting.", model: "sonnet", editable: false },
];

function readAgent(path: string): { name: string; description: string; model: string; tools?: string; color?: string } | null {
  try {
    const text = readFileSync(path, "utf8");
    const fm = parseFrontMatter(text);
    if (!fm.name && !fm.description) return null;
    const rawDesc = (fm.description ?? "").replace(/^[|>]-?\+?\s*/, "").replace(/\s+/g, " ").trim();
    return {
      name: fm.name ?? basename(path, ".md"),
      description: rawDesc,
      model: fm.raw.model ?? "inherit",
      tools: fm.raw.tools,
      color: fm.raw.color,
    };
  } catch (err) {
    log.error("agent read failed", { path, err: String(err) });
    return null;
  }
}

function scanDir(dir: string): { path: string; parsed: NonNullable<ReturnType<typeof readAgent>> }[] {
  const out: { path: string; parsed: NonNullable<ReturnType<typeof readAgent>> }[] = [];
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const f of entries) {
    if (f.startsWith(".") || !f.endsWith(".md")) continue;
    const full = join(dir, f);
    try { if (!statSync(full).isFile()) continue; } catch { continue; }
    const parsed = readAgent(full);
    if (parsed) out.push({ path: full, parsed });
  }
  return out;
}

function scanPluginDir(pluginRoot: string): string[] {
  const out: string[] = [];
  const stack = [pluginRoot];
  const visited = new Set<string>();
  while (stack.length) {
    const dir = stack.pop();
    if (!dir || visited.has(dir)) continue;
    visited.add(dir);
    let entries: string[];
    try { entries = readdirSync(dir); } catch { continue; }
    for (const e of entries) {
      if (e.startsWith(".")) continue;
      const full = join(dir, e);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) {
        if (e === "agents") out.push(full);
        else stack.push(full);
      }
    }
  }
  return out;
}

export function scanAgents(plugins: readonly PluginInfo[], projectCwd?: string): AgentInfo[] {
  const out: AgentInfo[] = [];

  for (const { path, parsed } of scanDir(userAgentsDir())) {
    out.push({
      id: `user:${parsed.name}`,
      name: parsed.name,
      source: "user",
      description: parsed.description,
      model: parsed.model,
      tools: parsed.tools,
      color: parsed.color,
      path,
      editable: true,
    });
  }

  if (projectCwd) {
    for (const { path, parsed } of scanDir(projectAgentsDir(projectCwd))) {
      out.push({
        id: `project:${parsed.name}`,
        name: parsed.name,
        source: "project",
        description: parsed.description,
        model: parsed.model,
        tools: parsed.tools,
        color: parsed.color,
        path,
        editable: true,
      });
    }
  }

  for (const p of plugins) {
    for (const agentsDir of scanPluginDir(p.cachePath)) {
      for (const { path, parsed } of scanDir(agentsDir)) {
        out.push({
          id: `plugin:${p.name}:${parsed.name}`,
          name: parsed.name,
          source: "plugin",
          plugin: p.name,
          marketplace: p.marketplace,
          description: parsed.description,
          model: parsed.model,
          tools: parsed.tools,
          color: parsed.color,
          path,
          editable: false,
        });
      }
    }
  }

  for (const b of BUILTINS) out.push(b);

  return out.sort((a, b) => {
    const order: Record<AgentSource, number> = { user: 0, project: 1, plugin: 2, builtin: 3 };
    const d = order[a.source] - order[b.source];
    if (d !== 0) return d;
    return a.name.localeCompare(b.name);
  });
}

export function readAgentBody(path: string): string | null {
  try { return readFileSync(path, "utf8"); } catch { return null; }
}
