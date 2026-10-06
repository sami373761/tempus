"use server";

import { cookies } from "next/headers";

import { isSupportedLocale } from "@/lib/db/types";
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE } from "@/lib/i18n/server";

/**
 * Persists the language choice. The caller refreshes the route afterwards so
 * Server Components re-query `event_localized` in the new locale.
 */
export async function setLocale(locale: string): Promise<void> {
  if (!isSupportedLocale(locale)) return;

  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: LOCALE_COOKIE_MAX_AGE,
    sameSite: "lax",
  });
}
