export class RingBuffer<T> {
  private readonly buf: (T | undefined)[];
  private head = 0;
  private size = 0;

  constructor(private readonly capacity: number) {
    if (capacity <= 0) throw new Error("RingBuffer capacity must be positive");
    this.buf = new Array<T | undefined>(capacity);
  }

  push(value: T): void {
    this.buf[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    if (this.size < this.capacity) this.size++;
  }

  toArray(): T[] {
    const out: T[] = [];
    const start = this.size === this.capacity ? this.head : 0;
    for (let i = 0; i < this.size; i++) {
      const v = this.buf[(start + i) % this.capacity];
      if (v !== undefined) out.push(v);
    }
    return out;
  }

  get length(): number { return this.size; }

  clear(): void {
    this.head = 0;
    this.size = 0;
    for (let i = 0; i < this.capacity; i++) this.buf[i] = undefined;
  }
}
