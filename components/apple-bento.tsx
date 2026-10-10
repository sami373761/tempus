/**
 * Temporary homepage section: buttons for areas that do not exist yet.
 *
 * This is a deliberate reproduction of the supplied Apple product-page bento
 * reference, so the geometry is transcribed from it rather than chosen:
 *
 *   columns      855 : 862 (near equal), gutter 34
 *   left column  665 : 360 rows
 *   right column 313 : 715 rows
 *   whole block  1751 x 1063  ->  aspect 1.647
 *
 * The two **big** cards are 15% shorter than that, by request: the tall card
 * stood the whole height of its column with its glyph and headline pinned to
 * the foot, so most of it was empty above them. Taking the height out of the
 * block rather than out of the cards is what keeps the other two the size they
 * were — the ratios below are solved so the icon card and the ring card hold
 * their pixel heights while their neighbours lose a seventh. The two columns
 * land 4.6px apart on that sum at the board's cap, which is why both are
 * written against one `aspect-[1751/960]` rather than each carrying its own.
 *
 * Those numbers are kept as `fr` ratios and an `aspect-ratio`, and every inset,
 * radius and type size is expressed in `cqw` against the block's own width.
 * The result scales like the reference at any width instead of drifting as
 * breakpoints change. Below `md` it unstacks into a single column, where fixed
 * ratios would squash the text.
 *
 * The icons are placeholders, per the brief — the visual treatment is the part
 * being matched. The copy is not: it reads the dictionary like every other
 * string on the site, and the cards wrap to their own width rather than
 * breaking their lines by hand, because the line that reads well in English
 * breaks in the wrong place in German.
 *
 * The colour is **not** transcribed. The reference's blue/purple/pink and green
 * sweeps were the only chroma on an otherwise neutral page, so every gradient
 * and glyph here is a grey ramp instead; the gradients themselves are unchanged
 * in type, angle and stop positions. See the note in app/globals.css for why the
 * text sweeps stop at medium grey while the strokes run all the way down.
 *
 * One exception, and it is deliberate rather than a leftover: the library
 * card's sun keeps its amber. Don't "finish" the grey pass by neutralising it.
 */

import type { Dict } from "@/lib/i18n/dictionary";
import { randomHomepageHeroUrl } from "@/lib/storage/images";

const CARD =
  "relative overflow-hidden rounded-[clamp(16px,1.6cqw,30px)] bg-card text-left transition-transform duration-500 ease-out will-change-transform hover:scale-[1.012] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent";

export function AppleBento({ t }: { t: Dict }) {
  return (
    <div className="@container w-full">
      <div className="grid grid-cols-1 gap-[clamp(12px,1.95cqw,24px)] md:aspect-[1751/960] md:grid-cols-[855fr_862fr]">
        {/* Left column: the photo card 15% shorter, the icon card unchanged. */}
        <div className="grid grid-cols-1 gap-[clamp(12px,2.2cqw,24px)] md:grid-rows-[356fr_228fr]">
          <HeroCard t={t} />
          <IconCard t={t} />
        </div>

        {/* Right column: the tall card 15% shorter, the ring card unchanged. */}
        <div className="grid grid-cols-1 gap-[clamp(12px,2.2cqw,24px)] md:grid-rows-[198fr_386fr]">
          <IntelligenceCard t={t} />
          <EventsCard t={t} />
        </div>
      </div>
    </div>
  );
}

/**
 * The reference's photo card: image bleeding to all four edges, icon upper
 * left, headline sitting on the image at the bottom left.
 *
 * The photo is one of the Colosseum shots in R2, picked per render. The
 * homepage reads the locale cookie, so it is request-rendered and the pick
 * really does vary between visits rather than freezing at build time.
 *
 * The mesh gradient stays underneath as the loading/failure state: the card
 * is never a bare rectangle while the photo is in flight.
 */
function HeroCard({ t }: { t: Dict }) {
  return (
    <button type="button" className={`${CARD} min-h-[272px] md:min-h-0`}>
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: [
            `url(${JSON.stringify(randomHomepageHeroUrl())})`,
            "radial-gradient(90% 80% at 14% 6%, #d6d6d6 0%, #9a9a9a 28%, rgba(90,90,90,0) 62%)",
            "radial-gradient(70% 60% at 72% 10%, #e2e2e2 0%, #a8a8a8 34%, rgba(100,100,100,0) 70%)",
            "radial-gradient(100% 75% at 58% 104%, #7d7d7d 0%, #565656 42%, rgba(40,40,40,0) 78%)",
            "linear-gradient(170deg, #2b2b2b 0%, #333333 55%, #161616 100%)",
          ].join(","),
        }}
      />
      {/* Keeps the headline legible over the bright part of the image, exactly
          as the reference's own scrim does. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent"
      />

      <div className="relative flex h-full flex-col justify-between p-[clamp(20px,3.8cqw,46px)]">
        <BookIcon />
        <h3 className="max-w-[86%] text-pretty font-display text-[clamp(22px,3.15cqw,56px)] font-semibold leading-[1.07] tracking-[-0.022em] text-white">
          {t.bentoBrowseTitle}
        </h3>
      </div>
    </button>
  );
}

/** Icon left, headline right, both vertically centred. */
function IconCard({ t }: { t: Dict }) {
  return (
    <button
      type="button"
      className={`${CARD} flex items-center gap-[clamp(16px,3.5cqw,42px)] px-[clamp(20px,4.45cqw,54px)] py-[clamp(20px,3.5cqw,42px)]`}
    >
      <SunIcon />
      <h3 className="text-pretty font-display text-[clamp(18px,2.75cqw,48px)] font-semibold leading-[1.1] tracking-[-0.022em] text-ink">
        {t.bentoLibraryTitle}
      </h3>
    </button>
  );
}

/** The gradient-stroked card: 2px conic ring, gradient glyph, gradient type. */
function IntelligenceCard({ t }: { t: Dict }) {
  return (
    <button
      type="button"
      className={`${CARD} gradient-ring flex items-center gap-[clamp(14px,2.7cqw,34px)] px-[clamp(18px,4.2cqw,50px)] py-[clamp(18px,3cqw,36px)]`}
    >
      <IntelligenceIcon />
      <h3 className="text-pretty font-display text-[clamp(18px,2.5cqw,44px)] font-semibold leading-[1.18] tracking-[-0.022em] text-ink">
        <Highlighted
          template={t.bentoDailyTitle}
          slot="highlight"
          value={t.bentoDailyHighlight}
          className="text-sweep-dim"
        />
      </h3>
    </button>
  );
}

/** The tall card: glyph alone in the upper area, headline pinned to the bottom. */
function EventsCard({ t }: { t: Dict }) {
  return (
    <button
      type="button"
      className={`${CARD} flex min-h-[221px] flex-col justify-end gap-[clamp(18px,4.2cqw,50px)] p-[clamp(20px,3.8cqw,46px)] md:min-h-0`}
    >
      <TempleIcon />
      <h3 className="text-pretty font-display text-[clamp(18px,2.85cqw,50px)] font-semibold leading-[1.15] tracking-[-0.022em] text-ink">
        <Highlighted
          template={t.bentoEventsTitle}
          slot="events"
          value={t.bentoEventsCount}
          className="text-sweep-bright"
        />{" "}
        <span className="text-ink-dim">{t.bentoEventsNote}</span>
      </h3>
    </button>
  );
}

/**
 * A headline with one phrase painted in a gradient sweep.
 *
 * The sentence arrives as a template with a single `{slot}` in it rather than
 * as the two or three fragments around the sweep, because the sweep does not
 * sit in the same place in every language: it opens the Turkish sentence and
 * closes the English one. Concatenated fragments would hard-code English word
 * order into all five.
 *
 * A template with no slot in it simply renders as itself, which is the right
 * answer for a translation that chose not to highlight anything.
 */
function Highlighted({
  template,
  slot,
  value,
  className,
}: {
  template: string;
  slot: string;
  value: string;
  className: string;
}) {
  const [before, ...rest] = template.split(`{${slot}}`);

  return (
    <>
      {before}
      {rest.length > 0 && (
        <>
          <span className={className}>{value}</span>
          {rest.join(`{${slot}}`)}
        </>
      )}
    </>
  );
}

// --- placeholder glyphs ----------------------------------------------------
// Line weights are in `cqw` too, so the strokes thin out with the block instead
// of going chunky at small sizes.

/**
 * An open book, replacing the laptop this card carried until it was asked for.
 *
 * The card is about reading the timeline event by event, and a laptop said
 * "on a screen" — which every card on the page already is. Drawn on the same
 * terms as the other three glyphs: open strokes, no fill, weight in `cqw` so
 * it thins with the block, and the same 64x40 box so the headline beside it
 * does not move.
 *
 * Three paths and no more: two pages splayed off a centre spine. The leaves
 * are straight rather than fanned because at 64px a curve on a 2.6px stroke
 * reads as a wobble rather than as a page.
 */
function BookIcon() {
  return (
    <svg
      viewBox="0 0 64 40"
      aria-hidden="true"
      className="w-[clamp(64px,9.7cqw,170px)]"
      fill="none"
      stroke="#ffffff"
      strokeWidth="2.6"
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <path d="M32 11.8 7.8 7.6A1.9 1.9 0 0 0 5.5 9.5v19.6a1.9 1.9 0 0 0 1.6 1.9L32 35.3" />
      <path d="M32 11.8 56.2 7.6a1.9 1.9 0 0 1 2.3 1.9v19.6a1.9 1.9 0 0 1-1.6 1.9L32 35.3" />
      <path d="M32 11.8v23.5" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      viewBox="0 0 48 48"
      aria-hidden="true"
      className="w-[clamp(44px,6.5cqw,114px)] shrink-0"
      fill="none"
      /* The one glyph left coloured, by request: the grey pass took the amber
         out of this card too, and the library card is the one place a warm
         accent was wanted. Everything else on the block stays neutral. */
      stroke="#f5a623"
      strokeWidth="2.4"
      strokeLinecap="round"
    >
      <circle cx="24" cy="24" r="8.5" />
      <path d="M24 3.5v7M24 37.5v7M3.5 24h7M37.5 24h7M9.5 9.5l5 5M33.5 33.5l5 5M38.5 9.5l-5 5M14.5 33.5l-5 5" />
    </svg>
  );
}

/**
 * The site's own mark, in place of the reference's Apple Intelligence glyph.
 *
 * A mask rather than a picture, on the same reasoning as the home page's edge
 * vines: `public/logo.svg` is pure white and only its alpha matters, so the
 * card paints its gradient sweep *through* the mark and keeps the colour run
 * the {5/2} star carried before. It also keeps 68KB of path data out of the
 * bundle, which inlining the paths to stroke them with a `<linearGradient>`
 * would not. The file's viewBox is cropped to the outer ring, so a square box
 * with `mask-size: 100% 100%` lands the mark with no padding to crop out.
 *
 * It is built from `data/logo-beyaz-seffaf-kalin3.svg` — the **bold** master,
 * not the regular `logo-beyaz-seffaf.svg` beside it. The regular weight's lines
 * come out near 1px at this size and read as a grey smudge rather than a mark.
 *
 * The sweep keeps the glyph's own vector — bottom-left light, top-right dark —
 * but runs over `.text-sweep-dim`'s range rather than the star's, which bottomed
 * out four stops darker at #595959. The star carried that on 6px strokes; the
 * mark's lines are nearer 1px at the same size and the dark end simply sank it
 * into the card. Ending where the headline beside it ends puts the two at one
 * value.
 *
 * It is `.logo-sweep` in app/globals.css rather than an arbitrary value here,
 * because the home page's turning mark is the same glyph and has to be the same
 * grey. Two copies of the ramp would drift the first time either was retuned.
 */
const LOGO_MASK = {
  maskImage: "url(/logo.svg)",
  WebkitMaskImage: "url(/logo.svg)",
  maskSize: "100% 100%",
  WebkitMaskSize: "100% 100%",
  maskRepeat: "no-repeat",
  WebkitMaskRepeat: "no-repeat",
} as const;

/**
 * The same turning mark the home page's top-left corner carries, built the same
 * way: the mask turns, a painted child counter-rotates, and both read the one
 * `.logo-turn` keyframe set in app/globals.css. Sharing the rule and its
 * duration is what makes the cancellation exact — the sweep stays put on screen
 * with its light end at the bottom-left while the glyph travels under it — so
 * the two copies of the mark cannot drift apart or start spinning their own
 * sweeps.
 *
 * `relative` is new here and load-bearing: `SiteMark`'s outer box is already
 * out of flow, but this one is a flex item, and without it the painted child's
 * `-inset-0.5` would resolve against the card instead of against the mask.
 */
function IntelligenceIcon() {
  return (
    <div
      aria-hidden="true"
      style={LOGO_MASK}
      className="logo-turn relative aspect-square w-[clamp(44px,7.1cqw,125px)] shrink-0"
    >
      <div className="logo-sweep logo-turn-counter absolute -inset-0.5" />
    </div>
  );
}

/**
 * A classical temple front, replacing the reference's battery glyph.
 *
 * Drawn rather than borrowed so it matches the other two placeholder glyphs:
 * open strokes, no fill, line weight in `cqw` so it thins with the block. The
 * parts are the real ones and that is what makes it read as a temple at 60px —
 * pediment, entablature, five columns, and the three steps of a crepidoma. The
 * column span is centred on the box (11.5..60.5 about 36) so the glyph does not
 * list to one side against the headline beside it.
 */
function TempleIcon() {
  return (
    <svg
      viewBox="0 0 72 54"
      aria-hidden="true"
      className="w-[clamp(60px,8.5cqw,149px)]"
      fill="none"
      stroke="url(#temple-stone)"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <defs>
        <linearGradient id="temple-stone" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ededed" />
          <stop offset="0.5" stopColor="#b2b2b2" />
          <stop offset="1" stopColor="#6b6b6b" />
        </linearGradient>
      </defs>

      {/* Pediment, closed so the tympanum reads as a face rather than a roof. */}
      <path d="M2.5 22.5 36 5 69.5 22.5Z" />
      {/* Entablature: the band the columns carry. */}
      <path d="M6 27.5h60" />
      {/* Columns. */}
      <path d="M14 27.5v15.5M25 27.5v15.5M36 27.5v15.5M47 27.5v15.5M58 27.5v15.5" />
      {/* Stylobate and the two steps below it. */}
      <path d="M6 43h60M3 47.5h66M0.5 52h71" />
    </svg>
  );
}
