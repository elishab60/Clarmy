/**
 * clawd-animation.ts
 *
 * Pixel animation state machine for "Clawd"-style mascot.
 * Design target:
 * - same minimalist pixel-art look as provided screenshots
 * - idle front-facing with arms spread
 * - animation where he pulls out a laptop and types frenetically
 *
 * Usage:
 *   import { ClawdAnimator } from "@/lib/client/clawd-animation";
 *   const animator = new ClawdAnimator(canvas, { pixelSize: 8, background: "#ffffff" });
 *   animator.start();
 *
 * Framework-agnostic.
 */

type PaletteKey = "." | "B" | "S" | "E" | "L" | "D";

type Frame = {
  name: string;
  width: number;
  height: number;
  pixels: string[];
};

export type SequenceStep = {
  frame: string;
  duration: number;
};

export type AnimatorOptions = {
  pixelSize?: number;
  background?: string;
  x?: number;
  y?: number;
  loop?: boolean;
};

const PALETTE: Record<PaletteKey, string> = {
  ".": "transparent",
  B: "#CB7B5D",
  S: "#B36C53",
  E: "#000000",
  L: "#8B8B8B",
  D: "#BBBBBB",
};

const FRONT_IDLE: Frame = {
  name: "front_idle",
  width: 13,
  height: 9,
  pixels: [
    ".............",
    "..BBBBBBBBB..",
    "..BBEBBEBBB..",
    "BBBBBBBBBBBBB",
    "BBBBBBBBBBBBB",
    "..BBBBBBBBB..",
    "..B..B..B.B..",
    "..B..B..B.B..",
    ".............",
  ],
};

const FRONT_IDLE_SQUASH: Frame = {
  name: "front_idle_squash",
  width: 13,
  height: 9,
  pixels: [
    ".............",
    "...BBBBBBB...",
    "..BBEBBEBBB..",
    "BBBBBBBBBBBBB",
    "BBBBBBBBBBBBB",
    "..BBBBBBBBB..",
    "..B..B..B.B..",
    "..B..B..B.B..",
    ".............",
  ],
};

const SIDE_IDLE: Frame = {
  name: "side_idle",
  width: 16,
  height: 10,
  pixels: [
    "................",
    "...BBBBBBBB.....",
    "...BBEBBBBE.....",
    "BBBBBBBBBBBBL...",
    "BBBBBBBBBBBBLL..",
    "BBBBBBBBBBBLLL..",
    "...B..B..B......",
    "...B..B..B......",
    "...B............",
    "................",
  ],
};

const SIDE_PULL_LAPTOP_1: Frame = {
  name: "side_pull_laptop_1",
  width: 20,
  height: 10,
  pixels: [
    "....................",
    "...BBBBBBBB.........",
    "...BBEBBBBE.........",
    "BBBBBBBBBBBB........",
    "BBBBBBBBBBBB....LL..",
    "BBBBBBBBBBB....LLL..",
    "...B..B..B....LLLL..",
    "...B..B..B..........",
    "...B................",
    "....................",
  ],
};

const SIDE_PULL_LAPTOP_2: Frame = {
  name: "side_pull_laptop_2",
  width: 20,
  height: 10,
  pixels: [
    "....................",
    "...BBBBBBBB.........",
    "...BBEBBBBE..LLL....",
    "BBBBBBBBBBBB.LDDL...",
    "BBBBBBBBBBBB.LLLL...",
    "BBBBBBBBBBB..LLLL...",
    "...B..B..B..........",
    "...B..B..B..........",
    "...B................",
    "....................",
  ],
};

const SIDE_TYPE_A: Frame = {
  name: "side_type_a",
  width: 22,
  height: 10,
  pixels: [
    "......................",
    "...BBBBBBBB...........",
    "...BBEBBBBE..LLL......",
    "BBBBBBBBBBBB.LDDL.....",
    "BBBBBBBBBBBB.LLLL.....",
    "BBBBBBBBBBB..LLLL.....",
    "...B..B..B....L.......",
    "...B..B..B...L........",
    "...B..................",
    "......................",
  ],
};

const SIDE_TYPE_B: Frame = {
  name: "side_type_b",
  width: 22,
  height: 10,
  pixels: [
    "......................",
    "...BBBBBBBB...........",
    "...BBEBBBBE..LLL......",
    "BBBBBBBBBBBB.LDDL.....",
    "BBBBBBBBBBBB.LLLL.....",
    "BBBBBBBBBBB..LLLL.....",
    "...B..B..B...L........",
    "...B..B..B....L.......",
    "...B..................",
    "......................",
  ],
};

const SIDE_TYPE_C: Frame = {
  name: "side_type_c",
  width: 22,
  height: 10,
  pixels: [
    "......................",
    "...BBBBBBBB...........",
    "...BBEBBBBELLL........",
    "BBBBBBBBBBBBLDDL......",
    "BBBBBBBBBBBBLLLL......",
    "BBBBBBBBBBB.LLLL......",
    "...B..B..B..L.........",
    "...B..B..B...L........",
    "...B..................",
    "......................",
  ],
};

const FRAMES: Record<string, Frame> = {
  front_idle: FRONT_IDLE,
  front_idle_squash: FRONT_IDLE_SQUASH,
  side_idle: SIDE_IDLE,
  side_pull_laptop_1: SIDE_PULL_LAPTOP_1,
  side_pull_laptop_2: SIDE_PULL_LAPTOP_2,
  side_type_a: SIDE_TYPE_A,
  side_type_b: SIDE_TYPE_B,
  side_type_c: SIDE_TYPE_C,
};

const DEFAULT_SEQUENCE: SequenceStep[] = [
  { frame: "front_idle", duration: 300 },
  { frame: "front_idle_squash", duration: 180 },
  { frame: "front_idle", duration: 260 },
  { frame: "front_idle_squash", duration: 180 },
  { frame: "front_idle", duration: 300 },
  { frame: "side_idle", duration: 220 },
  { frame: "side_pull_laptop_1", duration: 140 },
  { frame: "side_pull_laptop_2", duration: 140 },
  { frame: "side_type_a", duration: 60 },
  { frame: "side_type_b", duration: 60 },
  { frame: "side_type_c", duration: 50 },
  { frame: "side_type_a", duration: 60 },
  { frame: "side_type_b", duration: 55 },
  { frame: "side_type_c", duration: 50 },
  { frame: "side_type_a", duration: 55 },
  { frame: "side_type_b", duration: 55 },
  { frame: "side_type_c", duration: 50 },
  { frame: "side_pull_laptop_2", duration: 180 },
  { frame: "side_idle", duration: 220 },
  { frame: "front_idle", duration: 300 },
];

function isPaletteKey(c: string): c is PaletteKey {
  return c === "." || c === "B" || c === "S" || c === "E" || c === "L" || c === "D";
}

export class ClawdAnimator {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly pixelSize: number;
  private readonly background: string;
  private readonly x: number;
  private readonly y: number;
  private readonly loop: boolean;
  private sequence: SequenceStep[];
  private frameIndex = 0;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  constructor(
    canvas: HTMLCanvasElement,
    options: AnimatorOptions = {},
    sequence: SequenceStep[] = DEFAULT_SEQUENCE,
  ) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context not available.");

    this.canvas = canvas;
    this.ctx = ctx;
    this.pixelSize = options.pixelSize ?? 8;
    this.background = options.background ?? "#ffffff";
    this.x = options.x ?? 24;
    this.y = options.y ?? 24;
    this.loop = options.loop ?? true;
    this.sequence = sequence;

    this.ctx.imageSmoothingEnabled = false;
    this.resizeCanvasForLargestFrame();
    this.renderCurrentFrame();
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.playStep();
  }

  stop() {
    this.running = false;
    if (this.timeoutId !== null) clearTimeout(this.timeoutId);
    this.timeoutId = null;
  }

  setSequence(sequence: SequenceStep[]) {
    this.sequence = sequence;
    this.frameIndex = 0;
    this.renderCurrentFrame();
  }

  private resizeCanvasForLargestFrame() {
    const largest = Object.values(FRAMES).reduce(
      (acc, frame) => ({
        width: Math.max(acc.width, frame.width),
        height: Math.max(acc.height, frame.height),
      }),
      { width: 0, height: 0 },
    );

    const pad = this.pixelSize * 4;
    this.canvas.width = largest.width * this.pixelSize + pad * 2;
    this.canvas.height = largest.height * this.pixelSize + pad * 2;
  }

  private playStep() {
    if (!this.running) return;

    this.renderCurrentFrame();

    const step = this.sequence[this.frameIndex];
    if (!step) {
      this.stop();
      return;
    }

    this.timeoutId = setTimeout(() => {
      this.frameIndex += 1;
      if (this.frameIndex >= this.sequence.length) {
        if (this.loop) {
          this.frameIndex = 0;
        } else {
          this.stop();
          return;
        }
      }
      this.playStep();
    }, step.duration);
  }

  private renderCurrentFrame() {
    const step = this.sequence[this.frameIndex];
    if (!step) return;

    const frame = FRAMES[step.frame];
    if (!frame) throw new Error(`Unknown frame: ${step.frame}`);

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.fillStyle = this.background;
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.drawFrame(frame, this.x, this.y);
  }

  private drawFrame(frame: Frame, ox: number, oy: number) {
    for (let y = 0; y < frame.height; y++) {
      const row = frame.pixels[y];
      if (!row) continue;
      for (let x = 0; x < frame.width; x++) {
        const ch = row[x];
        if (!ch || !isPaletteKey(ch) || ch === ".") continue;
        this.ctx.fillStyle = PALETTE[ch];
        this.ctx.fillRect(
          ox + x * this.pixelSize,
          oy + y * this.pixelSize,
          this.pixelSize,
          this.pixelSize,
        );
      }
    }
  }
}

export function mountClawd(canvas: HTMLCanvasElement, options?: AnimatorOptions) {
  const animator = new ClawdAnimator(canvas, options);
  animator.start();
  return animator;
}
