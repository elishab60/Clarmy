#!/usr/bin/env node
/** Copy Phaser's prebuilt ESM bundle to public/ so the office loads it as a
 *  static asset instead of compiling a 3+ MB webpack chunk on every dev visit. */
import { cpSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pkgRoot = dirname(require.resolve("phaser/package.json"));
const src = join(pkgRoot, "dist/phaser.esm.min.js");
const outDir = join(import.meta.dirname, "..", "public", "office");
mkdirSync(outDir, { recursive: true });
cpSync(src, join(outDir, "phaser.esm.min.js"));
console.log("synced phaser.esm.min.js -> public/office/");