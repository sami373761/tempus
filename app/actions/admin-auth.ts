"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { clientIp } from "@/lib/admin/client-ip";
import { atLeast } from "@/lib/admin/guard";
import { ADMIN_BASE, ADMIN_MFA, ADMIN_MFA_SETUP, ADMIN_SIGN_IN, adminEmailFor, usernameFromAdminEmail } from "@/lib/admin/path";
import { ADMIN_SEEN_COOKIE, ADMIN_SEEN_COOKIE_OPTIONS } from "@/lib/admin/session-seen";
import { isAdmin } from "@/lib/auth/admin";
import { adminRpc } from "@/lib/db/admin/rpc";
import { createServerDbClient } from "@/lib/db/server";

/**
 * The panel's sign-in steps. These are the only admin actions that do not
 * start with `requireAdmin()` — they are how a session becomes an admin one —
 * which is why they live outside app/actions/admin/ (admin:check scans that
 * folder for the rule).
 *
 * The failure message is one fixed sentence whatever went wrong: wrong
 * username, wrong password, not an admin, locked. Which one it was is never
 * said, and every reply takes at least MIN_REPLY_MS so the timing does not say
 * it either.
 */
const MIN_REPLY_MS = 400;
const BAD_CREDENTIALS = "Kullanıcı adı veya şifre hatalı.";
const BAD_CODE = "Kod hatalı. Telefondaki güncel kodu girin.";
const tooMany = (s: number) => `Çok fazla deneme. ${s} saniye sonra tekrar deneyin.`;
const USERNAME = /^[a-z0-9]{1,64}$/;

export type AuthStepState = { error: string | null };

async function stampSeen(): Promise<void> {
  (await cookies()).set(ADMIN_SEEN_COOKIE, String(Date.now()), ADMIN_SEEN_COOKIE_OPTIONS);
}

export async function adminSignIn(_prev: AuthStepState, form: FormData): Promise<AuthStepState> {
  const started = Date.now();
  const username = String(form.get("username") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const ip = clientIp(await headers());
  let next: string | null = null;

  const state = await (async (): Promise<AuthStepState> => {
    const wait = await adminRpc("admin_login_gate", { p_kind: "password", p_ip: ip, p_username: username || null });
    if ((wait ?? 0) > 0) return { error: tooMany(wait ?? 0) };

    const supabase = await createServerDbClient();
    // A player session in this browser is not reused: the panel signs it out
    // and opens its own.
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);

    const fail = async () => {
      await adminRpc("admin_login_record", { p_kind: "password", p_ip: ip, p_username: username || null, p_success: false });
      return { error: BAD_CREDENTIALS };
    };
    if (!USERNAME.test(username) || password.length === 0) return fail();

    const { data, error } = await supabase.auth.signInWithPassword({ email: adminEmailFor(username), password });
    if (error || !data.user) return fail();
    if (!isAdmin(data.user)) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      return fail();
    }

    await adminRpc("admin_login_record", { p_kind: "password", p_ip: ip, p_username: username, p_success: true });
    await stampSeen();
    const { data: factors } = await supabase.auth.mfa.listFactors();
    next = (factors?.totp ?? []).some((f) => f.status === "verified") ? ADMIN_MFA : ADMIN_MFA_SETUP;
    return { error: null };
  })().catch((error: unknown) => {
    console.error("adminSignIn:", error);
    return { error: BAD_CREDENTIALS };
  });

  await atLeast(MIN_REPLY_MS, started, null);
  if (next) redirect(next);
  return state;
}

/** Shared by the code step and the setup step's first verification. */
async function verifyCode(factorId: string | null, code: string): Promise<AuthStepState> {
  const started = Date.now();
  const ip = clientIp(await headers());
  const supabase = await createServerDbClient();
  const { data: claims } = await supabase.auth.getClaims();
  const username = usernameFromAdminEmail(claims?.claims.email as string | undefined);

  const state = await (async (): Promise<AuthStepState> => {
    if (!claims?.claims.sub) return { error: BAD_CODE };
    const wait = await adminRpc("admin_login_gate", { p_kind: "totp", p_ip: ip, p_username: username });
    if ((wait ?? 0) > 0) return { error: tooMany(wait ?? 0) };

    const fail = async () => {
      await adminRpc("admin_login_record", { p_kind: "totp", p_ip: ip, p_username: username, p_success: false });
      return { error: BAD_CODE };
    };
    if (!/^\d{6}$/.test(code)) return fail();

    let id = factorId;
    if (!id) {
      const { data } = await supabase.auth.mfa.listFactors();
      id = (data?.totp ?? []).find((f) => f.status === "verified")?.id ?? null;
    }
    if (!id) return fail();

    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: id, code });
    if (error) return fail();
    await adminRpc("admin_login_record", { p_kind: "totp", p_ip: ip, p_username: username, p_success: true });
    await stampSeen();
    return { error: null };
  })().catch((error: unknown) => {
    console.error("adminVerifyTotp:", error);
    return { error: BAD_CODE };
  });

  await atLeast(MIN_REPLY_MS, started, null);
  return state;
}

export async function adminVerifyTotp(_prev: AuthStepState, form: FormData): Promise<AuthStepState> {
  const state = await verifyCode(null, String(form.get("code") ?? "").replace(/\s+/g, ""));
  if (!state.error) redirect(ADMIN_BASE);
  return state;
}

export async function adminVerifyEnrollment(_prev: AuthStepState, form: FormData): Promise<AuthStepState> {
  const factorId = String(form.get("factorId") ?? "");
  const state = await verifyCode(factorId || null, String(form.get("code") ?? "").replace(/\s+/g, ""));
  if (!state.error) redirect(ADMIN_BASE);
  return state;
}

export type Enrollment =
  | { ok: true; factorId: string; qrSvg: string; secret: string }
  | { ok: false; error: string };

/**
 * Starts TOTP setup: a new unverified factor, its QR and its text secret.
 * Only for a signed-in admin with no verified factor — an account that has
 * one must go through the code step (losing the phone is
 * `make-admin.ts --reset-mfa`, never a button here).
 */
export async function adminStartEnrollment(): Promise<Enrollment> {
  const supabase = await createServerDbClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user || !isAdmin(userData.user)) return { ok: false, error: "Önce giriş yapın." };

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const all = factors?.all ?? [];
  if (all.some((f) => f.factor_type === "totp" && f.status === "verified")) {
    return { ok: false, error: "Bu hesapta doğrulayıcı zaten kurulu." };
  }
  // An abandoned setup leaves an unverified factor behind; a new one cannot
  // share its name, so it goes first.
  for (const f of all) {
    if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id }).catch(() => undefined);
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "TEMPUS Admin",
    issuer: "TEMPUS Admin",
  });
  if (error || !data) return { ok: false, error: "Kurulum başlatılamadı. TOTP'nin Supabase'de açık olduğundan emin olun." };
  return { ok: true, factorId: data.id, qrSvg: data.totp.qr_code, secret: data.totp.secret };
}

export async function adminSignOut(): Promise<void> {
  const supabase = await createServerDbClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
  (await cookies()).delete({ name: ADMIN_SEEN_COOKIE, path: ADMIN_SEEN_COOKIE_OPTIONS.path });
  redirect(ADMIN_SIGN_IN);
}
