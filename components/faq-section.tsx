import type { Dict } from "@/lib/i18n/dictionary";

/**
 * The FAQ at the foot of the home page: a numbered list of questions, each of
 * which opens onto its answer.
 *
 * It is the destination of the menu's FAQ row, which links to `/#faq` — a
 * section rather than a route because there is one page's worth of answers and
 * a route of its own would be a page with a header, a back link and six
 * paragraphs on it. `scroll-mt` is what keeps the heading clear of the top of
 * the window when the browser jumps to the anchor; off home the link navigates
 * here first and the jump happens on arrival.
 *
 * **It is `details`/`summary`, which is why it can collapse and still need no
 * JavaScript.** It was a two-column grid of six cards until 2026-10-06, on the
 * grounds that an accordion would make this the one block on the page that
 * could not be read without script. That is only true of an accordion built
 * out of state and a click handler: the native element ships the open/close
 * behaviour, every answer is in the document whether or not it is showing, and
 * the whole section is one server component with no `"use client"` anywhere
 * near it.
 *
 * **Plain text on the page, not cards.** The only structure is a hairline
 * between items, so the block reads as the page's prose rather than as a third
 * grid under two grids of cards — which is also what lets it sit directly on
 * the background with the bento's tiles above it. The rules run the full width
 * of the column (the same column the board and the bento use, so the whole
 * page has one left edge), but an *answer* is capped at `70ch`: a paragraph
 * measured across 1100px is a paragraph nobody finishes.
 *
 * The number is the one piece of decoration, and it earns its place by giving
 * the question something to hang off at the left edge — the answer is indented
 * to clear it, so an open row is visibly one block rather than two lines that
 * happen to be adjacent.
 *
 * The questions are numbered keys (`faqQ1`…`faqA8`) rather than an array in the
 * dictionary, because `Dict` is derived from the English dictionary and that is
 * what makes a missing translation a type error. A ninth question is two keys
 * in five dictionaries and one line here.
 */
export function FaqSection({ t }: { t: Dict }) {
  const items = [
    [t.faqQ1, t.faqA1],
    [t.faqQ2, t.faqA2],
    [t.faqQ3, t.faqA3],
    [t.faqQ4, t.faqA4],
    [t.faqQ5, t.faqA5],
    [t.faqQ6, t.faqA6],
    [t.faqQ7, t.faqA7],
    [t.faqQ8, t.faqA8],
  ] as const;

  return (
    <section id="faq" className="scroll-mt-24">
      {/* Left-aligned like the two blocks above it: the rules below run the
          full width of the column, so a centred heading sat off the left edge
          its own list starts on. */}
      <div className="mb-10">
        <h2 className="font-display text-3xl font-semibold tracking-[-0.02em]">
          {t.faqTitle}
        </h2>
        <p className="mt-2 text-ink-dim">{t.faqBlurb}</p>
      </div>

      {/* A rule above the first row and below the last, so the list reads as a
          bounded run of text rather than as seven separators floating in the
          page. */}
      <div className="border-t border-hairline">
        {items.map(([question, answer], i) => (
          <details
            key={question}
            className="faq-row group border-b border-hairline"
          >
            {/* `list-none` plus the WebKit pseudo-element: Safari draws the
                disclosure triangle through its own marker, which the standard
                property does not reach. The mark on the right is the only
                affordance, and it has to be the same one in every browser. */}
            <summary className="grid cursor-pointer list-none grid-cols-[2.25rem_1fr_auto] items-start gap-3 py-5 [&::-webkit-details-marker]:hidden">
              <span
                aria-hidden="true"
                className="pt-1 text-[11px] font-semibold uppercase tabular-nums tracking-[0.1em] text-ink-dim"
              >
                {String(i + 1).padStart(2, "0")}
              </span>

              <span className="font-display text-lg font-semibold leading-snug text-ink-dim transition-colors group-hover:text-ink group-open:text-ink">
                {question}
              </span>

              {/* A plus that becomes a minus: the horizontal bar stays put and
                  the vertical one turns onto it. Both bars rather than a
                  chevron, because a chevron at this weight reads as "there is
                  more below" — a scroll hint — where a plus reads as "this
                  opens". */}
              <span
                aria-hidden="true"
                className="faq-mark relative mt-1.5 h-3 w-3 shrink-0 text-ink-dim transition-colors group-hover:text-ink group-open:text-ink"
              >
                <i />
                <i />
              </span>
            </summary>

            <p className="faq-answer max-w-[70ch] pb-6 pl-12 text-[15px] leading-relaxed text-ink-dim">
              {answer}
            </p>
          </details>
        ))}
      </div>
    </section>
  );
}
