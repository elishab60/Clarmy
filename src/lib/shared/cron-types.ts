import type { ApprovalMode, Effort, ModelId } from "./types";

export type CronSchedule =
  | { readonly kind: "recurring"; readonly expression: string }
  | { readonly kind: "oneshot"; readonly at: string };

export interface CronSpawnSpec {
  readonly project: string;
  readonly cwd: string;
  readonly name: string;
  readonly model: ModelId;
  readonly prompt: string;
  readonly allowedTools: readonly string[];
  readonly approvalMode: ApprovalMode;
  readonly branch?: string;
  readonly dangerouslySkipPermissions?: boolean;
  readonly effort?: Effort;
}

export interface CronRunRecord {
  readonly at: string;
  readonly status: "spawned" | "error";
  readonly sessionId?: string;
  readonly error?: string;
}

export interface CronJob {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly schedule: CronSchedule;
  readonly spawn: CronSpawnSpec;
  readonly enabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly runCount: number;
  readonly lastRun?: CronRunRecord;
  readonly nextFireAt?: string;
  readonly lastFiredAt?: string;
}

export type CronJobPatch = Partial<Omit<CronJob, "id" | "createdAt" | "runCount">>;
