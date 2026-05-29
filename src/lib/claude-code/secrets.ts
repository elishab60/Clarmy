// Encrypted secret store at ~/.claude/cockpit/secrets.json. Each value is
// AES-256-GCM encrypted under the master key (see util/crypto.ts). Plaintext
// never touches disk in this file and is never returned by listSecretKeys.
// Mirrors the file-store pattern of crons.ts (atomic tmp + rename).

import { readFileSync, writeFileSync, mkdirSync, renameSync, existsSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { cockpitDir, secretsFile } from "./paths.ts";
import { encryptSecret, decryptSecret, loadMasterKey, type Encrypted } from "../util/crypto.ts";
import { createLogger } from "../util/logger.ts";

const log = createLogger("secrets.store");

interface Entry extends Encrypted {
  readonly updatedAt: string;
}

interface Store {
  readonly version: 1;
  readonly secrets: Record<string, Entry>;
}

// Env-var style names so injected secrets are valid shell identifiers.
const KEY_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function isValidSecretKey(key: string): boolean {
  return KEY_RE.test(key) && key.length <= 128;
}

function emptyStore(): Store {
  return { version: 1, secrets: {} };
}

function read(): Store {
  const path = secretsFile();
  if (!existsSync(path)) return emptyStore();
  try {
    const data = JSON.parse(readFileSync(path, "utf8")) as unknown;
    if (!data || typeof data !== "object") return emptyStore();
    const rec = data as { secrets?: unknown };
    if (!rec.secrets || typeof rec.secrets !== "object") return emptyStore();
    return { version: 1, secrets: rec.secrets as Record<string, Entry> };
  } catch (e) {
    log.warn("failed to read secrets.json", { err: String(e) });
    return emptyStore();
  }
}

function write(store: Store): void {
  const path = secretsFile();
  mkdirSync(cockpitDir(), { recursive: true });
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.cockpit.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
  renameSync(tmp, path);
  try { chmodSync(path, 0o600); } catch { /* best effort */ }
}

export function setSecret(key: string, value: string): { key: string; updatedAt: string } {
  if (!isValidSecretKey(key)) throw new Error(`invalid secret key "${key}" (use letters, digits, underscore; not starting with a digit)`);
  const store = read();
  const enc = encryptSecret(value, loadMasterKey());
  const updatedAt = new Date().toISOString();
  write({ version: 1, secrets: { ...store.secrets, [key]: { ...enc, updatedAt } } });
  log.info("secret set", { key });
  return { key, updatedAt };
}

export function getSecret(key: string): string | null {
  const entry = read().secrets[key];
  if (!entry) return null;
  try {
    return decryptSecret(entry, loadMasterKey());
  } catch (e) {
    log.warn("secret decrypt failed", { key, err: String(e) });
    return null;
  }
}

export function deleteSecret(key: string): boolean {
  const store = read();
  if (!(key in store.secrets)) return false;
  const next = { ...store.secrets };
  delete next[key];
  write({ version: 1, secrets: next });
  log.info("secret deleted", { key });
  return true;
}

export function listSecretKeys(): Array<{ key: string; updatedAt: string }> {
  const store = read();
  return Object.entries(store.secrets)
    .map(([key, e]) => ({ key, updatedAt: e.updatedAt }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

/** Decrypt a selected subset for env injection. Skips keys that fail/absent. */
export function getSecrets(keys: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of keys) {
    const v = getSecret(k);
    if (v !== null) out[k] = v;
  }
  return out;
}
