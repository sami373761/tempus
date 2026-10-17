"use client";

import { useState } from "react";

import { BadgeFrame } from "@/components/badge-frame";
import { avatarSrc } from "@/lib/avatar";
import { BADGE_BY_SLUG, RING_BOX, type BadgeSlug } from "@/lib/badges";
import type { SupportedLocale } from "@/lib/db/types";
import type { Dict } from "@/lib/i18n/dictionary";

/**
 * The leaderboard's three boards and the pills that switch between them.
 *
 * **All three arrive with the page.** They were three links to the same route
 * under different query parameters until this component existed, which is the
 * right shape for a board that can be shared — and the wrong one for a board
 * that is read: every press was a server render against a database in
 * ap-southeast-2, so switching from all-time to this month was a second or two
 * of nothing happening. The page now reads all three in one parallel pass and
 * hands them here, so a press is a state change and the list is already in the
 * browser.
 *
 * **The URL still says which board is up.** `history.replaceState` rather than
 * the router: a `replace()` would be the navigation this component exists to
 * avoid, while the bare History API moves the address bar without asking
 * Next.js for anything. So `/leaderboard?board=rating` still opens on the
 * rating board, a reload keeps the board that was being read, and nothing is
 * fetched twice.
 *
 * Only the board on screen is mounted. The three are the same fifty-odd
 * players in a different order, so their pictures are in the browser's cache
 * by the second press and keeping two hidden lists in the DOM would buy
 * nothing a cached image does not.
 */

export type Board = "all" | "month" | "rating";

/** What a row shows, whichever board it is on: the main number and the lesser
 *  one that drops out under `sm`. */
export interface BoardRow {
  rank: number;
  username: string;
  badge: BadgeSlug | null;
  avatarKey: string | null;
  score: number;
  secondary: number;
}

/** One board as the page read it: its rows, this player's standing on it, and
 *  whether the read failed — per board, because one board failing must not
 *  take the other two down with it. */
export interface BoardData {
  rows: BoardRow[];
  /** The signed-in player's own line, already formatted; null when there is
   *  none to show (signed out, or not on this board). */
  mine: string | null;
  failed: boolean;
}

/** The picture's diameter in a row, which sizes the ring around it. Small
 *  enough that a row stays close to one line of text, large enough that the
 *  six rungs are tellable apart and the face in the middle is a face. */
const ROW_RING = 32;

export function LeaderboardBoards({
  boards,
  initial,
  locale,
  t,
}: {
  boards: Record<Board, BoardData>;
  /** The board the URL asked for, which is the one the server rendered. */
  initial: Board;
  locale: SupportedLocale;
  t: Dict;
}) {
  const [board, setBoard] = useState<Board>(initial);
  const rating = board === "rating";
  const { rows, mine, failed } = boards[board];

  const tabs: { board: Board; label: string; href: string }[] = [
    { board: "all", label: t.leaderboardAllTime, href: "/leaderboard" },
    { board: "month", label: t.leaderboardMonth, href: "/leaderboard?period=month" },
    { board: "rating", label: t.versusRatingName, href: "/leaderboard?board=rating" },
  ];

  function show(next: { board: Board; href: string }) {
    setBoard(next.board);
    // Shareable without being navigable: see the note above.
    window.history.replaceState(null, "", next.href);
  }

  return (
    <>
      {/* The rating board's line is the longest of the two in every language
          — 84 characters in Turkish, 86 in Spanish — and the 52ch measure
          that suits a paragraph broke it across two lines for the sake of a
          reading width it does not need: it is one sentence under a heading,
          not prose. Uncapped it takes the page's own column (1157px), which
          holds the longest of the five on one line from about a 770px
          window; below that it wraps, which is what a phone should do with
          it anyway. The TP board's line is half the length and keeps the
          measure. */}
      <p
        className={`mt-3 text-[17px] leading-relaxed text-ink-dim ${
          rating ? "" : "max-w-[52ch]"
        }`}
      >
        {rating ? t.leaderboardRatingBlurb : t.leaderboardBlurb}
      </p>

      {/* Links rather than buttons, still: each board has an address, so a
          middle-click or a copied link has to keep working. The press is
          intercepted because the board is already here — the href is what the
          row is, not how it is reached. A modified click (new tab, new window)
          is left to the browser. */}
      <nav aria-label={t.leaderboardTitle} className="mt-7 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <a
            key={tab.board}
            href={tab.href}
            aria-current={tab.board === board ? "page" : undefined}
            onClick={(event) => {
              if (
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey ||
                event.button !== 0
              ) {
                return;
              }
              event.preventDefault();
              show(tab);
            }}
            className={`rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              tab.board === board
                ? "border-ink bg-ink text-page"
                : "border-hairline text-ink hover:bg-card"
            }`}
          >
            {tab.label}
          </a>
        ))}
      </nav>

      {/* One grid for the head and every row, so the columns cannot drift: the
          template is written once here and inherited by both. The second number
          (perfects, or wins on the rating board) is the column that goes under
          `sm` — it is the lesser of the two and a phone has room for rank, name
          and score.

          `pr-12` is clearance, not decoration. The menu button is `fixed` on
          every route but home and the bar under it hides on a downward scroll,
          so wherever the button's track and this column end at the same pixel
          the button scrolls over whichever row's last number is 28px down the
          viewport. They do up to the column's own cap: both are the page width
          less a 24px gutter until the column stops at `--board-w` + 3rem
          (1157px), and the track (`max-w-7xl`) runs on to 1280px — so the
          column's edge only pulls the button's 42px plus a margin clear of it
          at about a 1250px window. 48px is that 42 plus the margin; from `xl`
          (1280px) there is nothing to clear. */}
      <div className="mt-10 pr-12 xl:pr-0">
        <div
          aria-hidden="true"
          className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 border-b border-hairline pb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-dim sm:grid-cols-[3.25rem_1fr_6rem_5rem] sm:gap-4 sm:tracking-[0.12em]"
        >
          <span>{t.leaderboardRank}</span>
          <span>{t.leaderboardPlayer}</span>
          <span className="text-right">
            {rating ? t.leaderboardRatingUnit : t.leaderboardTp}
          </span>
          <span className="hidden text-right sm:block">
            {rating ? t.leaderboardWins : t.leaderboardPerfects}
          </span>
        </div>

        {rows.length === 0 ? (
          <p className="border-b border-hairline py-6 text-[15px] text-ink-dim">
            {failed
              ? t.leaderboardFailed
              : rating
                ? t.leaderboardRatingEmpty
                : t.leaderboardEmpty}
          </p>
        ) : (
          <ol>
            {rows.map((row) => {
              const badge = row.badge ? BADGE_BY_SLUG[row.badge] : null;
              const picture = avatarSrc(row.avatarKey);
              return (
                <li
                  key={row.username}
                  className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 border-b border-hairline py-3 sm:grid-cols-[3.25rem_1fr_6rem_5rem] sm:gap-4"
                >
                  <span className="text-[15px] font-semibold tabular-nums text-ink-dim">
                    {row.rank}
                  </span>

                  <span className="flex min-w-0 items-center gap-2 sm:gap-3">
                    {/* The badge is decoration beside the name rather than a
                        column of its own: it is the name's own, and a column
                        would imply it can be sorted on. Its name is on the
                        element so the picture is not a silent cell.

                        `align="ring"` is what makes a column of these look
                        aligned: each file has its ring in a different place,
                        so centred on the ring every badge occupies the same
                        box and the names all start at the same x. A player
                        with no badge yet gets that same box with their
                        picture at its centre, for the same reason. */}
                    {badge ? (
                      <span title={t[badge.nameKey]} className="shrink-0">
                        <BadgeFrame
                          badge={badge}
                          avatar={ROW_RING}
                          align="ring"
                          avatarSrc={picture}
                        />
                      </span>
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex shrink-0 items-center justify-center"
                        style={{
                          width: Math.round(RING_BOX.w * ROW_RING),
                          height: Math.round(RING_BOX.h * ROW_RING),
                        }}
                      >
                        <img
                          src={picture}
                          alt=""
                          loading="lazy"
                          className="rounded-full border border-hairline object-cover"
                          style={{ width: ROW_RING, height: ROW_RING }}
                        />
                      </span>
                    )}
                    {/* Two lines on a phone, broken anywhere: the cell is
                        36-91px there and one truncated line left a name two or
                        three letters long. The row is already the badge's
                        height, so a second line costs it nothing. */}
                    <span className="line-clamp-2 wrap-anywhere text-[15px] font-semibold text-ink sm:line-clamp-1">
                      {row.username}
                    </span>
                  </span>

                  <span className="text-right text-[15px] font-semibold tabular-nums text-ink">
                    {row.score.toLocaleString(locale)}
                  </span>

                  <span className="hidden text-right text-[15px] tabular-nums text-ink-dim sm:block">
                    {row.secondary}
                  </span>
                </li>
              );
            })}
          </ol>
        )}

        {mine && (
          <p className="mt-6 text-[13px] font-semibold tabular-nums text-ink-dim">
            {mine}
          </p>
        )}
      </div>
    </>
  );
}
