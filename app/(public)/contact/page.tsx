import type { Metadata } from "next";

import { ContactEmailText } from "@/components/contact-email";
import { SiteMark } from "@/components/site-header";
import {
  contactView,
  CONTACT_VIEW_PARAM,
  type ContactView,
} from "@/lib/contact";
import type { Dict } from "@/lib/i18n/dictionary";
import { readLocaleContext } from "@/lib/i18n/server";

/**
 * Where the menu's Contact row and its Buy-me-a-coffee row both land.
 *
 * **One page, two doors.** The two errands are the same errand — reaching the
 * person who builds this — so they share a document rather than a route each,
 * and what the door decides is only the *order*: whichever section you came
 * for is the first thing under the heading, and the other is one scroll below
 * it. The order is a validated search parameter (`lib/contact.ts`), never a
 * second route, so there is one page, one metadata block and one canonical
 * URL.
 *
 * Reordering rather than scrolling to a hash is deliberate. A hash jump leaves
 * the section you did not ask for sitting above the one you did, and arrives
 * mid-page with no heading over it; dealing the sections in arrival order means
 * the page always starts at its own top with the thing you pressed.
 *
 * **The arriving section carries the `h1`.** The two are the same shape, so
 * which one is the page's heading follows from which one leads — the document
 * outline then says what the page is *for this visitor* rather than naming one
 * of its halves permanently. The other is an `h2` underneath.
 *
 * The layout is its own and deliberately not the home page's contact block,
 * which stays at the foot of that page. There the two columns are two
 * different things side by side (the product, and the way to reach it); here
 * each section is one errand split into a headline column and an answer
 * column, and the two sections are stacked. What the two compositions share is
 * the amber rule across the top of a column (`.contact-rule`) and the swept
 * headline, so the page reads as the same family rather than as a second
 * design.
 *
 * **The contents are a scaffold.** The structure — the two sections, the order,
 * the headings — is settled; what fills them is not. The tip jar in particular
 * has nothing to link to (there is no payment route and no domain, CLAUDE.md
 * gap 1), so it carries the site's dashed "named, not built" note in place of
 * a button, exactly like the leaderboard's sample standings.
 *
 * A pair of chips linking to the two sections stood above the first headline
 * until they were removed on request. They were a table of contents for a page
 * with two entries on it, both of which the page already names in type large
 * enough to read from across the room — so the first thing under the heading
 * was a control that only moved you to something already in view.
 */

/** The spread of a section's title, and the box its artwork is sized in.
 *
 *  The size lives on the row so the mark and the envelope can be `em` and
 *  track the headline through its whole `clamp()` range — the home masthead's
 *  arrangement, and the contact block's. It is a step above that block's
 *  (22/3.2vw/36) because here the first of these *is* the page's heading and
 *  has no `h1` above it to sit under.
 *
 *  `min-h` is what keeps the two sections' headlines on the same cap height
 *  whichever is on top: a row is as tall as its tallest item, the two pieces
 *  of artwork are not the same height, and a floor taller than both takes them
 *  out of that sum. */
const HEADLINE_ROW =
  "flex min-h-[1.2em] items-center gap-3 text-[clamp(26px,3.6vw,42px)] sm:gap-4";
// Balanced for the contact block's reason: a wrapped title left one word on
// its own line ("Spendier mir einen / Kaffee").
const HEADLINE =
  "contact-sweep text-balance font-display font-semibold leading-[1.05] tracking-[-0.03em]";

/** Next hands both of these the same promised query. */
type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const [{ t }, params] = await Promise.all([
    readLocaleContext(),
    searchParams,
  ]);
  const view = contactView(params[CONTACT_VIEW_PARAM]);
  const section = SECTIONS[view];

  /* The title is the arriving section's, for the same reason the `h1` is: a
     tab opened from the tip jar row should say so. */
  return {
    title: `${t[section.titleKey]} · Tempus`,
    description: t[section.leadKey],
  };
}

export default async function ContactPage({ searchParams }: PageProps) {
  const [{ t }, params] = await Promise.all([
    readLocaleContext(),
    searchParams,
  ]);
  const view = contactView(params[CONTACT_VIEW_PARAM]);

  /* The order, and the only thing the view decides. The second entry is
     whichever of the two the visitor did not come through. */
  const order: readonly ContactView[] =
    view === "contact" ? ["contact", "support"] : ["support", "contact"];

  return (
    /* The site's column — `--board-w` plus the `px-6` it carries — so this page
       lines up with the home board above it and with the leaderboard and the
       badges beside it. */
    <div className="mx-auto max-w-[calc(var(--board-w)+3rem)] px-6 pb-32 pt-12 sm:pt-20">
      {/* A generous gap rather than a divider between the two: each section
          already opens on its own rule, which is the edge that separates
          them. */}
      <div className="flex flex-col gap-24 sm:gap-32">
        {order.map((id, index) => (
          <ContactPageSection
            key={id}
            id={id}
            t={t}
            /* The arriving section is the document's heading; see the note at
               the top of the file. */
            heading={index === 0 ? "h1" : "h2"}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * What each of the two sections is made of, keyed by the view that leads with
 * it.
 *
 * The ids are the view names, so a section's anchor, its place in the order
 * and the href that arrives at it are all spelled the same way once.
 */
const SECTIONS = {
  contact: {
    titleKey: "contactTitle",
    leadKey: "contactLead",
  },
  support: {
    titleKey: "supportTitle",
    leadKey: "supportLead",
  },
} as const satisfies Record<
  ContactView,
  { titleKey: keyof Dict; leadKey: keyof Dict }
>;

/**
 * One errand: its rule, its headline and lead on the left, and the answer to
 * it on the right.
 *
 * Both sections are the same composition on purpose — that is what lets either
 * one lead without the page looking rebuilt — and they are told apart by their
 * artwork and by what sits in the answer column.
 *
 * The `id` stays on each section with the `scroll-mt` that clears the floating
 * menu button, so `/contact#support` is still a live anchor for anything that
 * links one directly — nothing on the site does now that the jump pair is
 * gone, but an anchor costs nothing and a dead one is a broken link.
 */
function ContactPageSection({
  id,
  t,
  heading: Heading,
}: {
  id: ContactView;
  t: Dict;
  heading: "h1" | "h2";
}) {
  const section = SECTIONS[id];

  return (
    <section id={id} className="scroll-mt-28">
      {/* The column's top edge, bright at the left and dark at the right — the
          home contact block's rule, which is the one thing both compositions
          share besides the swept headline. It spans the whole section here
          rather than one column, because the two columns below it are halves
          of one errand rather than two separate ones. */}
      <div aria-hidden="true" className="contact-rule h-[2px] w-full" />

      <div className="grid gap-8 pt-10 sm:pt-14 md:grid-cols-2 md:gap-16">
        <div>
          {/* The artwork is a *sibling* of the swept text, never a child:
              `background-clip: text` with a transparent colour applies to the
              whole element, so a mask or an icon inside it would be clipped to
              glyphs it does not have. */}
          <div className={HEADLINE_ROW}>
            {id === "contact" ? (
              /* The masthead's own mark, painted flat `text-ink` exactly as it
                 is up in the corner of the site: a gradient tile beside the
                 word reads as two different whites. */
              <SiteMark className="h-[1.1em] w-[1.1em] shrink-0 text-ink" />
            ) : (
              <CupIcon />
            )}
            <Heading className={HEADLINE}>{t[section.titleKey]}</Heading>
          </div>
          <p className="mt-5 max-w-[36ch] text-[15px] leading-relaxed text-ink-dim">
            {t[section.leadKey]}
          </p>
        </div>

        {/* The answer column. It is the half of each section that is still a
            scaffold: the address is real and the tip jar has nothing behind it
            yet. */}
        <div className="md:pt-2">
          {id === "contact" ? (
            <p className="max-w-[46ch] text-[15px] leading-relaxed text-ink-dim">
              <ContactEmailText text={t.contactBlurb} />
            </p>
          ) : (
            /* A dashed edge is the site's mark for a thing that is named but
               not built — the same note the leaderboard's sample standings
               carry, and the same holding pattern the home board's unbuilt
               cards use. It stands where the way to send one will go. */
            <p className="max-w-[46ch] rounded-2xl border border-dashed border-hairline px-5 py-3 text-[13px] leading-relaxed text-ink-dim">
              {t.supportSoon}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

/** The tip jar's artwork: the menu row's own cup, at the headline's size.
 *
 *  `1.15em` rather than the mark's `1.1em` because line art reads smaller than
 *  a solid tile at one size — the pairing the home contact block already makes
 *  between that mark and its envelope. Amber, which is this family's one
 *  chroma. */
function CupIcon() {
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
      <path d="M4 9h12v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9Z" />
      <path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M7.5 3.5v2M11 3.5v2" />
    </svg>
  );
}
