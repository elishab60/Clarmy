export interface Pricing {
  readonly input: number;
  readonly output: number;
  readonly cacheRead: number;
  readonly cacheCreate: number;
}

const PER_MTOK: Record<string, Pricing> = {
  "claude-opus-4-7":           { input: 15,  output: 75, cacheRead: 1.50, cacheCreate: 18.75 },
  "claude-opus-4-6":           { input: 15,  output: 75, cacheRead: 1.50, cacheCreate: 18.75 },
  "claude-opus-4-5":           { input: 15,  output: 75, cacheRead: 1.50, cacheCreate: 18.75 },
  "claude-opus-4-5-20251101":  { input: 15,  output: 75, cacheRead: 1.50, cacheCreate: 18.75 },
  "claude-opus-4-1":           { input: 15,  output: 75, cacheRead: 1.50, cacheCreate: 18.75 },
  "claude-opus-4":             { input: 15,  output: 75, cacheRead: 1.50, cacheCreate: 18.75 },
  "claude-sonnet-4-6":         { input:  3,  output: 15, cacheRead: 0.30, cacheCreate:  3.75 },
  "claude-sonnet-4-5":         { input:  3,  output: 15, cacheRead: 0.30, cacheCreate:  3.75 },
  "claude-sonnet-4":           { input:  3,  output: 15, cacheRead: 0.30, cacheCreate:  3.75 },
  "claude-sonnet-4-5-20250929":{ input:  3,  output: 15, cacheRead: 0.30, cacheCreate:  3.75 },
  "claude-haiku-4-5":          { input:  1,  output:  5, cacheRead: 0.08, cacheCreate:  1.25 },
  "claude-haiku-4-5-20251001": { input:  1,  output:  5, cacheRead: 0.08, cacheCreate:  1.25 },
  "claude-3-5-haiku":          { input:  0.80, output: 4, cacheRead: 0.08, cacheCreate: 1 },
};

const UNKNOWN: Pricing = { input: 0, output: 0, cacheRead: 0, cacheCreate: 0 };

export function priceFor(model: string | undefined | null): Pricing {
  if (!model) return UNKNOWN;
  if (PER_MTOK[model]) return PER_MTOK[model];
  const lower = model.toLowerCase();
  if (lower.includes("opus")) return PER_MTOK["claude-opus-4-7"]!;
  if (lower.includes("sonnet")) return PER_MTOK["claude-sonnet-4-6"]!;
  if (lower.includes("haiku")) return PER_MTOK["claude-haiku-4-5"]!;
  return UNKNOWN;
}

export function estimateCost(model: string | undefined | null, tokens: {
  input: number; output: number; cacheRead?: number; cacheCreate?: number;
}): number {
  const p = priceFor(model);
  const inp = (tokens.input || 0) / 1_000_000 * p.input;
  const out = (tokens.output || 0) / 1_000_000 * p.output;
  const cr  = (tokens.cacheRead   || 0) / 1_000_000 * p.cacheRead;
  const cc  = (tokens.cacheCreate || 0) / 1_000_000 * p.cacheCreate;
  return inp + out + cr + cc;
}
