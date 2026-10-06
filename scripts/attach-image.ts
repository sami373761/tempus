/**
 * Attaches an image already present in R2 to an event.
 *
 *   npm run image:attach -- \
 *     --event beginning-of-world-war-ii \
 *     --key world-war-2.webp \
 *     --source-url https://commons.wikimedia.org/wiki/File:Example.jpg \
 *     --license PD \
 *     --source-name "Wikimedia Commons" \
 *     --author "Some Photographer" \
 *     --primary
 *
 * Add --dry-run to validate everything without writing.
 *
 * The object must already exist in the bucket; this reads its real byte size,
 * content type, SHA-256 and pixel dimensions from R2 rather than trusting
 * anything typed on the command line. `--source-url` and `--license` are
 * mandatory because the schema makes them NOT NULL — an image in this database
 * always records where it came from and under what terms.
 *
 * The key must be `<era>/<filename>.<ext>` and the era folder must match the
 * event's own era, so an object's location can never contradict the event's
 * era category. `--allow-any-key` skips that check for legacy objects.
 */

import { connect, describeTarget, loadEnvFile } from "./db.ts";
import { attachImage, r2, type AttachOptions } from "./attach-core.ts";

function parseArgs(): AttachOptions {
  const argv = process.argv.slice(2);
  const get = (flag: string): string | null => {
    const i = argv.indexOf(`--${flag}`);
    return i === -1 ? null : (argv[i + 1] ?? null);
  };

  const event = get("event");
  const key = get("key");
  const sourceUrl = get("source-url");
  const license = get("license");

  const missing = [
    ["--event", event],
    ["--key", key],
    ["--source-url", sourceUrl],
    ["--license", license],
  ]
    .filter(([, v]) => !v)
    .map(([f]) => f);

  if (missing.length > 0) {
    throw new Error(
      `Missing required flag(s): ${missing.join(", ")}\n\n` +
        "--source-url and --license are not optional: image.source_page_url and\n" +
        "image.license_code are NOT NULL, so provenance is recorded for every file.",
    );
  }
  if (!/^https?:\/\//.test(sourceUrl!)) {
    throw new Error(`--source-url must be an http(s) URL, got: ${sourceUrl}`);
  }

  return {
    event: event!,
    key: key!,
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

  const client = await connect();
  try {
    if (!options.dryRun) console.log(`target     : ${describeTarget()}`);

    const r = await attachImage(client, s3, bucket, options);

    console.log(`object     : ${r.bucket}/${r.key}`);
    console.log(`era folder : ${r.era ?? "(none — unchecked)"}`);
    console.log(`event      : ${r.event}  (year ${r.eventYear}, era ${r.era ?? "?"})`);
    console.log(`mime type  : ${r.mimeType}`);
    console.log(`dimensions : ${r.width ?? "?"} x ${r.height ?? "?"}`);
    console.log(`bytes      : ${r.byteSize}`);
    console.log(`sha256     : ${r.checksum}`);
    console.log(`license    : ${options.license}`);
    console.log(`source     : ${options.sourceUrl}`);
    console.log(`primary    : ${options.primary}`);

    if (r.mimeType !== r.reportedContentType) {
      console.log(
        `\nnote: R2 reports content-type "${r.reportedContentType}" but the bytes are ` +
          `"${r.mimeType}". Storing the sniffed type.`,
      );
    }

    if (r.imageId === null) {
      console.log("\nDry run — nothing was written.");
      return;
    }

    console.log(`\nimage row  : ${r.imageId}`);
    console.log("ok");
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(`\n${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
