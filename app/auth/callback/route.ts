import { NextResponse, type NextRequest } from "next/server";

import {
  AFTER_SIGN_IN_PATH,
  publicOrigin,
  safeNextPath,
  SIGN_IN_PATH,
} from "@/lib/auth/paths";
import { createServerDbClient } from "@/lib/db/server";

/**
 * Where Supabase sends the browser back to.
 *
 * Two flows land here and both arrive as a `code` to be exchanged for a
 * session: the Google redirect, and the confirmation link emailed after an
 * email sign-up. The exchange has to happen in a Route Handler rather than a
 * Server Component because it *writes* cookies — the session is set on the
 * response, and a Server Component cannot mutate cookies.
 *
 * A failure is sent to the sign-in page with a code in the query rather than
 * rendered here. There is nothing useful to show on a URL the player never
 * typed, and the form is the one place that already turns a code into a
 * sentence in five languages.
 *
 * It lives at `/auth/callback`, outside the `(public)` group, so it carries no
 * header, no menu and no layout — a redirect has nothing to lay out.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  // Not `url.origin`: in production that is the proxy's upstream, localhost.
  const origin = publicOrigin(request.headers);
  const code = url.searchParams.get("code");
  const next = safeNextPath(url.searchParams.get("next")) ?? AFTER_SIGN_IN_PATH;

  /* The provider reports its own refusals here — a closed consent screen comes
     back as `error=access_denied`. That is the player changing their mind, so
     it goes back to the form with nothing said. */
  const providerError = url.searchParams.get("error");
  if (providerError) {
    return NextResponse.redirect(new URL(SIGN_IN_PATH, origin));
  }

  if (!code) {
    return NextResponse.redirect(
      new URL(`${SIGN_IN_PATH}?error=generic`, origin),
    );
  }

  const supabase = await createServerDbClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL(`${SIGN_IN_PATH}?error=provider-failed`, origin),
    );
  }

  return NextResponse.redirect(new URL(next, origin));
}
