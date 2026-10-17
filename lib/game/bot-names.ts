/**
 * Who the online head-to-head's stand-in opponent says it is.
 *
 * A seat filled by `versus_seat_bot()` shows a name and a Chrono Rating like
 * any other, and both have to survive a second look: the opponent's name is on
 * screen for ten rounds, and a player who has met "Player 4821" twice knows
 * what they are playing. So the names are the kind people actually pick — a
 * first name and an initial, a birth year, a city, a hobby — across the five
 * languages the site speaks, and the rating sits beside the host's own the way
 * matchmaking would have paired two people.
 *
 * **Every name is a valid stored username** (`[a-z0-9_]`, 3–20, the shape
 * `normalizeUsername` in lib/db/accounts.ts produces), because a real
 * opponent's name could only ever be one. That is also why the Turkish ones
 * are spelt without ş, ğ, ı: a real account could not have them either.
 * The server skips any candidate a real account has since registered (one
 * `in` query over `pickBotNames`' candidates), so a bot never wears somebody's
 * name. None is a public figure, and none is a word anyone would mind seeing.
 *
 * Pure, like lib/game/versus-bot.ts: the randomness is passed in.
 */

import { CHRONO_RATING_RULES, CHRONO_TIER_FLOORS } from "./chrono-rating.ts";
import { NEAR_RATING_WINDOW } from "./versus.ts";
import type { BotLevel, Rng } from "./versus-bot.ts";

/**
 * The pool. Roughly even across Turkish, English, German, French and Spanish
 * flavours, plus a handle-style tail that belongs to no language — which is
 * what a real leaderboard looks like.
 */
export const BOT_NAMES: readonly string[] = Object.freeze([
  // Turkish
  "mehmetcan34",
  "ayse_nur",
  "zeynepk_",
  "elifsu07",
  "burak_tarih",
  "emre1903",
  "deniz_akdeniz",
  "selin_okur",
  "kaan_gezgin",
  "ozge92",
  "tarihsever",
  "kronos_avcisi",
  "efe_karadeniz",
  "irmak_su",
  "baris_ege",
  "cansu_t",
  "hakan06",
  "tugce_kitap",
  "ilayda_m",
  "berk35",
  "sude_ay",
  "yusufk61",
  "melis_derin",
  "omerfaruk42",
  "ecrin_s",
  "arda_tarihci",
  "ceren_ates",
  "dogukan01",
  "gizem_gece",
  "serkan_usta",
  "busra_k",
  "alper19",
  "nehir_akar",
  "kerem_yol",
  "damla_mavi",
  "eylul_son",
  "taylan_k",
  "hazal_yazar",
  "goktug_sen",
  "pinar_nehir",
  "umut_kara",
  "volkan_t",
  "ece_bahar",
  "batuhan99",
  "cagri_k",
  "derya_deniz",
  "nisa_yildiz",
  "furkan_34",
  "beyza_ay",
  "mert_kayra",
  "kumsal_k",
  "tolga_ist",
  "yagmur_06",
  "anil_pusula",
  "duru_su",
  "emir_kum",

  // English
  "quietfox",
  "maplewood_jo",
  "sam_reads",
  "oldmapguy",
  "lucy_h",
  "tomgrey88",
  "katie_b",
  "dustyarchive",
  "jbarlow",
  "ellie_writes",
  "nick_92",
  "owl_at_noon",
  "ben_t",
  "grace_lane",
  "harbor_light",
  "rosie_m",
  "ironclad_ed",
  "pennyfarthing",
  "ash_and_oak",
  "tidewatcher",
  "chloe_r",
  "dannyk7",
  "sundial_sue",
  "will_o",
  "hannah_j",
  "lantern_jack",
  "museumkid",
  "jamie_l",
  "rubyfinch",
  "liam_west",
  "zoe_q",
  "midnight_scribe",
  "olly99",
  "fernhill",
  "cobblestone",
  "georgie_p",
  "red_kite",
  "abby_n",
  "carl_v",
  "tess_reads",
  "mapsandtea",
  "rainy_tuesday",
  "kestrel_k",
  "nora_v",
  "eddie_c",

  // German
  "lukas_m",
  "jana_k",
  "fuchsbau",
  "felix92",
  "lena_sommer",
  "tim_berlin",
  "zeitreisende",
  "sophie_h",
  "jonas_w",
  "hanna_lo",
  "kaffeeklatsch",
  "paul_aus_koeln",
  "mia_s",
  "leon_k",
  "anna_lena",
  "sternwarte",
  "nordlicht_k",
  "bergfex",
  "uhrwerk",
  "moritz_b",
  "clara_f",
  "niklas88",
  "emma_aus_wien",
  "finn_h",
  "laura_z",
  "geschichtsfan",
  "eichhoernchen",
  "tobi_r",
  "greta_n",
  "julian_s",
  "marie_t",
  "wanderfalke",
  "pfeffernuss",
  "kai_hamburg",
  "ida_k",
  "brezelbaron",

  // French
  "lucie_m",
  "hugo_b",
  "camille_r",
  "theo92",
  "manon_l",
  "chouette_rousse",
  "louis_p",
  "chloe_d",
  "julien_t",
  "ines_v",
  "mathis_g",
  "clemence_a",
  "baptiste_r",
  "lea_lit",
  "noemie_c",
  "antoine_f",
  "elodie_s",
  "quentin_h",
  "margaux_b",
  "vieux_grimoire",
  "horloger",
  "pomme_de_pin",
  "renard_gris",
  "sacha_l",
  "alix_m",
  "gaspard_v",
  "oceane_k",
  "romain_d",
  "croissant_nomade",
  "jade_lyon",
  "lou_marseille",
  "maxime_r",
  "nina_bzh",
  "arthur_c",
  "capucine_f",
  "gabin_t",

  // Spanish
  "lucia_g",
  "pablo_r",
  "carmen_v",
  "diego_m",
  "sofia_l",
  "javi92",
  "marta_s",
  "alvaro_t",
  "paula_c",
  "sergio_h",
  "elena_p",
  "nacho_b",
  "irene_f",
  "raul_m",
  "andrea_q",
  "mateo_v",
  "candela_r",
  "hugo_mx",
  "valentina_o",
  "tortuga_sabia",
  "reloj_de_arena",
  "cronista",
  "lobo_gris",
  "mariposa_azul",
  "jorge13",
  "nerea_s",
  "gonzalo_p",
  "ines_madrid",
  "alba_n",
  "pepe_triana",
  "maite_bcn",
  "luna_llena",
  "dani_valencia",
  "rocio_c",
  "adrian_z",

  // No language in particular
  "eraquest",
  "datehunter",
  "ancientdust",
  "fossil_fan",
  "ink_and_quill",
  "paperplane",
  "starlit_road",
  "slowcoach",
  "nightowl_07",
  "kiwi_lemon",
  "mossy_stone",
  "pixel_pilgrim",
  "seventeen_seas",
  "yearling",
  "clockwise",
  "quill_and_scroll",
  "rustycompass",
  "bluepebble",
  "tumbleweed",
  "sandglass_9",
]);

/**
 * `count` distinct names in random order — candidates, not a choice: the
 * caller takes the first one no real account holds. A partial Fisher–Yates
 * over a copy, so the pool itself is never reordered.
 */
export function pickBotNames(rng: Rng, count: number): string[] {
  const pool = [...BOT_NAMES];
  const take = Math.max(0, Math.min(Math.floor(count), pool.length));
  for (let i = 0; i < take; i += 1) {
    const left = pool.length - i;
    const j = i + Math.min(left - 1, Math.floor(rng() * left));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, take);
}

/**
 * Chance a bot of this level appears as a guest (null name, null rating).
 *
 * Only the bottom league has any. Guests play there and nowhere else —
 * `versus_matchmake` gives a guest bottom-league lobbies only, so a middle- or
 * upper-league account never meets one — and a nameless opponent above the
 * bottom league would be a bot by elimination. The 10% first planned for the
 * middle league is therefore 0: `botDisguise` in lib/db/matches.ts already
 * refuses the disguise outside the bottom league, and the table says the same
 * thing rather than carry a number nothing could act on.
 */
export const BOT_GUEST_CHANCE: Readonly<Record<BotLevel, number>> = Object.freeze({
  1: 0.3,
  2: 0,
  3: 0,
});

/** Each league's span in KP; the upper league has no ceiling. */
const LEAGUE_SPAN: Readonly<Record<BotLevel, { min: number; max: number }>> = {
  1: { min: 0, max: CHRONO_TIER_FLOORS.middle - 1 },
  2: { min: CHRONO_TIER_FLOORS.middle, max: CHRONO_TIER_FLOORS.upper - 1 },
  3: { min: CHRONO_TIER_FLOORS.upper, max: Number.POSITIVE_INFINITY },
};

/**
 * How far a shown rating strays from the host's: a triangular spread of ±90,
 * well inside `NEAR_RATING_WINDOW`, so the pairing on screen is one
 * matchmaking itself could have made between two people.
 */
const SHOWN_RATING_SPREAD = Math.round(NEAR_RATING_WINDOW * 0.6);

/** A guest host has no rating to sit beside: the bot reads as fairly new instead. */
const GUEST_HOST_RANGE = 200;

/**
 * The step every bottom-league rating moves in: the greatest common divisor
 * of that league's +30 / −10 / +5 (`CHRONO_RATING_RULES[1]`), read off the
 * rules so it follows them. Accounts start at 0 and the floor is 0, so a
 * bottom-league player who has never left it always shows a multiple of 5 —
 * and a bot showing 137 KP would be a rating nobody there can hold, which any
 * player who has watched their own number move could notice.
 */
const BOTTOM_RATING_STEP = Object.values(CHRONO_RATING_RULES[1]).reduce(
  (step, delta) => gcd(step, Math.abs(delta)),
  0,
);

/**
 * The one way off that grid: relegation. The middle league's −18 drops a
 * 300–317 player onto 282–299, off the grid, and the bottom league's own
 * steps keep them off it as they walk down from there. So an off-grid shown
 * rating is a relegated player, plausible only near the top of the league:
 * never below `RELEGATED_FROM` (eight to ten net losses under where relegation
 * lands), then likelier linearly up to `RELEGATED_TOP_CHANCE` at 299, where
 * relegated players gather. The guest-host draw tops out at 200, so it never
 * leaves the grid at all — a fairly new player has not been relegated yet.
 */
const RELEGATED_FROM = 200;
const RELEGATED_TOP_CHANCE = 0.4;

/**
 * A plausible Chrono Rating for a bot seated against a host of `hostRating`
 * (null = a guest host) at `level`, inside that level's league.
 *
 * Reflected off the league's edges rather than clamped to them: clamping would
 * stack every overshoot on exactly 0 or 299, and a bottom league where a third
 * of the opponents show 0 KP is a pattern somebody would notice. In the bottom
 * league the reflection runs on the `BOTTOM_RATING_STEP` grid, edges included
 * (0 and 295, not 299), and only then may a relegated player's offset be
 * added. The middle and upper leagues need no grid: their −18 and −22 put
 * every whole number within a player's reach after one loss.
 */
export function botShownRating(
  rng: Rng,
  level: BotLevel,
  hostRating: number | null,
): number {
  const span = LEAGUE_SPAN[level];
  const step = level === 1 ? BOTTOM_RATING_STEP : 1;

  const raw =
    hostRating === null
      ? span.min + (Math.min(span.max, span.min + GUEST_HOST_RANGE) - span.min) * rng() ** 1.5
      : hostRating + (rng() + rng() - 1) * SHOWN_RATING_SPREAD;

  const low = Math.ceil(span.min / step);
  const high = Math.floor(span.max / step);
  let units = Math.round(raw / step);
  if (units < low) units = 2 * low - units;
  if (units > high) units = 2 * high - units;
  let rating = Math.min(high, Math.max(low, units)) * step;

  if (level === 1 && step > 1 && rating >= RELEGATED_FROM) {
    const chance =
      RELEGATED_TOP_CHANCE * ((rating - RELEGATED_FROM) / (span.max - RELEGATED_FROM));
    if (rng() < chance) rating += 1 + Math.min(step - 2, Math.floor(rng() * (step - 1)));
  }
  return Math.min(span.max, Math.max(span.min, rating));
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
