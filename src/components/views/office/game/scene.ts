import Phaser from "phaser";
import { buildBlocked, COLS, DECOR, DESKS, ROWS, WORLD_H, WORLD_W } from "./layout";
import { Character } from "./character";
import { applyState, hash } from "./behavior";
import { TILE, key, type Desk, type SessionLite } from "./types";

const PALETTES = 6;

// The office scene. Sessions flow in one direction: the React bridge calls
// setSessions(); the scene converges characters toward that truth. Clicking a
// character emits "select" with the session id (React renders the inspector).
export class OfficeScene extends Phaser.Scene {
  private chars = new Map<string, Character>();
  private minis = new Map<string, Character[]>();
  private deskOf = new Map<string, Desk>();
  private freeDesks: Desk[] = [...DESKS];
  private pcs = new Map<number, Phaser.GameObjects.Sprite>();
  private blocked = buildBlocked();
  private pending: SessionLite[] | null = null;
  private created = false;
  private showPrompts = false;
  private selectedId: string | null = null;
  private charClicked = false;
  private lastLabelPass = 0;

  constructor() {
    super("office");
  }

  preload(): void {
    this.load.atlas("decor", "/office/atlas.png", "/office/atlas.json");
    for (let p = 0; p < PALETTES; p += 1) {
      this.load.spritesheet(`char_${p}`, `/office/characters/clawd_${p}.png`, { frameWidth: 16, frameHeight: 32 });
    }
  }

  create(): void {
    this.createAnims();
    this.drawRoom();
    this.setupCamera();
    this.created = true;
    if (this.pending) { this.syncSessions(this.pending); this.pending = null; }
    this.game.events.emit("office-ready");
  }

  // ── public API (called from the React bridge) ──────────────────────────
  setSessions(sessions: SessionLite[]): void {
    // scene.isActive() is false while create() runs, so a hand-rolled flag
    // decides; pending holds the latest list until the world exists.
    if (!this.created) { this.pending = sessions; return; }
    this.syncSessions(sessions);
  }

  setSelected(id: string | null): void {
    this.selectedId = id;
    for (const [cid, ch] of this.chars) {
      ch.setSelected(cid === id);
      ch.setDimmed(id !== null && cid !== id);
    }
    for (const list of this.minis.values()) for (const m of list) m.setDimmed(id !== null);
    const target = id ? this.chars.get(id) : null;
    if (target) this.cameras.main.pan(target.container.x, target.container.y, 350, "Quad.easeOut");
  }

  setShowPrompts(show: boolean): void {
    this.showPrompts = show;
    for (const ch of this.chars.values()) ch.setPromptVisible(show);
  }

  recenter(): void {
    const cam = this.cameras.main;
    cam.pan(WORLD_W / 2, WORLD_H / 2, 300, "Quad.easeOut");
  }

  update(time: number, delta: number): void {
    for (const ch of this.chars.values()) {
      ch.update(delta);
      ch.container.setDepth(ch.container.y);
    }
    for (const list of this.minis.values()) for (const m of list) {
      m.update(delta);
      m.container.setDepth(m.container.y);
    }
    if (time - this.lastLabelPass > 300) {
      this.lastLabelPass = time;
      this.layoutLabels();
    }
  }

  // Labels: hidden when zoomed out (state dot remains), and never overlapping;
  // close neighbours get stacked vertical offsets.
  private layoutLabels(): void {
    const visible = this.cameras.main.zoom >= 2.05;
    const list = [...this.chars.values()].sort((a, b) => a.container.x - b.container.x);
    for (let i = 0; i < list.length; i += 1) {
      const ch = list[i]!;
      ch.setLabelVisible(visible);
      let stack = 0;
      for (let j = 0; j < i; j += 1) {
        const other = list[j]!;
        if (Math.abs(other.container.x - ch.container.x) < 34
          && Math.abs(other.container.y - ch.container.y) < 30) stack += 1;
      }
      ch.setTagOffset(stack * 9);
    }
  }

  // ── sync ───────────────────────────────────────────────────────────────
  private syncSessions(sessions: SessionLite[]): void {
    const seen = new Set<string>();
    for (const s of sessions) {
      seen.add(s.id);
      const existing = this.chars.get(s.id);
      if (!existing) this.spawn(s);
      else {
        const prevState = existing.session.state;
        existing.session = s;
        existing.setPromptVisible(this.showPrompts);
        if (prevState !== s.state) this.applyBehavior(existing, s);
        this.syncMinis(existing, s);
      }
    }
    for (const [id, ch] of this.chars) {
      if (seen.has(id)) continue;
      this.despawn(id, ch);
    }
  }

  private spawn(s: SessionLite): void {
    const desk = this.freeDesks.shift() ?? DESKS[hash(s.id) % DESKS.length]!;
    this.deskOf.set(s.id, desk);
    const palette = hash(s.project || s.id) % PALETTES;
    const door = { col: 2 + (this.chars.size % 4), row: ROWS - 3, face: "up" as const };
    const ch = new Character(this, s, palette, door, () => this.blocked);
    ch.sprite.setInteractive({ useHandCursor: true });
    ch.sprite.on("pointerdown", () => { this.charClicked = true; this.game.events.emit("select", s.id); });
    ch.sprite.on("pointerover", () => ch.setHovered(true));
    ch.sprite.on("pointerout", () => ch.setHovered(false));
    ch.setPromptVisible(this.showPrompts);
    this.chars.set(s.id, ch);
    if (this.selectedId !== null) ch.setDimmed(s.id !== this.selectedId);
    this.applyBehavior(ch, s);
    this.syncMinis(ch, s);
  }

  private despawn(id: string, ch: Character): void {
    this.chars.delete(id);
    const desk = this.deskOf.get(id);
    if (desk) { this.freeDesks.unshift(desk); this.deskOf.delete(id); this.setPc(desk, false); }
    for (const m of this.minis.get(id) ?? []) m.fadeOutAndDestroy(() => { /* gone */ });
    this.minis.delete(id);
    ch.fadeOutAndDestroy(() => { /* gone */ });
  }

  private applyBehavior(ch: Character, s: SessionLite): void {
    const desk = this.deskOf.get(s.id)!;
    this.setPc(desk, s.state === "running" || s.state === "tool_use");
    applyState(ch, s.state, desk, Math.random);
  }

  // Subagents render as mini characters loitering next to the parent's desk.
  private syncMinis(parent: Character, s: SessionLite): void {
    const want = Math.min(s.subagents ?? 0, 3);
    const list = this.minis.get(s.id) ?? [];
    while (list.length < want) {
      const desk = this.deskOf.get(s.id)!;
      const i = list.length;
      const spot = { col: desk.seat.col + (i === 0 ? -1 : 1), row: desk.seat.row + (i === 2 ? 1 : 0), face: "down" as const };
      const mini = new Character(this, { ...s, id: `${s.id}:sub${i}` }, hash(`${s.id}${i}`) % PALETTES, spot, () => this.blocked, true);
      mini.setPromptVisible(false);
      mini.setMode("sit_read");
      list.push(mini);
    }
    while (list.length > want) list.pop()!.fadeOutAndDestroy(() => { /* gone */ });
    this.minis.set(s.id, list);
  }

  private setPc(desk: Desk, on: boolean): void {
    const pc = this.pcs.get(desk.id);
    if (!pc) return;
    if (on) pc.play("pc-on", true);
    else { pc.stop(); pc.setFrame("PC_FRONT_OFF"); }
  }

  // ── world building ─────────────────────────────────────────────────────
  private createAnims(): void {
    for (let p = 0; p < PALETTES; p += 1) {
      for (const [dir, base] of [["down", 0], ["up", 7], ["right", 14]] as const) {
        this.anims.create({
          key: `c${p}-walk-${dir}`,
          frames: [base, base + 1, base + 2, base + 1].map((f) => ({ key: `char_${p}`, frame: f })),
          frameRate: 7, repeat: -1,
        });
        this.anims.create({
          key: `c${p}-type-${dir}`,
          frames: [base + 3, base + 4].map((f) => ({ key: `char_${p}`, frame: f })),
          frameRate: 3.3, repeat: -1,
        });
        this.anims.create({
          key: `c${p}-read-${dir}`,
          frames: [base + 5, base + 6].map((f) => ({ key: `char_${p}`, frame: f })),
          frameRate: 1.6, repeat: -1,
        });
      }
    }
    this.anims.create({
      key: "pc-on",
      frames: ["PC_FRONT_ON_1", "PC_FRONT_ON_2", "PC_FRONT_ON_3"].map((f) => ({ key: "decor", frame: f })),
      frameRate: 2.5, repeat: -1,
    });
  }

  private drawRoom(): void {
    // Flat warm floor with a barely-there grid: paper + terminal, no checker.
    const dark = typeof document !== "undefined" && document.documentElement.dataset.theme !== "light";
    const room = dark ? 0x262421 : 0xede9e0;
    const edge = dark ? 0x36332e : 0xd8d2c4;
    const gridColor = dark ? 0xede9e0 : 0x2b2926;
    this.add.rectangle(0, 0, WORLD_W, WORLD_H, room).setOrigin(0).setDepth(-12);
    const grid = this.add.graphics().setDepth(-11);
    grid.lineStyle(1, gridColor, 0.06);
    for (let c = 1; c < COLS; c += 1) grid.lineBetween(c * TILE, 0, c * TILE, WORLD_H);
    for (let r = 1; r < ROWS; r += 1) grid.lineBetween(0, r * TILE, WORLD_W, r * TILE);
    const border = this.add.graphics().setDepth(-10);
    border.lineStyle(2, edge, 1);
    border.strokeRect(1, 1, WORLD_W - 2, WORLD_H - 2);
    for (const d of DECOR) {
      const y = d.tall ? d.row * TILE - TILE : d.row * TILE;
      this.add.image(d.col * TILE, y, "decor", d.frame).setOrigin(0).setDepth(d.row * TILE + TILE - 0.1);
    }
    for (const desk of DESKS) {
      this.add.image(desk.pcCol * TILE, desk.pcRow * TILE, "decor", "DESK_FRONT").setOrigin(0).setDepth(desk.pcRow * TILE + TILE - 0.2);
      const pc = this.add.sprite(desk.pcCol * TILE, desk.pcRow * TILE - TILE, "decor", "PC_FRONT_OFF")
        .setOrigin(0).setDepth(desk.pcRow * TILE + TILE - 0.1);
      this.pcs.set(desk.id, pc);
      this.add.image(desk.seat.col * TILE, desk.seat.row * TILE, "decor", "CUSHIONED_CHAIR_BACK")
        .setOrigin(0).setDepth(desk.seat.row * TILE + TILE - 0.2);
    }
  }

  private setupCamera(): void {
    const cam = this.cameras.main;
    cam.setBounds(-TILE * 2, -TILE * 3, WORLD_W + TILE * 4, WORLD_H + TILE * 5);
    const fit = Math.min(cam.width / (WORLD_W + TILE * 2), cam.height / (WORLD_H + TILE * 4));
    // bias toward closeness: clawds are small and labels show from zoom 2.05
    cam.setZoom(Math.max(2.2, Math.min(3.2, fit * 1.3)));
    cam.centerOn(WORLD_W / 2, WORLD_H / 2);
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!p.isDown) return;
      cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
      cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
    });
    // click on empty space (no drag, no character) closes the terminal panel
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      const dragged = Phaser.Math.Distance.Between(p.downX, p.downY, p.upX, p.upY) > 5;
      if (!dragged && !this.charClicked) this.game.events.emit("select", null);
      this.charClicked = false;
    });
    this.input.on("wheel", (_p: unknown, _o: unknown, _dx: number, dy: number) => {
      cam.setZoom(Phaser.Math.Clamp(cam.zoom - dy * 0.0015, 1.2, 5));
    });
  }
}
