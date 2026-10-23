import type { Dict } from "../i18n/dictionary.ts";
import type { Mail } from "./send.ts";

/**
 * The two account emails: confirm a new address, and reset a password.
 *
 * Words from the dictionary, so the mail arrives in the language the player
 * was using when they asked for it. The layout is a single table with inline
 * styles because that is what mail clients render reliably — no stylesheet,
 * no web font, no remote image (a picture that has to be fetched is one more
 * reason for a spam filter and is blocked by default in most clients anyway).
 *
 * The link is printed under the button as well: some clients strip buttons,
 * and a player copying it into another browser needs the text.
 */

export type AuthMailKind = "confirm" | "recovery";

export function authMail(
  kind: AuthMailKind,
  t: Dict,
  to: string,
  link: string,
): Mail {
  const copy =
    kind === "confirm"
      ? { subject: t.mailConfirmSubject, intro: t.mailConfirmIntro, button: t.mailConfirmButton }
      : { subject: t.mailRecoverySubject, intro: t.mailRecoveryIntro, button: t.mailRecoveryButton };

  const text = [
    copy.intro,
    "",
    `${copy.button}: ${link}`,
    "",
    t.mailExpires,
    t.mailIgnore,
    "",
    "Tempus",
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#0b0b0c;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b0b0c;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#161618;border:1px solid #2a2a2e;border-radius:20px;padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Arial,sans-serif;color:#f4f4f5;">
<tr><td style="font-size:22px;font-weight:700;letter-spacing:-0.02em;padding-bottom:16px;">Tempus</td></tr>
<tr><td style="font-size:15px;line-height:1.6;color:#c9c9cf;padding-bottom:24px;">${escapeHtml(copy.intro)}</td></tr>
<tr><td style="padding-bottom:24px;">
<a href="${escapeHtml(link)}" style="display:inline-block;background:#f4f4f5;color:#0b0b0c;text-decoration:none;font-weight:600;font-size:15px;padding:12px 24px;border-radius:999px;">${escapeHtml(copy.button)}</a>
</td></tr>
<tr><td style="font-size:12px;line-height:1.6;color:#8c8c94;padding-bottom:8px;">${escapeHtml(t.mailLinkFallback)}</td></tr>
<tr><td style="font-size:12px;line-height:1.5;word-break:break-all;padding-bottom:24px;"><a href="${escapeHtml(link)}" style="color:#8c8c94;">${escapeHtml(link)}</a></td></tr>
<tr><td style="font-size:12px;line-height:1.6;color:#8c8c94;border-top:1px solid #2a2a2e;padding-top:16px;">${escapeHtml(t.mailExpires)} ${escapeHtml(t.mailIgnore)}</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

  return { to, subject: copy.subject, html, text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
