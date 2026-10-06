import { getObject } from "@/lib/storage/r2";

/**
 * Development-only image proxy for the R2 bucket.
 *
 * The bucket's public hostname (`*.r2.dev`) is unreachable from some networks
 * without a VPN, while the S3 API endpoint (`*.r2.cloudflarestorage.com`)
 * resolves fine. This route reads the bytes over the S3 API and serves them
 * from localhost, so pointing NEXT_PUBLIC_R2_PUBLIC_BASE_URL at `/api/r2`
 * makes every image render without a VPN. `publicImageUrl()` stays the single
 * place that builds image URLs.
 *
 * It is a stopgap for local work only: in production the browser must talk to
 * the CDN directly, so this answers 404 outside `next dev` rather than quietly
 * routing all image traffic through the server.
 */

/** Object keys the bucket actually serves to the browser. */
const ALLOWED_PREFIXES = [
  "bce/",
  "ce/",
  "future/",
  "homepage/",
  "date-guessing-game/",
  "comparison-game/",
];

const ALLOWED_EXTENSIONS = /\.(jpe?g|png|webp|avif)$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }

  const { key } = await params;
  const objectKey = key.map(decodeURIComponent).join("/");

  // Reject anything the bucket would not legitimately serve as site imagery:
  // this endpoint is unauthenticated, so it must not become a way to read
  // arbitrary keys or escape the prefixes above.
  if (
    objectKey.includes("..") ||
    !ALLOWED_PREFIXES.some((prefix) => objectKey.startsWith(prefix)) ||
    !ALLOWED_EXTENSIONS.test(objectKey)
  ) {
    return new Response("Forbidden", { status: 403 });
  }

  const object = await getObject(objectKey);
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers({
    "content-type": object.contentType,
    // Short, revalidatable cache: long enough that panning the timeline does
    // not re-fetch 2560px backdrops through the proxy on every render.
    "cache-control": "public, max-age=3600",
  });
  if (object.contentLength !== undefined) {
    headers.set("content-length", String(object.contentLength));
  }
  if (object.etag) headers.set("etag", object.etag);

  return new Response(object.body, { headers });
}
