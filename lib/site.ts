/**
 * The live site's origin, no trailing slash.
 *
 * Links meant for *someone else* — a versus invite, a shared result — are
 * written against this rather than `window.location`, because the page they
 * are made on is not always a page the recipient can reach: on the dev server
 * it was `localhost` or a LAN address, which no friend in another city can
 * open. The rooms live in the one Supabase database the live site also uses,
 * so a code minted anywhere is joinable here.
 */
export const SITE_ORIGIN = "https://tempusplay.com";
