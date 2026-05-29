// AES-256-GCM helpers for the secret store. Values are encrypted at rest under a
// master key resolved from COCKPIT_SECRET_KEY (base64 or hex, 32 bytes) or, if
// unset, an auto generated keyfile at ~/.claude/cockpit/secret.key (perms 0600).

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { secretKeyFile } from "../claude-code/paths.ts";

const ALGO = "aes-256-gcm";

export interface Encrypted {
  readonly ciphertext: string;
  readonly iv: string;
  readonly authTag: string;
}

export function encryptSecret(plaintext: string, key: Buffer): Encrypted {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ct.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
  };
}

export function decryptSecret(e: Encrypted, key: Buffer): string {
  const decipher = createDecipheriv(ALGO, key, Buffer.from(e.iv, "base64"));
  decipher.setAuthTag(Buffer.from(e.authTag, "base64"));
  const pt = Buffer.concat([decipher.update(Buffer.from(e.ciphertext, "base64")), decipher.final()]);
  return pt.toString("utf8");
}

function decodeKey(s: string): Buffer {
  const t = s.trim();
  if (/^[0-9a-fA-F]{64}$/.test(t)) return Buffer.from(t, "hex");
  const b = Buffer.from(t, "base64");
  if (b.length === 32) return b;
  return Buffer.from(t, "utf8");
}

let cached: Buffer | null = null;

export function loadMasterKey(): Buffer {
  if (cached) return cached;
  const env = process.env.COCKPIT_SECRET_KEY;
  if (env) {
    const buf = decodeKey(env);
    if (buf.length !== 32) throw new Error("COCKPIT_SECRET_KEY must decode to 32 bytes (base64 or 64-char hex)");
    cached = buf;
    return buf;
  }
  const path = secretKeyFile();
  if (existsSync(path)) {
    const buf = decodeKey(readFileSync(path, "utf8"));
    if (buf.length === 32) { cached = buf; return buf; }
  }
  const key = randomBytes(32);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, key.toString("base64") + "\n", { encoding: "utf8", mode: 0o600 });
  try { chmodSync(path, 0o600); } catch { /* best effort on platforms without chmod */ }
  cached = key;
  return key;
}
