/**
 * Where the active locale comes from on the server.
 *
 * A plain cookie, read by every Server Component that renders localized text.
 * Not httpOnly — the choice is not a secret and the selector sets it through a
 * Server Action anyway; keeping it readable lets the browser restore the
 * selection without a round trip.
 */

import { cookies } from "next/headers";

import { DEFAULT_LOCALE, isSupportedLocale, type SupportedLocale } from "../db/types.ts";
import { dictionary, type Dict } from "./dictionary.ts";

export const LOCALE_COOKIE = "tempus_locale";
/** A year — long enough that a returning player keeps their language. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export async function readLocale(): Promise<SupportedLocale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return value && isSupportedLocale(value) ? value : DEFAULT_LOCALE;
}

/** Locale plus its dictionary — what a page needs to render anything. */
export async function readLocaleContext(): Promise<{
  locale: SupportedLocale;
  t: Dict;
}> {
  const locale = await readLocale();
  return { locale, t: dictionary(locale) };
}
