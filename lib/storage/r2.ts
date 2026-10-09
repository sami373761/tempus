import "server-only";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { serverEnv } from "../env.ts";

/**
 * Cloudflare R2 access via its S3-compatible API.
 *
 * Reads go directly to the public CDN domain (see lib/storage/images.ts); this
 * module exists only for writes and for issuing presigned upload URLs to a
 * future admin UI. Credentials stay on the server.
 */

let client: S3Client | null = null;

function r2(): { s3: S3Client; bucket: string } {
  const env = serverEnv();

  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${env.r2AccountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.r2AccessKeyId,
      secretAccessKey: env.r2SecretAccessKey,
    },
  });

  return { s3: client, bucket: env.r2Bucket };
}

export function r2BucketName(): string {
  return serverEnv().r2Bucket;
}

export async function putObject(options: {
  objectKey: string;
  body: Uint8Array | Buffer;
  contentType: string;
  /** Immutable by default: object keys already include the image id. */
  cacheControl?: string;
}): Promise<void> {
  const { s3, bucket } = r2();

  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: options.objectKey,
      Body: options.body,
      ContentType: options.contentType,
      CacheControl: options.cacheControl ?? "public, max-age=31536000, immutable",
    }),
  );
}

export async function deleteObject(objectKey: string): Promise<void> {
  const { s3, bucket } = r2();
  await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: objectKey }));
}

export async function objectExists(objectKey: string): Promise<boolean> {
  const { s3, bucket } = r2();
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: objectKey }));
    return true;
  } catch (error) {
    if (isNotFound(error)) return false;
    throw error;
  }
}

export interface FetchedObject {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  /** Bytes in *this* response — the slice, when a range was asked for. */
  contentLength: number | undefined;
  /** Set only for a ranged read; the caller answers 206 when it is present. */
  contentRange: string | undefined;
  etag: string | undefined;
}

/**
 * Streams one object out of the bucket over the S3 API.
 *
 * Reads normally bypass this module entirely and go to the public CDN domain,
 * so the only caller is the dev-only image proxy (`app/api/r2/[...key]`): the
 * S3 endpoint resolves from networks where `r2.dev` does not. Returns null for
 * a missing key so the caller can answer 404 rather than 500.
 *
 * `range` is passed straight through to R2 rather than being applied to a full
 * download, which is what the proxy needs to serve a `<video>` honestly: the
 * element asks for byte ranges and Safari will not play a source that answers
 * the whole file to one.
 */
export async function getObject(
  objectKey: string,
  options: { range?: string } = {},
): Promise<FetchedObject | null> {
  const { s3, bucket } = r2();

  try {
    const response = await s3.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Range: options.range,
      }),
    );
    if (!response.Body) return null;

    return {
      body: response.Body.transformToWebStream(),
      contentType: response.ContentType ?? "application/octet-stream",
      contentLength: response.ContentLength,
      contentRange: response.ContentRange,
      etag: response.ETag,
    };
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

/** Presigned PUT URL so a browser can upload straight to R2. */
export async function createPresignedUploadUrl(options: {
  objectKey: string;
  contentType: string;
  expiresInSeconds?: number;
}): Promise<string> {
  const { s3, bucket } = r2();

  return getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: bucket,
      Key: options.objectKey,
      ContentType: options.contentType,
    }),
    { expiresIn: options.expiresInSeconds ?? 600 },
  );
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const name = "name" in error ? String(error.name) : "";
  const status =
    "$metadata" in error &&
    typeof error.$metadata === "object" &&
    error.$metadata !== null &&
    "httpStatusCode" in error.$metadata
      ? Number(error.$metadata.httpStatusCode)
      : undefined;
  return name === "NotFound" || name === "NoSuchKey" || status === 404;
}
