import { DEFAULT_PROVIDER, type ProviderId } from "./providers.ts";

export const ALL_EFFORTS = ["low", "medium", "high", "xhigh", "max", "ultracode"] as const;
export type Effort = typeof ALL_EFFORTS[number];

export interface ModelSpec {
  readonly id: string;
  readonly provider: ProviderId;
  readonly apiId: string;
  readonly label: string;
  readonly tagline: string;
  readonly aliasFrom: readonly string[];
  readonly effortLevels: readonly Effort[];
  readonly defaultEffort: Effort | null;
}

// Model ids stay globally unique across providers so a single ModelId string is
// enough to recover its provider. effortLevels capture what each vendor's CLI
// actually exposes: Claude has a six-step ladder, Codex a reasoning-effort
// triple, Gemini none.
export const MODELS: readonly ModelSpec[] = [
  // ---- Anthropic / Claude -------------------------------------------------
  {
    id: "opus-4.8",
    provider: "claude",
    apiId: "claude-opus-4-8",
    label: "Opus 4.8",
    tagline: "newest, deepest reasoning",
    aliasFrom: [
      "claude-opus-4-8",
      // Folded in from the retired Opus 4.7 entry so older sessions and history
      // that reference these api ids still resolve to the current Opus.
      "claude-opus-4-7",
      "claude-opus-4-6",
      "claude-opus-4-5",
      "claude-opus-4-5-20251101",
    ],
    effortLevels: ["low", "medium", "high", "xhigh", "max", "ultracode"],
    defaultEffort: "xhigh",
  },
  {
    id: "sonnet-4.6",
    provider: "claude",
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
    provider: "claude",
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

  // ---- Google / Gemini ----------------------------------------------------
  {
    id: "gemini-2.5-pro",
    provider: "gemini",
    apiId: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    tagline: "deepest Gemini, long context",
    aliasFrom: ["gemini-2.5-pro", "gemini-2.5-pro-latest"],
    effortLevels: [],
    defaultEffort: null,
  },
  {
    id: "gemini-2.5-flash",
    provider: "gemini",
    apiId: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    tagline: "fast, cheap",
    aliasFrom: ["gemini-2.5-flash", "gemini-2.5-flash-latest"],
    effortLevels: [],
    defaultEffort: null,
  },

  // ---- OpenAI / Codex -----------------------------------------------------
  // Codex exposes reasoning effort via `-c model_reasoning_effort=<level>`.
  {
    id: "gpt-5-codex",
    provider: "codex",
    apiId: "gpt-5-codex",
    label: "GPT-5 Codex",
    tagline: "agentic coding default",
    aliasFrom: ["gpt-5-codex"],
    effortLevels: ["low", "medium", "high"],
    defaultEffort: "medium",
  },
  {
    id: "gpt-5",
    provider: "codex",
    apiId: "gpt-5",
    label: "GPT-5",
    tagline: "general reasoning",
    aliasFrom: ["gpt-5"],
    effortLevels: ["low", "medium", "high"],
    defaultEffort: "medium",
  },
  {
    id: "o4-mini",
    provider: "codex",
    apiId: "o4-mini",
    label: "o4-mini",
    tagline: "fast reasoning",
    aliasFrom: ["o4-mini"],
    effortLevels: ["low", "medium", "high"],
    defaultEffort: "medium",
  },
];

export type ModelId = string;

export const MODEL_IDS: readonly string[] = MODELS.map((m) => m.id);

const BY_ID = new Map<string, ModelSpec>(MODELS.map((m) => [m.id, m]));
const BY_API_ID = new Map<string, ModelSpec>();
for (const m of MODELS) {
  BY_API_ID.set(m.apiId, m);
  for (const a of m.aliasFrom) BY_API_ID.set(a, m);
}

const BY_PROVIDER = new Map<ProviderId, ModelSpec[]>();
for (const m of MODELS) {
  const list = BY_PROVIDER.get(m.provider) ?? [];
  list.push(m);
  BY_PROVIDER.set(m.provider, list);
}

export function modelsForProvider(provider: ProviderId): readonly ModelSpec[] {
  return BY_PROVIDER.get(provider) ?? [];
}

export function modelIdsForProvider(provider: ProviderId): readonly string[] {
  return modelsForProvider(provider).map((m) => m.id);
}

export function defaultModelFor(provider: ProviderId): string {
  return modelsForProvider(provider)[0]?.id ?? MODELS[0]!.id;
}

export function providerOfModel(id: string | null | undefined): ProviderId | null {
  if (!id) return null;
  return BY_ID.get(id)?.provider ?? null;
}

export const DEFAULT_MODEL_ID: string = defaultModelFor(DEFAULT_PROVIDER);

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
