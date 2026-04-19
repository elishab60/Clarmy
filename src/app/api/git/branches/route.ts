import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { createLogger } from "@/lib/util/logger";

const log = createLogger("api/git/branches");
const pexec = promisify(execFile);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const cwd = url.searchParams.get("cwd");
  if (!cwd) return NextResponse.json({ error: "cwd required" }, { status: 400 });

  const abs = resolve(cwd);
  if (!existsSync(abs)) return NextResponse.json({ branches: [], current: null, reason: "missing" });

  try {
    const [{ stdout: listOut }, headRes] = await Promise.all([
      pexec("git", ["branch", "--format=%(refname:short)\t%(committerdate:unix)", "--sort=-committerdate"], {
        cwd: abs,
        timeout: 3000,
        maxBuffer: 512 * 1024,
      }),
      pexec("git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd: abs, timeout: 2000 }).catch(() => null),
    ]);
    const branches = listOut
      .split("\n")
      .map((l) => {
        const [name, ts] = l.split("\t");
        if (!name) return null;
        return { name: name.trim(), lastCommitAt: ts ? Number(ts) * 1000 : 0 };
      })
      .filter((b): b is { name: string; lastCommitAt: number } => !!b && !!b.name && b.name !== "HEAD");
    const current = headRes?.stdout.trim() || null;
    return NextResponse.json({ branches, current });
  } catch (err) {
    log.warn("git failed", { cwd: abs, err: String(err) });
    return NextResponse.json({ branches: [], current: null, reason: "not-a-repo" });
  }
}
