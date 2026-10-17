import {
  maskedImageMimeType,
  unmaskImageToken,
} from "@/lib/storage/masked-image";
import { getObject } from "@/lib/storage/r2";

/**
 * Serves the picture of a round whose answer is still a secret, under a name
 * that says nothing about it. Why the name has to be opaque, and how it is
 * made, is lib/storage/masked-image.ts.
 *
 * **Unlike the dev proxy (app/api/r2/[...key]), this runs in production.** It
 * has to: the CDN URL is the leak, so there is no direct path for the browser
 * to take instead. The bytes come over the S3 API, which means every masked
 * picture costs a function invocation and its egress — tolerable because only
 * the head-to-head and the daily mint these URLs (everything else still loads
 * straight from the CDN), every event image is capped at 1600px by
 * `images:shrink`, and the browser keeps each one for a day under a URL that
 * does not change while its round is on screen.
 *
 * **Every refusal is the same 404.** A bad token, a token that decrypts to a
 * key outside the event-image folders, and a missing object all answer
 * identically, so the route cannot be used to learn which of those a guess
 * was. The prefix check runs after decryption and holds even against a leaked
 * secret: decorative art and profile pictures are not reachable through here
 * whatever token is presented. It is unauthenticated on purpose — the games it
 * serves are playable signed out — and is excluded from the middleware matcher
 * so a picture does not cost a Supabase session refresh.
 *
 * `cache-control` is `private`: the token is per match, so a shared cache could
 * only ever serve it back to the two players who already have it, and storing
 * it at the edge would be paying to keep a copy nobody else can ask for.
 */

function notFound(): Response {
  return new Response("Not found", {
    status: 404,
    headers: { "cache-control": "no-store" },
  });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const objectKey = unmaskImageToken(token);
  if (!objectKey) return notFound();

  const fallbackType = maskedImageMimeType(objectKey);
  if (!fallbackType) return notFound();

  let object: Awaited<ReturnType<typeof getObject>>;
  try {
    object = await getObject(objectKey);
  } catch (error) {
    // An R2 outage is not the player's fault and is not a 404 either: the URL
    // is good and will work again. Logged without the key, which is the one
    // thing this route exists not to say.
    console.error(
      "masked-image: R2 read failed",
      error instanceof Error ? error.name : error,
    );
    return new Response("Bad gateway", {
      status: 502,
      headers: { "cache-control": "no-store" },
    });
  }
  if (!object) return notFound();

  const headers = new Headers({
    // R2's own type when it is an image type — what the CDN would have said —
    // and otherwise the extension's: an object uploaded by hand can carry
    // `application/octet-stream`, which with `nosniff` an `<img>` may refuse.
    "content-type": object.contentType.startsWith("image/")
      ? object.contentType
      : fallbackType,
    "cache-control": "private, max-age=86400",
    "x-content-type-options": "nosniff",
  });
  if (object.contentLength !== undefined) {
    headers.set("content-length", String(object.contentLength));
  }
  // No ETag: R2's is the MD5 of the bytes, the same in every match, so passing
  // it on would hand out a content hash with every picture (see the module).

  return new Response(object.body, { status: 200, headers });
}
