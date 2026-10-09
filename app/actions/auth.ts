"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { normalizeUsername, setUsername, USERNAME_TAKEN } from "@/lib/db/accounts";
import { createServerDbClient } from "@/lib/db/server";
import { getCurrentUser, hasPasswordIdentity } from "@/lib/auth/server";
import { ACCOUNT_PATH, safeNextPath, SIGN_IN_PATH } from "@/lib/auth/paths";

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
  | "username-invalid"
  | "username-taken"
  | "rate-limited"
  | "provider-failed"
  /** The current password typed on the account page's change form was wrong.
   *  Deliberately not `invalid-credentials`: that one means "that email and
   *  password are not an account", which is a different sentence to show
   *  somebody who is already signed in. */
  | "current-password-wrong"
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
  | { status: "error"; code: AuthErrorCode }
  | { status: "confirm"; email: string }
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

/** Where to land after a successful sign-in. */
function destination(form: FormData): string {
  return safeNextPath(field(form, "next")) ?? ACCOUNT_PATH;
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

  const username = normalizeUsername(rawUsername);
  if (!username) return { status: "error", code: "username-invalid" };
  if (!EMAIL_RE.test(email)) return { status: "error", code: "email-invalid" };
  if (password.length < MIN_PASSWORD) {
    return { status: "error", code: "password-weak" };
  }

  const supabase = await createServerDbClient();
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
     player on a JSON error page on another origin with no way back. One HEAD
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
    const response = await fetch(url, { method: "HEAD", redirect: "manual" });
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

  const username = normalizeUsername(field(form, "username"));
  if (!username) return { status: "error", code: "username-invalid" };

  try {
    await setUsername(await createServerDbClient(), user.id, username);
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
  const user = await getCurrentUser();
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
  const head = await headers();
  const host = head.get("x-forwarded-host") ?? head.get("host") ?? "localhost:3000";
  const proto =
    head.get("x-forwarded-proto") ??
    (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");

  const safe = safeNextPath(next);
  const query = safe ? `?next=${encodeURIComponent(safe)}` : "";
  return `${proto}://${host}/auth/callback${query}`;
}
