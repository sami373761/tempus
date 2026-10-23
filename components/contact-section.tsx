import Link from "next/link";

import { ContactEmailText } from "@/components/contact-email";
import { SiteMark } from "@/components/site-header";
import type { Dict } from "@/lib/i18n/dictionary";

/**
 * The last block on the home page: two columns under two rules, the product on
 * the left and the way to reach it on the right.
 *
 * The composition is transcribed from the supplied Apple reference — a hairline
 * across the top of each column, a long drop of empty space, then one large
 * line of tinted type with its explanation under it. What carries the design is
 * the **pair of rules**: two short bright-to-dark gradients side by side,
 * which is what tells the eye there are two columns before it has read a word.
 * They are the whole of the structure here; there is no card, no border and no
 * fill, which is also what lets this sit directly on the page under the FAQ's
 * plain text rather than reading as a third grid of tiles.
 *
 * **The colour is amber, not the reference's blue.** Asked for, and the value
 * is the one the site already has: `#f5a623`, the bento library card's sun, the
 * first deliberate chroma on an otherwise neutral page. The ramps below run the
 * reference's own luminance curve with that hue in place of its steel blue, so
 * the rules still read bright-to-dark across each column.
 *
 * Both gradient ramps live in `app/globals.css` as `.contact-rule` and
 * `.contact-sweep`, beside the bento's sweeps they are a sibling of.
 *
 * **There is exactly one heading per column, and the address is not one of
 * them.** It used to sit between "Contact Us" and the paragraph at `text-xl`,
 * which made it read as a second heading under the first; it is now a
 * `mailto:` inside the sentence that tells you what to write, which is where
 * the sense of it already was.
 *
 * **The menu's Contact row no longer lands here.** It points at `/contact`,
 * which is a page of its own holding this errand and the tip jar in whichever
 * order the visitor arrived in (see `lib/contact.ts`). This block stays as the
 * foot of the home page — it is the last thing a reader scrolls to and the
 * place the address is offered without being asked for — and keeps its `id`,
 * so `/#contact` still works for anything that links it.
 *
 * It is a Server Component with no state — the reveal on scroll belongs to the
 * `ScrollReveal` wrapper on the home page, like every other block below the
 * fold.
 */

/**
 * Both columns' headline, which is also the box the mark and the mail icon take
 * their size from.
 *
 * The size is on this row rather than on the text, so the two pieces of
 * artwork beside it can be sized in `em` and track the headline through the
 * whole of its `clamp()` range — the same arrangement as the home masthead,
 * where the mark is `1.1em` of a title that is clamped against the viewport.
 * It is ~30% down from the 32/4.6vw/52 it carried until 2026-10-07, which was
 * asked for: the headline was the largest type on the page and sat louder than
 * the FAQ above it.
 *
 * `min-h` is what keeps the two columns' headlines on exactly one baseline.
 * The row is as tall as its tallest item, and the two columns' items are not
 * the same height — a solid tile reads smaller than line art at one size, so
 * the mark is `1.1em` and the envelope `1.15em` — which centred each column's
 * text in a box half a pixel different from the other's. A floor taller than
 * both takes the icons out of that sum entirely.
 */
const HEADLINE_ROW =
  "flex min-h-[1.2em] items-center gap-3 text-[clamp(22px,3.2vw,36px)] sm:gap-4";
// Balanced because a headline that wraps left one word on its own line in
// German ("Spendier mir einen / Kaffee") at every width from a phone up.
const HEADLINE =
  "contact-sweep text-balance font-display font-semibold leading-[1.05] tracking-[-0.03em]";

export function ContactSection({ t }: { t: Dict }) {
  return (
    /* `scroll-mt` for the same reason the FAQ has it: `/#contact` is still a
       live anchor — the menu's row goes to `/contact` now, but anything that
       links the section still lands here, and the browser's jump would
       otherwise put the heading under the top of the window. */
    <section id="contact" className="scroll-mt-24">
      {/* One column on a phone with the rules stacked, which is what keeps the
          treatment intact at every width — a rule is per column, so a column
          that wraps takes its own rule with it. */}
      <div className="grid gap-12 md:grid-cols-2 md:gap-8">
        <div>
          <Rule />
          {/* The reference's long drop between the rule and the headline, to
              scale: it is what makes the rule read as the top edge of a column
              rather than as an underline above a paragraph. Shorter on a phone,
              where two columns of it would be most of a screen of nothing. */}
          <div className="pt-10 sm:pt-16">
            {/* The masthead's own mark, beside the masthead's own word — the
                same component the top-left corner of the site uses, so there
                is one piece of artwork and one mask rather than a second copy
                to keep in step.

                It is painted flat `text-ink` rather than swept, which is
                exactly what it wears up in the masthead: a gradient tile
                beside the word read as two different whites there, and the
                reason holds here even though the word beside it is amber. It
                has to be a *sibling* of the swept text for the same reason the
                mail icon opposite is — `background-clip: text` with a
                transparent colour applies to the whole element, and a mask
                inside one would be clipped to glyphs it does not have. */}
            <div className={HEADLINE_ROW}>
              <SiteMark className="h-[1.1em] w-[1.1em] text-ink" />
              {/* Written here rather than translated: it is the product's own
                  name. */}
              <p className={HEADLINE}>Tempus</p>
            </div>
            <p className="mt-4 max-w-[34ch] text-[15px] leading-relaxed text-ink-dim">
              {t.contactLead}
            </p>
            <PrivacyLink t={t} />
          </div>
        </div>

        <div>
          <Rule />
          <div className="pt-10 sm:pt-16">
            {/* The icon is *beside* the headline, not above it, and that is what
                keeps the two columns' headlines on one baseline: both are the
                first line under their rule, at the same offset. Above the line
                it pushed this one 44px lower than the word `Tempus` opposite,
                which made the pair of rules — the whole of the structure here —
                look like two unrelated blocks.

                `1.15em` rather than the mark's `1.1em`: this is line art and
                that is a solid tile, so at one size the stroked envelope reads
                the smaller of the two. Both are `em` of `HEADLINE_ROW`, so the
                pair stays in proportion with the type at every width. */}
            <div className={HEADLINE_ROW}>
              <MailIcon />
              <p className={HEADLINE}>{t.contactTitle}</p>
            </div>

            {/* The address lives in this sentence rather than above it — see
                `ContactEmailText`, which is shared with `/contact` so there is
                one implementation of dropping the `mailto:` into the slot.

                `max-w` is in `ch` of the paragraph's own size. */}
            <p className="mt-5 max-w-[46ch] text-[15px] leading-relaxed text-ink-dim">
              <ContactEmailText text={t.contactBlurb} />
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * The way to `/privacy`, under the product's own column: the policy is about
 * the product, and the foot of the home page is where a reader looks for one.
 *
 * A pill rather than a bare text link so it reads as a door with a label and
 * a one-line reason to open it, in the block's amber — but quiet: hairline
 * border and card fill at rest, the amber only in the icon until hover.
 */
function PrivacyLink({ t }: { t: Dict }) {
  return (
    <Link
      href="/privacy"
      className="group mt-6 inline-flex items-center gap-3 rounded-full border border-hairline bg-card/60 py-2 pl-2 pr-4 transition-colors hover:border-[#f5a623]/45 hover:bg-card focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#f5a623]/12">
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#f5a623"
          strokeWidth={1.6}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
        >
          <path d="M12 3 5 6v5.5c0 4.2 2.9 8 7 9.5 4.1-1.5 7-5.3 7-9.5V6l-7-3Z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-[13px] font-semibold text-ink">{t.footerPrivacy}</span>
        <span className="mt-0.5 text-[12px] text-ink-dim">{t.footerPrivacyHint}</span>
      </span>
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="ml-1 h-3.5 w-3.5 text-ink-dim transition-transform group-hover:translate-x-0.5 group-hover:text-ink motion-reduce:transition-none"
      >
        <path d="M3 8h10M9 4l4 4-4 4" />
      </svg>
    </Link>
  );
}

/** The column's top edge: 2px, bright at the left, dark at the right. */
function Rule() {
  return <div aria-hidden="true" className="contact-rule h-[2px] w-full" />;
}

function MailIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="#f5a623"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-[1.15em] w-[1.15em] shrink-0"
    >
      <rect x="2.75" y="5" width="18.5" height="14" rx="3" />
      <path d="m3.6 6.7 7.3 5.4a2 2 0 0 0 2.2 0l7.3-5.4" />
    </svg>
  );
}
