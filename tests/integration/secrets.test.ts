import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  setSecret, getSecret, deleteSecret, listSecretKeys, getSecrets, isValidSecretKey,
} from "../../src/lib/claude-code/secrets.ts";

let dir: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "cockpit-secrets-"));
  process.env.COCKPIT_CLAUDE_HOME = dir;
  // Deterministic 32-byte master key so encrypt/decrypt is stable in the test.
  process.env.COCKPIT_SECRET_KEY = Buffer.alloc(32, 7).toString("base64");
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
  delete process.env.COCKPIT_CLAUDE_HOME;
  delete process.env.COCKPIT_SECRET_KEY;
});

describe("secret store", () => {
  it("round-trips an encrypted value", () => {
    setSecret("RESEND_API_KEY", "re_secret_value");
    expect(getSecret("RESEND_API_KEY")).toBe("re_secret_value");
  });

  it("never exposes values via listSecretKeys", () => {
    setSecret("TOKEN_A", "aaa");
    const keys = listSecretKeys();
    const a = keys.find((k) => k.key === "TOKEN_A");
    expect(a).toBeTruthy();
    expect(JSON.stringify(keys)).not.toContain("aaa");
  });

  it("returns null for a missing secret", () => {
    expect(getSecret("DOES_NOT_EXIST")).toBeNull();
  });

  it("deletes a secret", () => {
    setSecret("TMP", "x");
    expect(deleteSecret("TMP")).toBe(true);
    expect(getSecret("TMP")).toBeNull();
    expect(deleteSecret("TMP")).toBe(false);
  });

  it("decrypts a selected subset for injection", () => {
    setSecret("K1", "v1");
    setSecret("K2", "v2");
    expect(getSecrets(["K1", "K2", "MISSING"])).toEqual({ K1: "v1", K2: "v2" });
  });

  it("rejects invalid key names", () => {
    expect(isValidSecretKey("GOOD_KEY")).toBe(true);
    expect(isValidSecretKey("1bad")).toBe(false);
    expect(isValidSecretKey("has space")).toBe(false);
    expect(() => setSecret("bad-key", "v")).toThrow();
  });

  it("persists ciphertext, not plaintext, on disk", () => {
    setSecret("ONDISK", "plain_text_marker");
    const raw = readFileSync(join(dir, "cockpit", "secrets.json"), "utf8");
    expect(raw).not.toContain("plain_text_marker");
    expect(raw).toContain("ONDISK");
  });
});
