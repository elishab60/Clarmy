// Prints real daily activity (incl. transcript file paths) as JSON.
// node --experimental-transform-types scripts/dump-activity.ts [YYYY-MM-DD]
import { buildDailyActivity } from "../src/lib/claude-code/daily-activity.ts";
const date = process.argv[2] || new Date().toISOString().slice(0, 10);
const act = buildDailyActivity(date);
process.stdout.write(JSON.stringify(act, null, 2));
