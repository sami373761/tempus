/**
 * The "Born When?" game's own rules: the one fact this subject has that no
 * other pool does, and the type the game plays over.
 *
 * Everything else it needs is shared — `WHEN_BORN_PANES` for the three rails
 * (lib/game/timeline.ts), `WHEN_BORN_BANDS` for the grading
 * (lib/game/scoring.ts), `WHEN_BORN_TOPIC` for the pool (lib/game/topics.ts),
 * `QUESTIONS_PER_SET` for the set. What lives here is the field.
 *
 * **Why the field is part of the round and not decoration.** The film game
 * prints "Film" or "Series" because the stored year means a release for one and
 * a premiere for the other, so a poster with no label is an unfair question
 * (lib/game/screen.ts). This game's label earns its place differently: the
 * stored year always means the same thing — the year the person was born — and
 * what the pill supplies is the *category of person*, which is most of what
 * narrows a photograph down to a century.
 *
 * A portrait bust tells you very little on its own. "Philosopher" over the same
 * bust says classical antiquity; "Scientist" over it says the Enlightenment at
 * the earliest, because the word did not describe a job before then. The photo
 * is the question and the field is the one clue that makes it answerable, which
 * is why it goes on the picture rather than into the result.
 *
 * The field is a `kind = 'other'` category link in the database rather than a
 * column, and `kind = 'other'` is invisible to `poolRestriction()` — so it
 * cannot affect which game deals what. See
 * supabase/migrations/20261010140000_when_born_topic_category.sql.
 */

import type { LocalizedEvent } from "../db/types.ts";
import type { Dict } from "../i18n/dictionary.ts";

/**
 * Every field a person in this pool can be filed under, as their category
 * slugs.
 *
 * Fourteen, which is the source data's own list rather than a taxonomy of our
 * own: adding a fifteenth means a category row, a slug here and five
 * dictionary entries, and nothing else. Ordered roughly as the pool's own
 * history runs — rulers and religious figures first, the modern professions
 * last — so the list reads as a span rather than as an alphabetisation.
 *
 * Three of the slugs are not the source's word for them, and
 * `scripts/parse-when-born.ts` is where the one is translated into the other,
 * once: the file says `religious`, `business` and `leader`, which are an
 * adjective, a noun for a thing rather than a person, and a word that is fine.
 * `religious-figure` and `entrepreneur` are what the category is called in all
 * five languages, and the slug is what the database holds.
 */
export const PERSON_FIELDS = [
  "leader",
  "religious-figure",
  "philosopher",
  "explorer",
  "scientist",
  "inventor",
  "writer",
  "artist",
  "musician",
  "actor",
  "director",
  "athlete",
  "entrepreneur",
  "activist",
] as const;

export type PersonField = (typeof PERSON_FIELDS)[number];

export function isPersonField(value: string): value is PersonField {
  return (PERSON_FIELDS as readonly string[]).includes(value);
}

/**
 * Which dictionary entry each field prints, in the pattern
 * `VERDICT_LABEL_KEYS` set (lib/game/verdict-style.ts): the slug is what the
 * database holds and this is the map onto the five languages. A field with no
 * entry here would not compile, which is the point — `keyof Dict` is what
 * stops a new slug shipping as a raw `religious-figure` on the picture.
 */
export const PERSON_FIELD_LABEL_KEYS: Record<PersonField, keyof Dict> = {
  leader: "fieldLeader",
  "religious-figure": "fieldReligiousFigure",
  philosopher: "fieldPhilosopher",
  explorer: "fieldExplorer",
  scientist: "fieldScientist",
  inventor: "fieldInventor",
  writer: "fieldWriter",
  artist: "fieldArtist",
  musician: "fieldMusician",
  actor: "fieldActor",
  director: "fieldDirector",
  athlete: "fieldAthlete",
  entrepreneur: "fieldEntrepreneur",
  activist: "fieldActivist",
};

/**
 * One round of this game: an event plus the field of the person in it.
 *
 * A separate type rather than a `field` on `LocalizedEvent`, which is the shape
 * every other game deals and would then carry a field null for the 797 events
 * that are not people.
 *
 * `field` is nullable even here, because the database can always be in a state
 * the seed script did not put it in — a person inserted by hand with no field
 * link is still a playable round, and the photograph simply wears no pill.
 * Refusing to deal them would hide an event over a label.
 */
export interface WhenBornEvent extends LocalizedEvent {
  field: PersonField | null;
}

/**
 * Picks the field out of whatever `kind = 'other'` categories an event carries.
 *
 * Tolerant on purpose, like `screenFormatOf`: it takes the first slug it
 * recognises and ignores the rest, so adding some other `kind = 'other'`
 * category later (a country, a century) cannot break this game. `null` when
 * there is nothing to recognise — which is also what a film's `film` / `series`
 * link comes back as here, and a person's field comes back as over there.
 */
export function personFieldOf(
  slugs: readonly string[] | undefined,
): PersonField | null {
  return slugs?.find(isPersonField) ?? null;
}
