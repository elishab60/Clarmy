import type { NextConfig } from "next";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);

// Phaser's package "exports" resolves to the 8 MB unminified ESM bundle, whose
// parse + source-map generation is a heavy chunk of the /office dev compile.
// Point it at the prebuilt minified bundle (1.3 MB) instead — same Phaser, far
// cheaper for webpack to process. The dist/* path isn't in package.json
// "exports", so resolve via the package root, not require.resolve("phaser/dist/…").
const phaserBundle = join(dirname(require.resolve("phaser/package.json")), "dist/phaser.esm.min.js");

const config: NextConfig = {
  reactStrictMode: true,
  experimental: {
    serverActions: { bodySizeLimit: "2mb" },
  },
  webpack: (cfg) => {
    cfg.resolve ??= {};
    cfg.resolve.alias = { ...cfg.resolve.alias, phaser$: phaserBundle };
    return cfg;
  },
};

export default config;
