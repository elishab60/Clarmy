import Phaser from "phaser";
import { buildBlocked, COLS, DECOR, DESKS, floorFrame, ROWS, WORLD_H, WORLD_W } from "./layout";
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

  constructor() {
    super("office");
  }

  preload(): void {
    this.load.atlas("decor", "/office/atlas.png", "/office/atlas.json");
    for (let p = 0; p < PALETTES; p += 1) {
      this.load.spritesheet(`char_${p}`, `/office/characters/char_${p}.png`, { frameWidth: 16, frameHeight: 32 });
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

  update(_time: number, delta: number): void {
    for (const ch of this.chars.values()) {
      ch.update(delta);
      ch.container.setDepth(ch.container.y);
    }
    for (const list of this.minis.values()) for (const m of list) {
      m.update(delta);
      m.container.setDepth(m.container.y);
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
    // the tileset is light; multiply-tint floor and walls toward the theme
    const dark = typeof document !== "undefined" && document.documentElement.dataset.theme !== "light";
    const floorTint = dark ? 0x6a6a74 : 0xffffff;
    const wallTint = dark ? 0x55555e : 0xffffff;
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        if (this.blocked.has(key(c, r)) && (r === 0 || c === 0 || c === COLS - 1 || r === ROWS - 1)) continue;
        this.add.image(c * TILE, r * TILE, "decor", floorFrame(c, r)).setOrigin(0).setDepth(-10).setTint(floorTint);
      }
    }
    // walls: bitmask pieces (bit0=N, bit1=E, bit2=S, bit3=W neighbour walls)
    const isWall = (c: number, r: number) => c === 0 || r === 0 || c === COLS - 1 || r === ROWS - 1;
    for (let r = 0; r < ROWS; r += 1) {
      for (let c = 0; c < COLS; c += 1) {
        if (!isWall(c, r)) continue;
        const mask = (isWall(c, r - 1) && r > 0 ? 1 : 0)
          | (isWall(c + 1, r) && c < COLS - 1 ? 2 : 0)
          | (isWall(c, r + 1) && r < ROWS - 1 ? 4 : 0)
          | (isWall(c - 1, r) && c > 0 ? 8 : 0);
        this.add.image(c * TILE, r * TILE - TILE, "decor", `wall_${mask}`).setOrigin(0).setDepth(r === 0 ? -5 : r * TILE + TILE).setTint(wallTint);
      }
    }
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
    cam.setZoom(Math.max(1.6, Math.min(3, fit)));
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
