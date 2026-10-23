import "server-only";

import { mailEnv } from "../env.ts";

/**
 * The site's one way to send an email: Resend's HTTP API, called with a plain
 * `fetch`.
 *
 * **Why not Supabase's mailer.** Its built-in sender delivers only to the
 * project's own team and a handful of messages an hour, so sign-up on the
 * live site reached nobody. Custom SMTP in the dashboard would lift the limit
 * but keeps one English template per message; sending from here lets every
 * mail be written in the player's language from the same dictionary as the
 * site. Supabase still owns the accounts and the one-time tokens —
 * `auth.admin.generateLink` mints them without sending anything, and this
 * module only delivers the link.
 *
 * No SDK: one POST is the whole integration, and a dependency for it would be
 * one more thing for `npm ci` on a 1 GB box.
 */

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export function isMailConfigured(): boolean {
  return mailEnv() !== null;
}

/** True when the provider accepted the message. Never throws: a caller turns
 *  false into a form error, which is all a failed send can become. */
export async function sendMail(mail: Mail): Promise<boolean> {
  const env = mailEnv();
  if (!env) return false;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: env.from,
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      // The body names the cause (unverified domain, bad key); the player only
      // ever sees "try again", so the server log is the one place it can go.
      console.error("[mail] send refused", response.status, await response.text());
      return false;
    }
    return true;
  } catch (error) {
    console.error("[mail] send failed", error);
    return false;
  }
}
