/**
 * Single place where environment variables enter the application.
 * Nothing else in the codebase should touch `process.env` directly.
 *
 * NEXT_PUBLIC_* values are inlined into the client bundle at build time, so
 * they are read through literal property accesses. Everything else is
 * server-only and guarded by `assertServer()`.
 */

function required(name: string, value: string | undefined): string {
  if (value === undefined || value.trim() === "") {
    throw new Error(
      `Missing required environment variable: ${name}. See .env.example.`,
    );
  }
  return value;
}

function assertServer(name: string): void {
  if (typeof window !== "undefined") {
    throw new Error(
      `${name} is server-only and must never be read in the browser.`,
    );
  }
}

/**
 * Values that are safe to ship to the browser.
 *
 * Lazy getters: validation happens on first use rather than at import time, so
 * a page can catch a misconfiguration and render a setup notice instead of the
 * whole module graph failing to load.
 */
export const publicEnv = {
  get supabaseUrl(): string {
    return required(
      "NEXT_PUBLIC_SUPABASE_URL",
      process.env.NEXT_PUBLIC_SUPABASE_URL,
    );
  },
  get supabaseAnonKey(): string {
    return required(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    );
  },
  /** Public read base URL of the R2 bucket, no trailing slash. */
  get r2PublicBaseUrl(): string {
    return required(
      "NEXT_PUBLIC_R2_PUBLIC_BASE_URL",
      process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL,
    ).replace(/\/+$/, "");
  },
  /**
   * Origin to write into a versus invite in place of the page's own, no
   * trailing slash; null when unset, which is the normal case.
   *
   * Optional rather than `required()` because it exists only to make
   * two-device testing possible on a LAN — see `inviteOrigin()` in
   * `components/versus-lobby.tsx`, which is also where it is confined to
   * loopback hosts so a stale value cannot follow a build to a real domain.
   */
  get devInviteOrigin(): string | null {
    const value = process.env.NEXT_PUBLIC_DEV_INVITE_ORIGIN?.trim();
    return value ? value.replace(/\/+$/, "") : null;
  },
} as const;

/** True when the Supabase connection details are present. */
export function isSupabaseConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

/** Secrets. Resolved lazily so importing this module never leaks or throws early. */
export function serverEnv() {
  assertServer("serverEnv()");
  return {
    supabaseServiceRoleKey: required(
      "SUPABASE_SERVICE_ROLE_KEY",
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
    r2AccountId: required("CLOUDFLARE_ACCOUNT_ID", process.env.CLOUDFLARE_ACCOUNT_ID),
    r2AccessKeyId: required("R2_ACCESS_KEY_ID", process.env.R2_ACCESS_KEY_ID),
    r2SecretAccessKey: required(
      "R2_SECRET_ACCESS_KEY",
      process.env.R2_SECRET_ACCESS_KEY,
    ),
    r2Bucket: required("R2_BUCKET_NAME", process.env.R2_BUCKET_NAME),
  } as const;
}

/**
 * The site's own mail sender (lib/mail/send.ts), or null when it is not set
 * up.
 *
 * Optional rather than `required()`: without it sign-up falls back to
 * Supabase's built-in sender, which only delivers to the project's team, so a
 * missing key degrades sign-up instead of taking every page down with it.
 * `MAIL_FROM` must be an address on a domain verified in Resend.
 */
export function mailEnv(): { resendApiKey: string; from: string } | null {
  assertServer("mailEnv()");
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.MAIL_FROM?.trim();
  return resendApiKey && from ? { resendApiKey, from } : null;
}

/**
 * True under `next dev`. Server-only, like every unprefixed variable.
 *
 * Exists for exactly one switch: sign-up skips the confirmation email in
 * development when no mail sender is configured (`signUpWithEmail` in
 * app/actions/auth.ts), so the site can be tried with made-up addresses. A
 * production build is always `production`, so the switch cannot follow a
 * deploy.
 */
export function isDevelopment(): boolean {
  assertServer("isDevelopment()");
  return process.env.NODE_ENV === "development";
}

/**
 * True in a production build. Safe on both sides: NODE_ENV is inlined at
 * build time. Used for cookie flags (`secure`), never for access decisions.
 */
export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}
