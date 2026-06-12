import type Phaser from "phaser";
import { findPath } from "./pathfind";
import { TILE, key, type CharMode, type Dir, type SessionLite, type Spot } from "./types";

const WALK_SPEED = 56;          // px/s (pixel-agents uses 48)
const FRAME: Record<Dir, number> = { down: 0, up: 7, right: 14, left: 14 };

// One session = one character: sprite + name tag + status bubble grouped so
// they move and depth-sort together. The mode machine animates; the scene
// decides goals (state -> behavior mapping lives in behavior.ts).
export class Character {
  readonly id: string;
  readonly container: Phaser.GameObjects.Container;
  readonly sprite: Phaser.GameObjects.Sprite;
  private readonly tag: Phaser.GameObjects.Text;
  private readonly bubble: Phaser.GameObjects.Text;
  private readonly palette: number;
  private readonly scene: Phaser.Scene;
  private readonly blocked: () => ReadonlySet<string>;

  mode: CharMode = "stand";
  col: number;
  row: number;
  session: SessionLite;
  private dir: Dir = "down";
  private path: Array<{ col: number; row: number }> = [];
  private moveProgress = 0;
  private from: { x: number; y: number } | null = null;
  private onArrive: (() => void) | null = null;
  private bubbleTween: Phaser.Tweens.Tween | null = null;
  private swayTween: Phaser.Tweens.Tween | null = null;
  private halo: Phaser.GameObjects.Ellipse | null = null;
  private haloTween: Phaser.Tweens.Tween | null = null;

  constructor(
    scene: Phaser.Scene,
    session: SessionLite,
    palette: number,
    spawn: Spot,
    blocked: () => ReadonlySet<string>,
    mini = false,
  ) {
    this.scene = scene;
    this.id = session.id;
    this.session = session;
    this.palette = palette;
    this.blocked = blocked;
    this.col = spawn.col;
    this.row = spawn.row;

    this.sprite = scene.add.sprite(0, 0, `char_${palette}`, FRAME.down + 1).setOrigin(0.5, 1);
    this.tag = scene.add.text(0, -34, shortName(session), {
      fontFamily: "monospace", fontSize: "7px", color: "#e8e8e8",
      backgroundColor: "rgba(0,0,0,0.55)", padding: { x: 2, y: 1 },
    }).setOrigin(0.5, 1).setResolution(4);
    this.bubble = scene.add.text(0, -40, "", {
      fontFamily: "monospace", fontSize: "10px", color: "#fff", fontStyle: "bold",
      padding: { x: 3, y: 1 },
    }).setOrigin(0.5, 1).setResolution(4).setVisible(false);

    this.halo = scene.add.ellipse(0, -2, 22, 10, 0xd97757, 0.0).setVisible(false);
    this.container = scene.add.container(
      spawn.col * TILE + TILE / 2,
      spawn.row * TILE + TILE,
      [this.halo, this.sprite, this.tag, this.bubble],
    );
    if (mini) this.container.setScale(0.65);
    this.container.setAlpha(0);
    scene.tweens.add({ targets: this.container, alpha: 1, duration: 350 });
    this.face(spawn.face);
  }

  // Walk to a spot, then switch to `mode` facing the spot's direction.
  goTo(spot: Spot, mode: CharMode): void {
    const path = findPath(this.col, this.row, spot.col, spot.row, this.blocked());
    this.clearEffects();
    if (!path || path.length === 0) {
      this.col = spot.col; this.row = spot.row;
      this.container.setPosition(spot.col * TILE + TILE / 2, spot.row * TILE + TILE);
      this.arrive(mode, spot.face);
      return;
    }
    this.path = path;
    this.moveProgress = 0;
    this.from = { x: this.container.x, y: this.container.y };
    this.mode = "walk";
    this.onArrive = () => this.arrive(mode, spot.face);
  }

  setMode(mode: CharMode, face?: Dir): void {
    this.clearEffects();
    this.arrive(mode, face ?? this.dir);
  }

  private arrive(mode: CharMode, face: Dir): void {
    this.mode = mode;
    this.face(face);
    const p = this.palette;
    switch (mode) {
      case "sit_type": this.sprite.play(`c${p}-type-${this.animDir()}`); break;
      case "sit_read": case "lounge": this.sprite.play(`c${p}-read-${this.animDir()}`); break;
      case "use_tool": this.sprite.play(`c${p}-read-${this.animDir()}`); break;
      case "alert": {
        this.sprite.stop();
        this.sprite.setFrame(FRAME[this.animDir()] + 1);
        this.showBubble("!", "#f5a524", true);
        break;
      }
      case "dizzy": {
        this.sprite.stop();
        this.sprite.setFrame(FRAME[this.animDir()] + 1);
        this.showBubble("✕", "#ef4444", false);
        this.swayTween = this.scene.tweens.add({
          targets: this.sprite, angle: { from: -8, to: 8 },
          duration: 280, yoyo: true, repeat: -1, ease: "Sine.inOut",
        });
        break;
      }
      case "celebrate": {
        this.sprite.stop();
        this.sprite.setFrame(FRAME[this.animDir()] + 1);
        this.showBubble("✓", "#22c55e", false);
        this.scene.tweens.add({
          targets: this.sprite, y: -7, duration: 180, yoyo: true, repeat: 4, ease: "Quad.out",
          onComplete: () => { this.sprite.y = 0; },
        });
        break;
      }
      default: {
        this.sprite.stop();
        this.sprite.setFrame(FRAME[this.animDir()] + 1);
      }
    }
  }

  update(dtMs: number): void {
    if (this.mode !== "walk") return;
    const step = this.path[0];
    if (!step || !this.from) { this.onArrive?.(); return; }
    const dist = TILE;
    this.moveProgress += (WALK_SPEED * dtMs) / 1000 / dist;
    const tx = step.col * TILE + TILE / 2;
    const ty = step.row * TILE + TILE;
    this.face(dirBetween(this.from.x, this.from.y, tx, ty));
    if (this.sprite.anims.currentAnim?.key !== `c${this.palette}-walk-${this.animDir()}`) {
      this.sprite.play(`c${this.palette}-walk-${this.animDir()}`);
    }
    const t = Math.min(1, this.moveProgress);
    this.container.setPosition(this.from.x + (tx - this.from.x) * t, this.from.y + (ty - this.from.y) * t);
    if (t >= 1) {
      this.col = step.col; this.row = step.row;
      this.path.shift();
      this.moveProgress = 0;
      this.from = { x: tx, y: ty };
      if (this.path.length === 0) {
        const done = this.onArrive;
        this.onArrive = null;
        done?.();
      }
    }
    this.container.setDepth(this.container.y);
  }

  setPromptVisible(show: boolean): void {
    const prompt = this.session.prompt?.trim();
    this.tag.setText(show && prompt ? `${shortName(this.session)}\n${truncate(prompt, 34)}` : shortName(this.session));
  }

  // Selection halo (accent ring under the feet) + dimming of the others.
  setSelected(on: boolean): void {
    if (!this.halo) return;
    this.haloTween?.remove();
    this.haloTween = null;
    if (on) {
      this.halo.setVisible(true).setFillStyle(0xd97757, 0.4);
      this.haloTween = this.scene.tweens.add({
        targets: this.halo, fillAlpha: { from: 0.42, to: 0.18 },
        scaleX: { from: 1, to: 1.25 }, scaleY: { from: 1, to: 1.25 },
        duration: 900, yoyo: true, repeat: -1, ease: "Sine.inOut",
      });
    } else {
      this.halo.setVisible(false);
    }
  }

  setDimmed(dim: boolean): void {
    this.scene.tweens.add({ targets: this.container, alpha: dim ? 0.45 : 1, duration: 200 });
  }

  fadeOutAndDestroy(onDone: () => void): void {
    this.clearEffects();
    this.scene.tweens.add({
      targets: this.container, alpha: 0, duration: 300,
      onComplete: () => { this.container.destroy(); onDone(); },
    });
  }

  private showBubble(text: string, color: string, pulse: boolean): void {
    this.bubble.setText(text).setColor(color).setVisible(true).setAlpha(1);
    if (pulse) {
      this.bubbleTween = this.scene.tweens.add({
        targets: this.bubble, alpha: { from: 1, to: 0.25 },
        duration: 420, yoyo: true, repeat: -1,
      });
    }
  }

  private clearEffects(): void {
    this.bubbleTween?.remove(); this.bubbleTween = null;
    this.swayTween?.remove(); this.swayTween = null;
    this.sprite.setAngle(0);
    this.sprite.y = 0;
    this.bubble.setVisible(false);
  }

  private face(dir: Dir): void {
    this.dir = dir;
    this.sprite.setFlipX(dir === "left");
  }

  private animDir(): "down" | "up" | "right" {
    return this.dir === "left" ? "right" : this.dir;
  }
}

function dirBetween(x0: number, y0: number, x1: number, y1: number): Dir {
  if (Math.abs(x1 - x0) > Math.abs(y1 - y0)) return x1 > x0 ? "right" : "left";
  return y1 > y0 ? "down" : "up";
}

function shortName(s: SessionLite): string {
  return truncate(s.project || s.name || s.id, 14);
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
