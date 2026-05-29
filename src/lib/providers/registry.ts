import type { ProviderId } from "../shared/types.ts";
import type { CliDriver } from "./types.ts";
import { claudeDriver } from "./claude/driver.ts";
import { geminiDriver } from "./gemini/driver.ts";
import { codexDriver } from "./codex/driver.ts";

const DRIVERS: Record<ProviderId, CliDriver> = {
  claude: claudeDriver,
  gemini: geminiDriver,
  codex: codexDriver,
};

export function getDriver(provider: ProviderId): CliDriver {
  return DRIVERS[provider] ?? claudeDriver;
}

export function allDrivers(): readonly CliDriver[] {
  return Object.values(DRIVERS);
}
