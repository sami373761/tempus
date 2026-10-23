"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import {
  setUsername,
  USERNAME_TAKEN,
  validateUsername,
  type UsernameCheck,
  type UsernameProblem,
} from "@/lib/db/accounts";
import { createAdminDbClient } from "@/lib/db/admin";
import { createServerDbClient } from "@/lib/db/server";
import { isDevelopment, isProduction } from "@/lib/env";
import {
  getCurrentUser,
  getVerifiedUser,
  hasPasswordIdentity,
} from "@/lib/auth/server";
import {
  ACCOUNT_PATH,
  AFTER_SIGN_IN_PATH,
  publicOrigin,
  RESET_PASSWORD_PATH,
  safeNextPath,
  SIGN_IN_PATH,
  VERIFY_PATH,
} from "@/lib/auth/paths";
import {
  allowAuthMail,
  RECOVERY_COOKIE,
  RECOVERY_TTL_SECONDS,
  signRecoveryMark,
  verifyRecoveryMark,
} from "@/lib/auth/mail-guard";
import { clientIp } from "@/lib/admin/client-ip";
import { authMail, type AuthMailKind } from "@/lib/mail/auth-mail";
import { isMailConfigured, sendMail } from "@/lib/mail/send";
import { readLocaleContext } from "@/lib/i18n/server";

/**
 * Everything a browser can do to its own account.
 *
 * All of it is a Server Action rather than a browser call to Supabase, for one
 * reason: the session has to arrive as an HTTP cookie that Server Components
 * can read on the very next render. A client-side `signInWithPassword` puts the
 * token in the browser and leaves the server blind until the next round trip,
 * so the menu would still say "sign in" on the page you just signed in from.
 *
 * **Errors come back as codes, never as sentences.** The UI ships in five
 * languages and Supabase's messages are English, so every failure below maps
 * to one of `AuthErrorCode` and the form looks the word up in the dictionary.
 * That also keeps provider wording out of the UI: "Invalid login credentials"
 * is the same answer as "Email not confirmed" as far as a form is concerned.
 *
 * `redirect()` works by throwing, so it is always called **outside** the
 * try/catch that wraps a Supabase call — swallowing it would turn a successful
 * sign-in into a silent no-op.
 */

export type AuthErrorCode =
  | "invalid-credentials"
  | "email-invalid"
  | "email-taken"
  | "password-weak"
  | "password-mismatch"
  /* Four refusals for one field, because the four need four sentences — see
     `UsernameProblem` in lib/db/accounts.ts, which this mirrors one-for-one.
     "3-20 characters, a-z, 0-9 and underscores" was the single sentence they
     replaced, and it is an answer to none of them: it does not say which
     character was refused to a name of the right length, and it is not even
     about length to a name that has a space in it. */
  | "username-short"
  | "username-long"
  | "username-spaces"
  /** The name carried something the column cannot hold — an accent, a Turkish
   *  ş or ı, a piece of punctuation. The offending characters travel with it in
   *  `AuthState.detail`, because the field gives no sign which ones it means. */
  | "username-chars"
  | "username-taken"
  | "rate-limited"
  | "provider-failed"
  /** The current password typed on the account page's change form was wrong.
   *  Deliberately not `invalid-credentials`: that one means "that email and
   *  password are not an account", which is a different sentence to show
   *  somebody who is already signed in. */
  | "current-password-wrong"
  /* The account page's picture upload (app/actions/avatar.ts). Here rather
     than in a union of its own so the panel's one `Feedback` can print them. */
  | "photo-too-large"
  | "photo-type"
  | "photo-unreadable"
  /** A confirmation or reset link that was already used, has expired, or was
   *  cut short in transit. Raised on `/verify` and shown on the sign-in form. */
  | "link-expired"
  | "generic";

/**
 * What a form gets back.
 *
 * `confirm` is not an error: with email confirmation on in Supabase, a correct
 * sign-up returns no session and the player has to open their inbox. The form
 * has to be able to say so rather than looking like it failed.
 */
export type AuthState =
  | { status: "idle" }
  /** `detail` is the one piece of a failure that cannot be a code: the
   *  characters a username was refused for are the player's own text, so they
   *  are filled into the sentence (`{chars}`) rather than looked up. Every
   *  other failure leaves it unset. */
  | { status: "error"; code: AuthErrorCode; detail?: string }
  | { status: "confirm"; email: string }
  /** A reset link was asked for. Said the same way whether or not the address
   *  has an account, so the form cannot be used to find out which do. */
  | { status: "sent"; email: string }
  /** The account page's two forms. A distinct state rather than a return to
   *  `idle`, so "nothing has been submitted" and "that worked" are tellable
   *  apart — otherwise a freshly loaded form announces a save it never made. */
  | { status: "saved" };

/** Supabase's own minimum is 6; 8 is the site's. Checked here as well as in the
 *  form, because a form check is a courtesy and not a constraint. */
const MIN_PASSWORD = 8;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function field(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Maps a Supabase auth failure onto one of our codes.
 *
 * Matched on the message because `AuthError.code` is not populated for every
 * failure this has to tell apart, and on substrings because the wording has
 * changed between releases before. Anything unrecognised is `generic`, which
 * is the right answer for an unknown provider error — it must not be reported
 * as wrong credentials.
 */
function mapAuthError(message: string, status?: number): AuthErrorCode {
  const text = message.toLowerCase();
  if (status === 429 || text.includes("rate limit")) return "rate-limited";
  if (text.includes("already registered") || text.includes("already been registered")) {
    return "email-taken";
  }
  if (text.includes("password")) return "password-weak";
  if (text.includes("invalid login") || text.includes("not confirmed")) {
    return "invalid-credentials";
  }
  if (text.includes("email")) return "email-invalid";
  return "generic";
}

/**
 * A refused username, as a code the form can say out loud — plus the
 * characters that were refused, when there are any.
 *
 * One sentence per problem rather than one for all of them: the field cannot
 * show a player which characters it will not hold, so for `bad-characters` the
 * sentence names them, and for the three others it names the rule that was
 * broken instead of reciting all of them.
 *
 * **Nothing here edits the name.** It used to: the action ran the typed text
 * through `normalizeUsername`, which *strips* anything the column cannot hold,
 * so "ali_şahin" was saved as "ali_ahin" and the form reported a successful
 * save of a name nobody had asked for. Silently keeping part of a name is
 * worse than refusing the whole of it. See `validateUsername`.
 */
function usernameError(
  check: Extract<UsernameCheck, { ok: false }>,
): AuthState {
  const CODES: Record<UsernameProblem, AuthErrorCode> = {
    "too-short": "username-short",
    "too-long": "username-long",
    "has-space": "username-spaces",
    "bad-characters": "username-chars",
  };

  return {
    status: "error",
    code: CODES[check.problem],
    detail: check.rejected || undefined,
  };
}

/** Where to land after a successful sign-in. */
function destination(form: FormData): string {
  return safeNextPath(field(form, "next")) ?? AFTER_SIGN_IN_PATH;
}

export async function signInWithEmail(
  _state: AuthState,
  form: FormData,
): Promise<AuthState> {
  const email = field(form, "email");
  const password = String(form.get("password") ?? "");

  if (!EMAIL_RE.test(email)) return { status: "error", code: "email-invalid" };
  if (!password) return { status: "error", code: "invalid-credentials" };

  const supabase = await createServerDbClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { status: "error", code: mapAuthError(error.message, error.status) };
  }

  revalidatePath("/", "layout");
  redirect(destination(form));
}

export async function signUpWithEmail(
  _state: AuthState,
  form: FormData,
): Promise<AuthState> {
  const email = field(form, "email");
  const password = String(form.get("password") ?? "");
  const rawUsername = field(form, "username");

  const checked = validateUsername(rawUsername);
  if (!checked.ok) return usernameError(checked);
  const username = checked.username;

  if (!EMAIL_RE.test(email)) return { status: "error", code: "email-invalid" };
  if (password.length < MIN_PASSWORD) {
    return { status: "error", code: "password-weak" };
  }

  const supabase = await createServerDbClient();

  /* The normal path: Supabase creates the account and mints the token, we
     send the mail. See lib/mail/send.ts for why the mailer is ours. */
  if (isMailConfigured()) {
    return signUpWithOwnMail(email, password, username, destination(form));
  }

  /* **Development without a mail key: no confirmation email.** The account is
     created already confirmed through the Admin API and signed straight in,
     so the site can be tried with addresses that receive no mail. The
     metadata is the same `username` the trigger reads on the public path.
     Production never takes this branch; see `isDevelopment`. */
  if (isDevelopment()) {
    const { error: createError } = await createAdminDbClient().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username },
    });
    if (createError) {
      const taken = /already (been )?registered|already exists/i.test(createError.message);
      return {
        status: "error",
        code: taken ? "email-taken" : mapAuthError(createError.message, createError.status),
      };
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (signInError) {
      return { status: "error", code: mapAuthError(signInError.message, signInError.status) };
    }

    revalidatePath("/", "layout");
    redirect(destination(form));
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Read by `handle_new_user()`, the trigger that creates the profile row.
      // A name already taken does not fail the sign-up: the trigger swallows
      // the collision and the account page asks for another one.
      data: { username },
      emailRedirectTo: await callbackUrl(),
    },
  });

  if (error) {
    return { status: "error", code: mapAuthError(error.message, error.status) };
  }

  /* An existing email does not come back as an error while confirmations are
     on — Supabase deliberately obfuscates it, and returns a user with no
     identities instead. Saying "that email is taken" is the honest reading and
     leaks nothing a password-reset form would not. */
  if (data.user && data.user.identities?.length === 0) {
    return { status: "error", code: "email-taken" };
  }

  // No session means confirmation is required. That is a success with one more
  // step in it, not a failure.
  if (!data.session) return { status: "confirm", email };

  revalidatePath("/", "layout");
  redirect(destination(form));
}

/**
 * Sign-up with the confirmation mail sent by us.
 *
 * `generateLink({ type: "signup" })` creates the unconfirmed account (the
 * profile trigger fires exactly as for `signUp`) and returns the token
 * without mailing anything. Asked again for an address that is still
 * unconfirmed, it issues a fresh token and voids the old one — which is what
 * makes "I never got the mail" answerable by simply signing up again.
 */
async function signUpWithOwnMail(
  email: string,
  password: string,
  username: string,
  next: string,
): Promise<AuthState> {
  if (!allowAuthMail(email, clientIp(await headers()))) {
    return { status: "error", code: "rate-limited" };
  }

  const { data, error } = await createAdminDbClient().auth.admin.generateLink({
    type: "signup",
    email,
    password,
    options: { data: { username } },
  });

  if (error) {
    if (error.code === "email_exists" || error.status === 422) {
      return { status: "error", code: "email-taken" };
    }
    return { status: "error", code: mapAuthError(error.message, error.status) };
  }

  const sent = await mailLink("confirm", email, data.properties.hashed_token, next);
  if (!sent) return { status: "error", code: "generic" };

  return { status: "confirm", email };
}

/**
 * Mails a password-reset link.
 *
 * The answer is `sent` for every well-formed address, account or not: a form
 * that said "no such account" would let anyone test which addresses play
 * here. The throttle applies before that question is asked, so it leaks
 * nothing either.
 */
export async function requestPasswordReset(
  _state: AuthState,
  form: FormData,
): Promise<AuthState> {
  const email = field(form, "email");
  if (!EMAIL_RE.test(email)) return { status: "error", code: "email-invalid" };

  if (!allowAuthMail(email, clientIp(await headers()))) {
    return { status: "error", code: "rate-limited" };
  }

  const { data, error } = await createAdminDbClient().auth.admin.generateLink({
    type: "recovery",
    email,
  });

  // 404 is "no account with that address": answered like a success, above.
  if (error) {
    return error.status === 404
      ? { status: "sent", email }
      : { status: "error", code: "generic" };
  }

  const sent = await mailLink("recovery", email, data.properties.hashed_token, null);
  if (!sent) return { status: "error", code: "generic" };

  return { status: "sent", email };
}

/**
 * Sends the link to `/verify`, never straight to a session.
 *
 * The mail points at a page with a button rather than at something that
 * signs in on a GET: corporate mail scanners and link previews open every URL
 * in a message, and a one-time token spent by a scanner is a link that says
 * "expired" to its owner. Only the press on that page spends it.
 *
 * In development with no mail key the link is printed to the server log
 * instead, so the reset flow can still be walked through locally.
 */
async function mailLink(
  kind: AuthMailKind,
  email: string,
  tokenHash: string,
  next: string | null,
): Promise<boolean> {
  const query = new URLSearchParams({
    token_hash: tokenHash,
    type: kind === "confirm" ? "signup" : "recovery",
  });
  const safe = safeNextPath(next);
  if (safe && safe !== AFTER_SIGN_IN_PATH) query.set("next", safe);
  const link = `${await siteOrigin()}${VERIFY_PATH}?${query}`;

  if (!isMailConfigured()) {
    if (!isDevelopment()) return false;
    console.info(`[mail] ${kind} link for ${email}: ${link}`);
    return true;
  }

  const { t } = await readLocaleContext();
  return sendMail(authMail(kind, t, email, link));
}

/**
 * Spends a link from one of our mails: the press on `/verify`.
 *
 * A Server Action rather than a Route Handler because it is answered by a
 * form, and an action may write the session cookie. A recovery also leaves
 * the signed mark the reset page asks for — see lib/auth/mail-guard.ts.
 */
export async function confirmEmailLink(form: FormData): Promise<void> {
  const tokenHash = field(form, "token_hash");
  const type = field(form, "type");
  const next = safeNextPath(field(form, "next")) ?? AFTER_SIGN_IN_PATH;

  if (!tokenHash || (type !== "signup" && type !== "recovery")) {
    redirect(`${SIGN_IN_PATH}?error=link-expired`);
  }

  const supabase = await createServerDbClient();
  const { data, error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });

  if (error || !data.user) redirect(`${SIGN_IN_PATH}?error=link-expired`);

  revalidatePath("/", "layout");

  if (type === "recovery") {
    (await cookies()).set(RECOVERY_COOKIE, signRecoveryMark(data.user.id), {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction(),
      path: RESET_PASSWORD_PATH,
      maxAge: RECOVERY_TTL_SECONDS,
    });
    redirect(RESET_PASSWORD_PATH);
  }

  redirect(next);
}

/**
 * Sets a new password after a reset link — no current password asked,
 * because the link was the proof. Only with the recovery mark, never on the
 * strength of a session alone (see `updatePassword` for why that matters).
 *
 * Every other session of the account is signed out: a reset is often the
 * answer to "someone else has my password", and leaving their session alive
 * would make it no answer at all.
 */
export async function resetPassword(
  _state: AuthState,
  form: FormData,
): Promise<AuthState> {
  const user = await getVerifiedUser();
  const jar = await cookies();
  if (!user || !verifyRecoveryMark(jar.get(RECOVERY_COOKIE)?.value, user.id)) {
    return { status: "error", code: "link-expired" };
  }

  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (password.length < MIN_PASSWORD) {
    return { status: "error", code: "password-weak" };
  }
  if (password !== confirm) return { status: "error", code: "password-mismatch" };

  const supabase = await createServerDbClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return { status: "error", code: mapAuthError(error.message, error.status) };
  }

  await supabase.auth.signOut({ scope: "others" });
  jar.delete({ name: RECOVERY_COOKIE, path: RESET_PASSWORD_PATH });

  revalidatePath("/", "layout");
  redirect(ACCOUNT_PATH);
}

/**
 * Hands the browser Google's consent URL.
 *
 * Started on the server so the PKCE verifier is written as a cookie the
 * callback route can read back; `data.url` is then a plain redirect. Needs the
 * Google provider enabled in the Supabase dashboard — without it this is the
 * one failure that is genuinely the provider's and it reports as
 * `provider-failed`.
 */
export async function signInWithGoogle(
  _state: AuthState,
  form: FormData,
): Promise<AuthState> {
  const next = safeNextPath(field(form, "next"));
  const supabase = await createServerDbClient();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: await callbackUrl(next) },
  });

  if (error || !data.url) return { status: "error", code: "provider-failed" };

  /* Checked before the browser is sent there, because `signInWithOAuth` never
     contacts the provider — it only builds the URL, so it cannot tell an
     enabled provider from a missing one. With Google switched off in the
     Supabase dashboard that URL answers 400, and redirecting to it leaves the
     player on a JSON error page on another origin with no way back. One GET
     turns that into this form saying so in their own language.
     
     It is only a guard: anything other than a client error is let through, so a
     provider that is merely slow, or a check that cannot be made at all, still
     reaches Google. The cost is one round trip on a press that is about to do a
     full page redirect anyway. */
  if (await providerRefuses(data.url)) {
    return { status: "error", code: "provider-failed" };
  }

  redirect(data.url);
}

/** True only when the authorize endpoint answers a 4xx — a misconfigured
 *  provider. A 3xx is the normal answer and means Google is ready. */
async function providerRefuses(url: string): Promise<boolean> {
  try {
    /* GET, not HEAD: Supabase's authorize endpoint answers every HEAD with a
       405, which read as "provider refused" and blocked Google even when it
       was enabled. The 302 body is empty, so a GET costs nothing more. */
    const response = await fetch(url, { method: "GET", redirect: "manual" });
    return response.status >= 400 && response.status < 500;
  } catch {
    // Cannot tell. Let the redirect happen rather than refusing a sign-in
    // because one extra request failed.
    return false;
  }
}

export async function signOut(): Promise<void> {
  const supabase = await createServerDbClient();
  await supabase.auth.signOut();

  revalidatePath("/", "layout");
  redirect("/");
}

/** Renames the signed-in player. The only column `authenticated` may write. */
export async function updateUsername(
  _state: AuthState,
  form: FormData,
): Promise<AuthState> {
  const user = await getCurrentUser();
  if (!user) redirect(SIGN_IN_PATH);

  const checked = validateUsername(field(form, "username"));
  if (!checked.ok) return usernameError(checked);

  try {
    await setUsername(await createServerDbClient(), user.id, checked.username);
  } catch (error) {
    if (error instanceof Error && error.message === USERNAME_TAKEN) {
      return { status: "error", code: "username-taken" };
    }
    return { status: "error", code: "generic" };
  }

  // The menu prints the name, and it lives in the layout — so the whole tree
  // has to be revalidated, not just this page.
  revalidatePath("/", "layout");
  return { status: "saved" };
}

/**
 * Changes the password of whoever is signed in, or sets a first one.
 *
 * **Which of those two it is comes from the session, never from the form.** A
 * Google-only account has no password to be asked for, so requiring one would
 * make this form impossible to submit; an email account has one, and asking for
 * it is what stops a borrowed, unlocked browser from locking its owner out of
 * their own account. The browser is told which shape to draw, but the server
 * decides again from `user.identities` — a hidden field saying "I have no
 * password" would otherwise be the whole of the check.
 *
 * The current password is verified by signing in with it rather than by a
 * compare of our own: Supabase keeps the hash and offers no "is this the
 * password" call, and a failed `signInWithPassword` leaves the existing session
 * untouched. A successful one re-issues cookies for the same user, which is a
 * no-op from the page's point of view.
 *
 * Setting a first password does **not** cost the player their Google sign-in —
 * Supabase adds the email identity beside the existing one, so both doors work
 * afterwards. That is why this is a "set", not a "switch".
 */
export async function updatePassword(
  _state: AuthState,
  form: FormData,
): Promise<AuthState> {
  const user = await getVerifiedUser();
  if (!user) redirect(SIGN_IN_PATH);

  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  const current = String(form.get("current") ?? "");

  if (password.length < MIN_PASSWORD) {
    return { status: "error", code: "password-weak" };
  }
  if (password !== confirm) return { status: "error", code: "password-mismatch" };

  const supabase = await createServerDbClient();
  const hasPassword = hasPasswordIdentity(user);

  if (hasPassword) {
    if (!current) return { status: "error", code: "current-password-wrong" };
    /* `user.email` is non-null for an account with an email identity, but the
       type does not say so — and an account that somehow had neither cannot be
       verified, which is a refusal rather than a free pass. */
    if (!user.email) return { status: "error", code: "generic" };

    const { error: wrong } = await supabase.auth.signInWithPassword({
      email: user.email,
      password: current,
    });
    if (wrong) return { status: "error", code: "current-password-wrong" };
  }

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    return { status: "error", code: mapAuthError(error.message, error.status) };
  }

  /* A first password changes what this page has to offer — the next render has
     to see the email identity Supabase has just added, or the form keeps
     offering to set a password that now exists. Only on that branch: a plain
     change alters nothing any page reads. */
  if (!hasPassword) revalidatePath("/", "layout");

  return { status: "saved" };
}

/**
 * The absolute URL Supabase sends the browser back to.
 *
 * Built from the request's own `Host` rather than from an environment variable,
 * for the same reason the versus invite is read from `window.location`: the
 * site has no domain yet, and a baked-in origin is wrong on localhost, wrong on
 * the LAN address a phone uses, and wrong again on a preview deployment.
 *
 * `x-forwarded-proto` is what Vercel sets; the fallback to http is for the dev
 * server, where there is no proxy and no TLS.
 */
async function callbackUrl(next?: string | null): Promise<string> {
  const safe = safeNextPath(next);
  const query = safe ? `?next=${encodeURIComponent(safe)}` : "";
  return `${await siteOrigin()}/auth/callback${query}`;
}

/** This request's own origin — the base of every link we hand out. */
async function siteOrigin(): Promise<string> {
  return publicOrigin(await headers());
}
