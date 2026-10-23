import Link from "next/link";

import { ContactEmailText } from "@/components/contact-email";
import { SiteMark } from "@/components/site-header";
import type { Dict } from "@/lib/i18n/dictionary";

/**
 * The last block on the home page: three columns under three rules — the
 * product, its privacy policy, and the way to reach it.
 *
 * The composition is transcribed from the supplied Apple reference — a hairline
 * across the top of each column, a long drop of empty space, then one large
 * line of tinted type with its explanation under it. What carries the design is
 * the **row of rules**: short bright-to-dark gradients side by side, which is
 * what tells the eye there are columns before it has read a word.
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
 * `min-h` is what keeps the columns' headlines on exactly one baseline.
 * The row is as tall as its tallest item, and the two columns' items are not
 * the same height — a solid tile reads smaller than line art at one size, so
 * the mark is `1.1em` and the envelope `1.15em` — which centred each column's
 * text in a box half a pixel different from the next. A floor taller than
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
      {/* Three columns — the product, its privacy policy, the way to reach it —
          each built the same way: rule, icon beside a headline, one paragraph.
          The policy used to be a pill under the Tempus column, the only boxed
          thing in a block made of rules and type, and it read as a stray
          button; as a column of its own it is a third member of the row.

          One column below `lg` with the rules stacked: a rule is per column,
          so a column that wraps takes its own rule with it. Three columns
          start at `lg` because at `md` a third of the width leaves
          "Confidentialité" and its icon no room on one line.

          Side by side, the three share one rule across the full width instead
          of three: separate rules cut the row into three blocks, and one line
          over all of them is what makes it read as one footer. The drop under
          it is shorter than a column's own (40px against 64px), which keeps the
          columns attached to the line they hang from. */}
      <Rule className="hidden lg:block" />
      <div className="grid gap-12 lg:grid-cols-3 lg:gap-8 lg:pt-10">
        <Column>
          {/* The masthead's own mark, beside the masthead's own word — the
              same component the top-left corner of the site uses, so there is
              one piece of artwork and one mask rather than a second copy to
              keep in step.

              It is painted flat `text-ink` rather than swept, which is exactly
              what it wears up in the masthead: a gradient tile beside the word
              read as two different whites there. It has to be a *sibling* of
              the swept text — `background-clip: text` with a transparent
              colour applies to the whole element, and a mask inside one would
              be clipped to glyphs it does not have. */}
          <div className={HEADLINE_ROW}>
            <SiteMark className="h-[1.1em] w-[1.1em] text-ink" />
            {/* Written here rather than translated: it is the product's own
                name. */}
            <p className={HEADLINE}>Tempus</p>
          </div>
          <p className={BODY}>{t.contactLead}</p>
        </Column>

        <Column>
          {/* The whole column is the link, not just its headline: the target
              is as large as the block it reads as, and the arrow — the one
              thing here the other two columns lack — is what says it opens. */}
          <Link
            href="/privacy"
            className="group block rounded-sm focus-visible:outline-2 focus-visible:outline-offset-8 focus-visible:outline-accent"
          >
            <div className={HEADLINE_ROW}>
              <ShieldIcon />
              <p className={HEADLINE}>{t.footerPrivacy}</p>
              <svg
                aria-hidden="true"
                viewBox="0 0 16 16"
                fill="none"
                stroke="#f5a623"
                strokeWidth={1.6}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-[0.55em] w-[0.55em] shrink-0 opacity-70 transition-transform group-hover:translate-x-1 group-hover:opacity-100 motion-reduce:transition-none"
              >
                <path d="M3 8h10M9 4l4 4-4 4" />
              </svg>
            </div>
            <p className={`${BODY} transition-colors group-hover:text-ink`}>
              {t.footerPrivacyHint}
            </p>
          </Link>
        </Column>

        <Column>
          <div className={HEADLINE_ROW}>
            <MailIcon />
            <p className={HEADLINE}>{t.contactTitle}</p>
          </div>
          {/* The address lives in this sentence rather than above it — see
              `ContactEmailText`, which is shared with `/contact`. */}
          <p className={BODY}>
            <ContactEmailText text={t.contactBlurb} />
          </p>
        </Column>
      </div>
    </section>
  );
}

// One measure for all three paragraphs, so the columns end on the same
// rhythm; `max-w` is in `ch` of the paragraph's own size.
const BODY = "mt-5 max-w-[40ch] text-[15px] leading-relaxed text-ink-dim";

/**
 * A rule (stacked layout only), then the reference's long drop before the headline: the drop is what
 * makes the rule read as the top edge of a column rather than as an underline
 * above a paragraph. Shorter on a phone, where stacked columns of it would be
 * most of a screen of nothing.
 */
function Column({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <Rule className="lg:hidden" />
      <div className="pt-10 sm:pt-16 lg:pt-0">{children}</div>
    </div>
  );
}

/** The column's top edge: 2px, bright at the left, dark at the right. */
function Rule({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`contact-rule h-[2px] w-full ${className}`} />
  );
}

// Line art drawn to the mail icon's stroke and size, so the three icons in the
// row read as one set.
function ShieldIcon() {
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
      <path d="M12 3 5 6v5.5c0 4.2 2.9 8 7 9.5 4.1-1.5 7-5.3 7-9.5V6l-7-3Z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
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
