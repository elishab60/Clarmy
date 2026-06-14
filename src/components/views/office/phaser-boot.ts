type PhaserModule = typeof import("phaser");

const PHASER_URL = "/office/phaser.esm.min.js";

let cached: Promise<PhaserModule> | null = null;

/** Load Phaser from /public — avoids bundling ~1.3 MB into the office chunk. */
export function loadPhaser(): Promise<PhaserModule> {
  if (!cached) {
    cached = (import(/* webpackIgnore: true */ PHASER_URL) as Promise<{ default: PhaserModule }>)
      .then((m) => m.default);
  }
  return cached;
}