/**
 * Deletes ended head-to-head matches older than 12 hours (versus_sweep()).
 * For cron on the VPS (the schedule is an open point, §13), e.g. hourly:
 *
 *   0 * * * *  cd /srv/tempus && node --experimental-strip-types scripts/versus-sweep.ts
 *
 * The admin panel's Versus page has the same button.
 */

import { connect, describeTarget, loadEnvFile } from "./db.ts";

loadEnvFile();

const client = await connect();
try {
  const { rows } = await client.query<{ deleted: number }>("select public.versus_sweep() as deleted");
  console.log(`${describeTarget()}: ${rows[0]?.deleted ?? 0} match(es) swept`);
} finally {
  await client.end();
}
