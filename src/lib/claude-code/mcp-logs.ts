import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { debugDir } from "./paths.ts";

export function tailMcpLogs(serverName: string, maxLines: number): string[] {
  const out: string[] = [];
  let files: string[];
  try {
    files = readdirSync(debugDir());
  } catch {
    return [];
  }
  const sorted = files
    .map((f) => {
      const p = join(debugDir(), f);
      try {
        return { p, mt: statSync(p).mtimeMs };
      } catch {
        return null;
      }
    })
    .filter((x): x is { p: string; mt: number } => x !== null)
    .sort((a, b) => b.mt - a.mt)
    .slice(0, 5);
  const needle = serverName.toLowerCase();
  for (const { p } of sorted) {
    let txt: string;
    try {
      txt = readFileSync(p, "utf8");
    } catch {
      continue;
    }
    const lines = txt.split("\n").filter((l) => l.toLowerCase().includes(needle));
    for (const l of lines) {
      out.push(l);
      if (out.length >= maxLines) return out;
    }
  }
  return out;
}
