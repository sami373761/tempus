/**
 * The admin panel's address.
 *
 * Not `/admin`: a random 40-character segment, so the panel is not where a
 * scanner looks (the owner's decision — it is defence in depth, never the
 * boundary; requireAdmin() is). The segment is the folder name under app/,
 * which is why it also appears in file paths; that is accepted.
 *
 * Nothing on the public site links here.
 */
export const ADMIN_SEGMENT = "a8t2bjytk2dcv4n3jcarvdtbh10cmtenmofuncpi";

export const ADMIN_BASE = `/${ADMIN_SEGMENT}`;
export const ADMIN_SIGN_IN = `${ADMIN_BASE}/giris`;
export const ADMIN_MFA = `${ADMIN_BASE}/mfa`;
export const ADMIN_MFA_SETUP = `${ADMIN_BASE}/mfa/kurulum`;

export function adminPath(sub = ""): string {
  return sub ? `${ADMIN_BASE}/${sub.replace(/^\/+/, "")}` : ADMIN_BASE;
}

export function isAdminPath(pathname: string): boolean {
  return pathname === ADMIN_BASE || pathname.startsWith(`${ADMIN_BASE}/`);
}

/**
 * The admin account's sign-in identity. Supabase Auth signs in by email, the
 * panel by username: the username is turned into an address on `.invalid`,
 * a TLD reserved never to resolve (RFC 2606), so no mail can ever be sent to
 * it and nobody can register it elsewhere.
 */
export const ADMIN_EMAIL_DOMAIN = "admin.tempus.invalid";

export function adminEmailFor(username: string): string {
  return `${username.trim().toLowerCase()}@${ADMIN_EMAIL_DOMAIN}`;
}

export function usernameFromAdminEmail(email: string | undefined | null): string | null {
  if (!email || !email.endsWith(`@${ADMIN_EMAIL_DOMAIN}`)) return null;
  return email.slice(0, -(ADMIN_EMAIL_DOMAIN.length + 1));
}
