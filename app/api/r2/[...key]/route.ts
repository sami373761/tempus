import { readGameCategoriesCached } from "@/lib/db/cached";
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
 *
 * **It serves more than images.** `3d-models/` is the explorer's coin, a `.glb`
 * that `GLTFLoader` reads as an ArrayBuffer — so the content type R2 reports
 * for it does not matter, only that the prefix and the extension are allowed
 * here. A key missing from either list looks exactly like a missing object.
 *
 * `videos/` is the Colosseum loop the coin replaced on 2026-10-07. Nothing on
 * the site reads it any more and the objects are still in the bucket, so the
 * prefix stays allowed rather than being deleted along with its last caller.
 * The `Range` support it needed stays for the same reason and costs the images
 * nothing: a `<video>` asks for byte ranges and Safari will not play a source
 * that answers one with the whole file, so `Range` is honoured by asking R2 for
 * the same range rather than by slicing a full download. R2 answers 206 for a
 * ranged GET; everything else still gets the whole object.
 */

/** Object keys the bucket actually serves to the browser. */
const ALLOWED_PREFIXES = [
  "bce/",
  "ce/",
  "future/",
  "homepage/",
  "date-guessing-game/",
  "comparison-game/",
  "film-dizi/",
  "when-born/",
  "basketball/",
  "football/",
  "1v1/",
  "videos/",
  "3d-models/",
  "user_profile_pictures/",
];

const ALLOWED_EXTENSIONS = /\.(jpe?g|png|webp|avif|mp4|glb)$/;

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

  const range = _request.headers.get("range") ?? undefined;
  const object = await getObject(objectKey, { range });
  if (!object) return new Response("Not found", { status: 404 });

  const headers = new Headers({
    "content-type": object.contentType,
    // Short, revalidatable cache: long enough that panning the timeline does
    // not re-fetch 2560px backdrops through the proxy on every render.
    "cache-control": "public, max-age=3600",
    // Advertised unconditionally, so a video element knows it may ask before
    // it has a reason to.
    "accept-ranges": "bytes",
  });
  if (object.contentLength !== undefined) {
    headers.set("content-length", String(object.contentLength));
  }
  if (object.contentRange) headers.set("content-range", object.contentRange);
  if (object.etag) headers.set("etag", object.etag);

  return new Response(object.body, {
    status: object.contentRange ? 206 : 200,
    headers,
  });
}
