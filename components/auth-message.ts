import type { AuthErrorCode } from "@/app/actions/auth";
import { validateUsername, type UsernameProblem } from "@/lib/db/accounts";
import { format, type Dict } from "@/lib/i18n/dictionary";

/**
 * Codes on the wire, sentences in the dictionary — in one place.
 *
 * The sign-in form and the account panel both have to turn an `AuthErrorCode`
 * into something a player can read, and they used to carry a copy of the table
 * each: a new code was a compile error in two files and a new *sentence* was a
 * silent divergence between them.
 *
 * `detail` is the only part of a failure that is not a code. A username is
 * refused for characters the player typed, and those characters are the whole
 * point of the sentence, so they travel beside the code and are filled in
 * here. Without them there is still an answer — `authErrUsernameCharsAny`
 * recites the rule instead of naming the offenders — which is what a refusal
 * raised with no detail falls back to.
 */
export function authErrorText(
  t: Dict,
  code: AuthErrorCode,
  detail?: string,
): string {
  const MESSAGES: Record<AuthErrorCode, string> = {
    "invalid-credentials": t.authErrInvalidCredentials,
    "email-invalid": t.authErrEmailInvalid,
    "email-taken": t.authErrEmailTaken,
    "password-weak": t.authErrPasswordWeak,
    "password-mismatch": t.authErrPasswordMismatch,
    "username-short": t.authErrUsernameShort,
    "username-long": t.authErrUsernameLong,
    "username-spaces": t.authErrUsernameSpaces,
    "username-chars": detail
      ? format(t.authErrUsernameChars, { chars: detail })
      : t.authErrUsernameCharsAny,
    "username-taken": t.authErrUsernameTaken,
    "rate-limited": t.authErrRateLimited,
    "provider-failed": t.authErrProviderFailed,
    /* Only the account page can raise this one — the sign-in form never asks
       for a *current* password — but the table is exhaustive over the code
       union, which is what makes a new failure a compile error here. */
    "current-password-wrong": t.authErrCurrentPassword,
    "photo-too-large": t.authErrPhotoTooLarge,
    "photo-type": t.authErrPhotoType,
    "photo-unreadable": t.authErrPhotoUnreadable,
    "link-expired": t.authErrLinkExpired,
    generic: t.authErrGeneric,
  };

  return MESSAGES[code];
}

/**
 * The same refusal, decided in the browser while the name is still being
 * typed.
 *
 * **It is the server's own rule, not a second one.** `validateUsername` is
 * pure and imports nothing but types, so the form can run the exact function
 * the Server Action runs rather than a regex that agrees with it today. A
 * check that drifted from the one that decides would be worse than no check at
 * all: the field would accept a name the round trip then refuses.
 *
 * Null means "say nothing", which covers two cases that are not mistakes — an
 * empty field, which `required` is already about, and a name that is fine.
 *
 * **`"too-short"` is withheld until the field is left.** Every other refusal is
 * about something that is already wrong and cannot become right by typing
 * more; "too short" is a complaint about an unfinished name, and on the second
 * keystroke it is simply premature.
 */
export function usernameRefusal(
  t: Dict,
  typed: string,
  { settled }: { settled: boolean },
): string | null {
  if (!typed.trim()) return null;

  const checked = validateUsername(typed);
  if (checked.ok) return null;
  if (checked.problem === "too-short" && !settled) return null;

  const CODES: Record<UsernameProblem, AuthErrorCode> = {
    "too-short": "username-short",
    "too-long": "username-long",
    "has-space": "username-spaces",
    "bad-characters": "username-chars",
  };

  return authErrorText(t, CODES[checked.problem], checked.rejected || undefined);
}
