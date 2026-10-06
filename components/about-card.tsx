import Link from "next/link";

import type { Dict } from "@/lib/i18n/dictionary";
import { aboutArtSrcSet, aboutArtUrl } from "@/lib/storage/images";

/**
 * The home page's one wide card: what Tempus is, how a round is played, and the
 * way into the game that exists.
 *
 * It sits between the board and the bento, on the same column as both, and is
 * revealed on scroll like the bento is — the first screen is the board, and
 * this is the first thing the scroll pays out. A section of its own rather than
 * a seventh tile on the board: the board is a grid of names, and prose in a
 * cell that size would either be clipped or force every card taller.
 *
 * The name is written here rather than translated. It is the product's name,
 * the same word the masthead sets, and it is set in the same display face for
 * that reason.
 *
 * **The artwork is a textile repeat, not a photograph**, which is what lets it
 * be cropped hard by the column without a word about the crop: there is no
 * subject in it to clip, at any width. It is `aria-hidden` for the same reason.
 * Two stored widths, no more — the panel is at most half of `--board-w`, so
 * 1600 already covers it at 2x. See `aboutArtUrl` in lib/storage/images.ts.
 *
 * The order of the two halves changes under `md`: the picture goes above the
 * text rather than beside it, where it is a band rather than a column, because
 * a half-width column of prose on a phone is four words to a line.
 */
export function AboutCard({ t }: { t: Dict }) {
  return (
    <section className="overflow-hidden rounded-card border border-hairline bg-card">
      <div className="grid md:grid-cols-[1.15fr_0.85fr]">
        {/* `gap-6` and a `mt-auto` on the button rather than a gap that grows:
            the picture beside it sets the card's height, and the text should
            stay at the top of its half while the button stays at the foot. */}
        <div className="flex flex-col gap-6 p-8 sm:p-10">
          <h2 className="font-display text-3xl font-semibold tracking-[-0.02em] text-ink sm:text-4xl">
            Tempus
          </h2>

          <div className="flex flex-col gap-4 text-[15px] leading-relaxed text-ink-dim">
            <p>{t.aboutBlurb}</p>
            <p>{t.aboutHow}</p>
          </div>

          {/* `self-start` so the button is as wide as its label rather than as
              wide as the paragraph above it. */}
          <Link
            href="/guess"
            className="mt-auto self-start rounded-full border border-transparent bg-ink px-7 py-2.5 text-sm font-semibold text-page transition hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent"
          >
            {t.play}
          </Link>
        </div>

        {/* A band above the text on a phone, a full-height column beside it
            above `md`. `min-h` only matters in the first case: in the second the
            text column is the taller of the two and the picture stretches to
            it. */}
        <div className="relative order-first min-h-[140px] md:order-none md:min-h-0">
          <img
            src={aboutArtUrl()}
            srcSet={aboutArtSrcSet()}
            /* Under `md` the card is one column, so the picture is the whole
               of it; above, it is the 0.85 share of a board capped at
               `--board-w` — 472px once that cap engages, at a ~1157px
               viewport. */
            sizes="(min-width: 1160px) 472px, (min-width: 768px) 42vw, 100vw"
            alt=""
            aria-hidden="true"
            className="absolute inset-0 h-full w-full object-cover"
          />
          {/* The pattern is busy and reaches the text's edge; a wash from that
              edge keeps the join from reading as two pictures butted together. */}
          <div
            aria-hidden="true"
            /* `from` is the end the text is on: the bottom edge under `md`,
               where the picture is a band above the prose, and the left edge
               above it, where the picture is the right-hand column. */
            className="absolute inset-0 bg-gradient-to-t from-card/70 to-transparent md:bg-gradient-to-r"
          />
        </div>
      </div>
    </section>
  );
}
