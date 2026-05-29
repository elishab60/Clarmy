export const ALL_EFFORTS = ["low", "medium", "high", "xhigh", "max", "ultracode"] as const;
export type Effort = typeof ALL_EFFORTS[number];

export interface ModelSpec {
  readonly id: string;
  readonly apiId: string;
  readonly label: string;
  readonly tagline: string;
  readonly aliasFrom: readonly string[];
  readonly effortLevels: readonly Effort[];
  readonly defaultEffort: Effort | null;
}

export const MODELS: readonly ModelSpec[] = [
  {
    id: "opus-4.8",
    apiId: "claude-opus-4-8",
    label: "Opus 4.8",
    tagline: "newest, deepest reasoning",
    aliasFrom: ["claude-opus-4-8"],
    effortLevels: ["low", "medium", "high", "xhigh", "max", "ultracode"],
    defaultEffort: "xhigh",
  },
  {
    id: "opus-4.7",
    apiId: "claude-opus-4-7",
    label: "Opus 4.7",
    tagline: "deep reasoning",
    aliasFrom: [
      "claude-opus-4-7",
      "claude-opus-4-6",
      "claude-opus-4-5",
      "claude-opus-4-5-20251101",
    ],
    effortLevels: ["low", "medium", "high", "xhigh", "max"],
    defaultEffort: "xhigh",
  },
  {
    id: "sonnet-4.6",
    apiId: "claude-sonnet-4-6",
    label: "Sonnet 4.6",
    tagline: "balanced",
    aliasFrom: [
      "claude-sonnet-4-6",
      "claude-sonnet-4-5",
      "claude-sonnet-4-5-20250929",
      "claude-sonnet-4",
    ],
    effortLevels: ["low", "medium", "high", "max"],
    defaultEffort: "high",
  },
  {
    id: "haiku-4.5",
    apiId: "claude-haiku-4-5-20251001",
    label: "Haiku 4.5",
    tagline: "fastest",
    aliasFrom: [
      "claude-haiku-4-5",
      "claude-haiku-4-5-20251001",
    ],
    effortLevels: [],
    defaultEffort: null,
  },
];

export type ModelId = string;

export const MODEL_IDS: readonly string[] = MODELS.map((m) => m.id);
export const DEFAULT_MODEL_ID: string = MODELS[0]!.id;

const BY_ID = new Map<string, ModelSpec>(MODELS.map((m) => [m.id, m]));
const BY_API_ID = new Map<string, ModelSpec>();
for (const m of MODELS) {
  BY_API_ID.set(m.apiId, m);
  for (const a of m.aliasFrom) BY_API_ID.set(a, m);
}

export function isModelId(v: unknown): v is ModelId {
  return typeof v === "string" && BY_ID.has(v);
}

export function modelMeta(id: string | null | undefined): ModelSpec | null {
  if (!id) return null;
  return BY_ID.get(id) ?? null;
}

export function modelFromApiId(apiId: string | null | undefined): ModelId | null {
  if (!apiId) return null;
  const direct = BY_API_ID.get(apiId);
  if (direct) return direct.id;
  const lower = apiId.toLowerCase();
  for (const m of MODELS) {
    if (lower.includes(m.apiId)) return m.id;
    for (const a of m.aliasFrom) if (lower.includes(a)) return m.id;
  }
  return null;
}

export function apiIdFor(id: string): string | null {
  return BY_ID.get(id)?.apiId ?? null;
}

export function effortLevelsFor(id: string): readonly Effort[] {
  return BY_ID.get(id)?.effortLevels ?? [];
}

export function defaultEffortFor(id: string): Effort | null {
  return BY_ID.get(id)?.defaultEffort ?? null;
}

export function coerceEffortFor(id: string, wanted: Effort | null | undefined): Effort | null {
  const levels = effortLevelsFor(id);
  if (levels.length === 0) return null;
  if (wanted && levels.includes(wanted)) return wanted;
  return defaultEffortFor(id);
}

export function modelSupportsEffortFor(id: string): boolean {
  return effortLevelsFor(id).length > 0;
}
