import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

export async function* readMessagesJsonl<T = unknown>(path: string): AsyncGenerator<T, void> {
  const rl = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity });
  try {
    for await (const line of rl) {
      const trimmed = line.trim();
      if (trimmed.length === 0) continue;
      try { yield JSON.parse(trimmed) as T; }
      catch { /* skip malformed */ }
    }
  } finally { rl.close(); }
}
