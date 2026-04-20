#!/usr/bin/env node
// pnpm sometimes extracts node-pty prebuilt `spawn-helper` without an exec bit,
// which makes posix_spawnp fail at runtime with no useful errno. Re-chmod it.
import { readdirSync, statSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "node_modules");
const TARGETS = ["spawn-helper"];

function walk(dir, depth = 0) {
  if (depth > 8) return;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === ".git" || e.name === ".cache") continue;
      walk(full, depth + 1);
    } else if (e.isFile() && TARGETS.includes(e.name)) {
      try {
        const st = statSync(full);
        const mode = st.mode | 0o111;
        if (mode !== st.mode) {
          chmodSync(full, mode);
          console.log(`[fix-node-pty-perms] chmod +x ${full}`);
        }
      } catch (err) {
        console.warn(`[fix-node-pty-perms] skipped ${full}: ${err?.message ?? err}`);
      }
    }
  }
}

try { walk(ROOT); } catch (err) {
  console.warn(`[fix-node-pty-perms] failed: ${err?.message ?? err}`);
}
