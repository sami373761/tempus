import type { Metadata } from "next";

import { BadgeFrame } from "@/components/badge-frame";
import { BADGE_BY_SLUG, type BadgeSlug } from "@/lib/badges";
import { readLocaleContext } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await readLocaleContext();
  return {
    title: `${t.leaderboardTitle} · Tempus`,
    description: t.leaderboardBlurb,
  };
}

/**
 * Where the menu's Leaderboard row lands.
 *
 * **The ten players are made up, and the page says so.** There are no saved
 * scores on this site — a set of ten lives in the tab it is played in and dies
 * with it (CLAUDE.md, gap 5) — so there is nothing to rank. What this is for is
 * the shape: the column, the badge beside a name, and the two numbers, settled
 * now so that wiring a real query to it later is a query rather than a design.
 *
 * It is **public**, unlike the badges and the account. A leaderboard is
 * something you read before you decide to join, so gating it would be the one
 * place on the site where signing in is the price of looking.
 *
 * The standings are written out rather than generated. A `Math.random()` here
 * would be a different board on the server and the client — which React reports
 * as a hydration error — and a different board on every reload, which reads as
 * a bug rather than as sample data. These were drawn once, at the time this was
 * written, and are now just a table.
 *
 * Plain rows on a hairline, like the FAQ, rather than ten cards: this is a list
 * of text and a list of text is what it should look like.
 */

type Standing = {
  name: string;
  badge: BadgeSlug;
  /** Hits in their best set of ten. */
  best: number;
  /** Sets finished. */
  sets: number;
};

const STANDINGS: readonly Standing[] = [
  { name: "atlasmarin", badge: "amethyst", best: 10, sets: 184 },
  { name: "nil_okyanus", badge: "diamond", best: 10, sets: 151 },
  { name: "chrono_fox", badge: "ruby", best: 10, sets: 143 },
  { name: "mara_velasco", badge: "diamond", best: 9, sets: 128 },
  { name: "deniz_kaya", badge: "gold", best: 9, sets: 97 },
  { name: "hugo_lefevre", badge: "gold", best: 8, sets: 88 },
  { name: "sable_orr", badge: "ruby", best: 8, sets: 74 },
  { name: "jonas_reuter", badge: "silver", best: 7, sets: 61 },
  { name: "elif_ustun", badge: "silver", best: 6, sets: 45 },
  { name: "pablo_quiroga", badge: "bronze", best: 5, sets: 22 },
];

/** The ring diameter in a row. Small enough that a row is one line of text
 *  tall, large enough that the four tiers are still tellable apart. */
const ROW_RING = 26;

export default async function LeaderboardPage() {
  const { t } = await readLocaleContext();

  return (
    <div className="mx-auto max-w-[calc(var(--board-w)+3rem)] px-6 pb-32 pt-12 sm:pt-16">
      <header>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.03em] sm:text-5xl">
          {t.leaderboardTitle}
        </h1>
        <p className="mt-3 max-w-[52ch] text-[17px] leading-relaxed text-ink-dim">
          {t.leaderboardBlurb}
        </p>

        {/* Said at the top, before the first row raises the question. A dashed
            edge is the site's mark for a thing that is named but not built. */}
        <p className="mt-7 max-w-[70ch] rounded-2xl border border-dashed border-hairline px-5 py-3 text-[13px] leading-relaxed text-ink-dim">
          {t.leaderboardPlaceholder}
        </p>
      </header>

      {/* One grid for the head and every row, so the columns cannot drift: the
          template is written once here and inherited by both. `Sets` is the
          column that goes under `sm` — it is the least of the three numbers and
          a phone has room for rank, name and best.

          `pr-12` under `sm` is clearance, not decoration. The menu button is
          `fixed` on every route but home and the bar under it hides on a
          downward scroll, so on a phone — where the button's track and this
          column are both `100vw - 3rem` and therefore end at the same pixel —
          the button scrolls over whichever row's score is 28px down the
          viewport. 48px is the button's 42 plus a margin; above `sm` the column
          is narrower than the track and there is nothing to clear. */}
      <div className="mt-10 pr-12 sm:pr-0">
        <div
          aria-hidden="true"
          className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-4 border-b border-hairline pb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-dim sm:grid-cols-[2.5rem_1fr_5rem_5rem]"
        >
          <span>{t.leaderboardRank}</span>
          <span>{t.leaderboardPlayer}</span>
          <span className="text-right">{t.leaderboardBest}</span>
          <span className="hidden text-right sm:block">
            {t.leaderboardSets}
          </span>
        </div>

        <ol>
          {STANDINGS.map((standing, index) => {
            const badge = BADGE_BY_SLUG[standing.badge];
            return (
              <li
                key={standing.name}
                className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-4 border-b border-hairline py-3 sm:grid-cols-[2.5rem_1fr_5rem_5rem]"
              >
                <span className="text-[15px] font-semibold tabular-nums text-ink-dim">
                  {index + 1}
                </span>

                <span className="flex min-w-0 items-center gap-3">
                  {/* The badge is decoration beside the name rather than a
                      column of its own: it is the name's own, and a column
                      would imply it can be sorted on. Its name is on the
                      element so the picture is not a silent cell. */}
                  {/* `align="ring"` is what makes a column of ten of these
                      look aligned. Each file has its ring in a different place
                      — the ornaments hang off one side — so laid out on their
                      own boxes the circles wandered 6px across the column and
                      the rows came out three different heights, bronze against
                      ruby. Centred on the ring instead, every badge occupies
                      the same box, so the circles share one vertical axis, the
                      names all start at the same x and every row is the same
                      height. */}
                  <span title={t[badge.nameKey]} className="shrink-0">
                    <BadgeFrame badge={badge} avatar={ROW_RING} align="ring" />
                  </span>
                  <span className="truncate text-[15px] font-semibold text-ink">
                    {standing.name}
                  </span>
                </span>

                <span className="text-right text-[15px] tabular-nums text-ink">
                  {standing.best}
                  <span className="text-ink-dim">/10</span>
                </span>

                <span className="hidden text-right text-[15px] tabular-nums text-ink-dim sm:block">
                  {standing.sets}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </div>
  );
}
