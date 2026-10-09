/**
 * The contact page: its address, and the two doors into it.
 *
 * `/contact` holds **two** sections — reaching the author, and the tip jar —
 * because they are one errand said two ways and a page each would be two
 * pages of one paragraph. Which one you came for decides which one is on top,
 * and that is the whole of what `ContactView` is: the same document, dealt in
 * the order the visitor arrived in. It is a search parameter rather than a
 * second route so there is literally one page, one metadata block and one
 * canonical URL; the order is presentation, not identity.
 *
 * The value is **validated, never trusted** — the same discipline as
 * `safeNextPath` next door. An unknown or repeated parameter falls back to the
 * contact order rather than rendering an empty page, so nothing a visitor can
 * type into the query string can produce a view that was never designed.
 *
 * No `server-only` marker and no imports, deliberately: `SiteMenu` is a Client
 * Component and builds both hrefs from here, while the page and its metadata
 * read the parameter on the server. One list, three readers.
 */

/** The page both menu rows land on. */
export const CONTACT_PATH = "/contact";

/** The query parameter that decides which section leads. */
export const CONTACT_VIEW_PARAM = "view";

/**
 * The two orders, named after the section that goes first.
 *
 * These double as the sections' DOM ids, so the page's own jump links and the
 * order are spelled the same way in one place.
 */
export const CONTACT_VIEWS = ["contact", "support"] as const;

export type ContactView = (typeof CONTACT_VIEWS)[number];

/**
 * The order a bare `/contact` renders in.
 *
 * Contact rather than support: an unparameterised URL is the one someone
 * typed, bookmarked or was linked, and "how do I reach you" is what a page
 * called `/contact` is being asked at that point.
 */
export const DEFAULT_CONTACT_VIEW: ContactView = "contact";

/** Where a menu row pointing at one of the two sections should go. */
export function contactHref(view: ContactView = DEFAULT_CONTACT_VIEW): string {
  return view === DEFAULT_CONTACT_VIEW
    ? CONTACT_PATH
    : `${CONTACT_PATH}?${CONTACT_VIEW_PARAM}=${view}`;
}

/**
 * The order to render in, from whatever the query string actually held.
 *
 * Takes Next's own parameter shape — a string, a repeated parameter's array,
 * or nothing — so the page never has to narrow it itself.
 */
export function contactView(
  value: string | string[] | undefined,
): ContactView {
  const first = Array.isArray(value) ? value[0] : value;
  return CONTACT_VIEWS.includes(first as ContactView)
    ? (first as ContactView)
    : DEFAULT_CONTACT_VIEW;
}

/**
 * TEMPORARY. There is no domain yet (CLAUDE.md gap 1) and therefore no
 * mailbox; this is a stand-in so the two places that print it can be laid out
 * and read. Change it here — it lives beside the paths rather than in the
 * dictionary because an address is not a translation, and it is in this module
 * rather than in a component because two of them now show it: the home page's
 * contact block and the contact page itself.
 */
export const CONTACT_EMAIL = "hello@tempusgame.com";
