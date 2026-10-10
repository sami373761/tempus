/**
 * Attaches every object under an R2 prefix to the event its filename names.
 *
 *   npm run images:attach -- --prefix bce/ \
 *     --source-url https://commons.wikimedia.org/ --license PD \
 *     --source-name "Wikimedia Commons" --primary [--dry-run]
 *
 * The filename *is* the mapping: `bce/formation-of-earth.jpeg` attaches to the
 * event with slug `formation-of-earth`. Nothing is guessed — a key whose base
 * name is not an existing slug is reported and skipped, never fuzzy-matched to
 * a near neighbour, because a mis-attached picture teaches the wrong thing.
 *
 * Per-object validation is `attachImage()`, the same code path as a single
 * `image:attach`, so a bulk run is exactly as strict.
 *
 * `--allow-any-key` passes straight through to `attachImage()`, which is what
 * makes a prefix outside the era folders attachable at all. The era folders
 * exist so an object's location cannot contradict the event's era category,
 * and that is worth keeping for the historical events — but a subject pool
 * uploaded under its own prefix (`film-dizi/`, the film & television posters)
 * has no era to agree with: every entry is common-era by construction, so the
 * folder would carry no information and copying 45 posters into `ce/` would
 * only duplicate the bytes. Without the flag such a run reports 45 skips.
 *
 * Provenance applies to the whole batch, which is only honest when the batch
 * really does share a source and licence. Mixed sources need separate runs.
 */

import { ListObjectsV2Command } from "@aws-sdk/client-s3";

import { connect, describeTarget, loadEnvFile } from "./db.ts";
import { assertKnownLicense, attachImage, r2 } from "./attach-core.ts";

interface Options {
  prefix: string;
  sourceUrl: string;
  license: string;
  sourceName: string | null;
  author: string | null;
  attribution: string | null;
  primary: boolean;
  dryRun: boolean;
  allowAnyKey: boolean;
}

function parseArgs(): Options {
  const argv = process.argv.slice(2);
  const get = (flag: string): string | null => {
    const i = argv.indexOf(`--${flag}`);
    return i === -1 ? null : (argv[i + 1] ?? null);
  };

  const prefix = get("prefix");
  const sourceUrl = get("source-url");
  const license = get("license");

  const missing = [
    ["--prefix", prefix],
    ["--source-url", sourceUrl],
    ["--license", license],
  ]
    .filter(([, v]) => !v)
    .map(([f]) => f);

  if (missing.length > 0) {
    throw new Error(
      `Missing required flag(s): ${missing.join(", ")}\n\n` +
        "--source-url and --license are not optional: image.source_page_url and\n" +
        "image.license_code are NOT NULL, so provenance is recorded for every file.\n" +
        "Never pass a source you have not verified — a fabricated rights claim is\n" +
        "worse than a missing image.",
    );
  }
  if (!/^https?:\/\//.test(sourceUrl!)) {
    throw new Error(`--source-url must be an http(s) URL, got: ${sourceUrl}`);
  }

  return {
    prefix: prefix!,
    sourceUrl: sourceUrl!,
    license: license!,
    sourceName: get("source-name"),
    author: get("author"),
    attribution: get("attribution"),
    primary: argv.includes("--primary"),
    dryRun: argv.includes("--dry-run"),
    allowAnyKey: argv.includes("--allow-any-key"),
  };
}

async function main(): Promise<void> {
  loadEnvFile();
  const options = parseArgs();
  const { s3, bucket } = r2();

  // Folder placeholders are zero-byte objects whose key ends in "/": R2's way
  // of showing an empty folder. Treating one as an image yields a 0-byte row.
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const page = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: options.prefix,
        ContinuationToken: token,
      }),
    );
    for (const object of page.Contents ?? []) {
      if (object.Key && !object.Key.endsWith("/")) keys.push(object.Key);
    }
    token = page.NextContinuationToken;
  } while (token);

  if (keys.length === 0) {
    console.log(`No objects under "${options.prefix}" in ${bucket}.`);
    return;
  }

  console.log(`bucket   : ${bucket}`);
  console.log(`prefix   : ${options.prefix}  (${keys.length} objects)`);
  console.log(`license  : ${options.license}`);
  console.log(`source   : ${options.sourceUrl}`);
  if (options.allowAnyKey) console.log("keys     : any (era folder check skipped)");
  console.log(`mode     : ${options.dryRun ? "dry run" : describeTarget()}\n`);

  const client = await connect();
  const attached: string[] = [];
  const failed: { key: string; reason: string }[] = [];

  try {
    // Fail the whole run before touching anything if the licence is unknown,
    // rather than after 30 successful inserts.
    await assertKnownLicense(client, options.license);

    for (const key of keys) {
      const slug = key.slice(key.lastIndexOf("/") + 1).replace(/\.[a-z0-9]+$/i, "");
      try {
        const result = await attachImage(client, s3, bucket, {
          event: slug,
          key,
          sourceUrl: options.sourceUrl,
          license: options.license,
          sourceName: options.sourceName,
          author: options.author,
          attribution: options.attribution,
          primary: options.primary,
          dryRun: options.dryRun,
          allowAnyKey: options.allowAnyKey,
        });
        attached.push(key);
        console.log(
          `ok    ${key} -> ${slug}  ` +
            `${result.width ?? "?"}x${result.height ?? "?"} ${result.mimeType}`,
        );
      } catch (error) {
        const reason = error instanceof Error ? error.message.split("\n")[0]! : String(error);
        failed.push({ key, reason });
        console.log(`SKIP  ${key}: ${reason}`);
      }
    }
  } finally {
    await client.end();
  }

  console.log(
    `\n${options.dryRun ? "would attach" : "attached"}: ${attached.length}` +
      `   skipped: ${failed.length}`,
  );
  if (failed.length > 0) {
    console.log("\nSkipped:");
    for (const f of failed) console.log(`  ${f.key}\n    ${f.reason}`);
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
