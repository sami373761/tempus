/**
 * The film & television game's own rules: the one fact this subject has that
 * no other pool does, and the type the game plays over.
 *
 * Everything else it needs is shared — `SCREEN_PANES` for the rail
 * (lib/game/timeline.ts), `SCREEN_BANDS` for the grading (lib/game/scoring.ts),
 * `SCREEN_TOPIC` for the pool (lib/game/topics.ts), `QUESTIONS_PER_SET` for the
 * set. What lives here is the format.
 *
 * **Why the format is part of the round and not decoration.** The stored year
 * is a release for a film and a *premiere* for a series, which are different
 * questions: *The Sopranos* is filed under 1999 and ran to 2007, so a player
 * shown its poster with no label could reasonably place it anywhere in that
 * span and be marked wrong for it. Printing which of the two is being asked is
 * the difference between a hard question and an unfair one.
 *
 * The format is a `kind = 'other'` category link in the database rather than a
 * column, and `kind = 'other'` is invisible to `poolRestriction()` — so it
 * cannot affect which game deals what. See
 * supabase/migrations/20261009120000_screen_topic_category.sql.
 */

import type { LocalizedEvent } from "../db/types.ts";

/**
 * The two formats, as their category slugs.
 *
 * `film` rather than `movie`: the source data says `movie` and the category is
 * called `film` in all five languages, and the slug is what the database
 * holds. `scripts/parse-screen.ts` is where the one is translated into the
 * other, once.
 */
export const SCREEN_FORMATS = ["film", "series"] as const;

export type ScreenFormat = (typeof SCREEN_FORMATS)[number];

export function isScreenFormat(value: string): value is ScreenFormat {
  return (SCREEN_FORMATS as readonly string[]).includes(value);
}

/**
 * One round of this game: an event plus its format.
 *
 * A separate type rather than a `format` field on `LocalizedEvent`, which is
 * the shape every other game deals and would then carry a field null for 597
 * of the 797 events in the library.
 *
 * `format` is nullable even here, because the database can always be in a
 * state the seed script did not put it in — a film inserted by hand with no
 * format link is still a playable round, and the poster simply wears no pill.
 * Refusing to deal it would hide an event over a label.
 */
export interface ScreenEvent extends LocalizedEvent {
  format: ScreenFormat | null;
}

/**
 * Picks the format out of whatever `kind = 'other'` categories an event
 * carries.
 *
 * Tolerant on purpose: it takes the first slug it recognises and ignores the
 * rest, so adding some other `kind = 'other'` category later (a genre, a
 * country) cannot break this game. `null` when there is nothing to recognise.
 */
export function screenFormatOf(
  slugs: readonly string[] | undefined,
): ScreenFormat | null {
  return slugs?.find(isScreenFormat) ?? null;
}
