# TEMPUS — working notes

A historical date-guessing game. Two games are playable (`/guess`, `/compare`),
head-to-head works (`/versus`), and there are accounts with badges behind them.
**There is still no admin UI**, and nothing is scored or saved — see the gaps.

Stack: Next.js 15 (App Router) · TypeScript · Tailwind v4 · Supabase Postgres 17
· Cloudflare R2 · targeted at Vercel.

## Current state (as of 2026-10-06)

The remote Supabase database (`kyxydoaevasuauflrjrl`) is migrated and populated:

- **497 events**, all `status = 'published'`
- **2485 translations** — 497 × 5 locales (`en, tr, de, fr, es`), none missing
- **3 era categories** (`bce` 135, `ce` 362, `future` 0), one per event, kept in
  sync by trigger
- **261 images** — 93 `bce/`, 168 `ce/`, one primary each; see gap 2 below
- Range: 4.54 billion BCE → 2022 CE; precision `year` 474, `century` 23
- **6 badges** in `public.badge`, reference data; `public.profile` and
  `public.user_badge_progress` exist and are empty but for the QA account
- 11 migrations applied, tracked in `internal.schema_migrations`

Source data: `data/tarihsel_olaylar_500_5_dil.txt`, 500 lines,
`TR:EN:DE:FR:ES:Date` with no spaces around the colons.

## Commands

```bash
npm run dev                 # localhost:3000
npm run typecheck           # tsc --noEmit — run before declaring done
npm run build

npm run events:check        # parse the dataset, no DB access — ALWAYS do this first
npm run db:seed:events      # upsert events + translations (idempotent on slug)
npm run db:migrate          # apply supabase/migrations/*.sql
npm run db:migrate -- --dry-run

npm run era:check           # SQL era rule == TS era rule, and mapping integrity
npm run image:attach -- …   # link one R2 object to an event (see below)
npm run images:attach -- …  # link a whole R2 prefix, filename == event slug

npm run backdrops:derive -- --prefix date-guessing-game/   # rebuild -1440/-2560
npm run backdrops:derive -- --key comparison-game/cosmos.jpg
npm run backdrops:derive -- --key homepage/pattern.jpg --widths 800,1600

# A confirmed test account, for walking the auth flow without a mailbox.
# Writes credentials to .env.test.local (gitignored); never prints them.
node --experimental-strip-types scripts/make-test-account.ts
```

`npm run db:types` needs the Supabase CLI, which is **not installed**. Hand-edit
`lib/db/database.types.ts` to match any migration, or install the CLI.

**`npm run build` while `npm run dev` is running breaks the dev server.** The
build rewrites `.next` underneath it and every route then 500s with "Cannot find
module". It is not a code error and nothing is actually wrong with the change
that was being verified. Recover with `pkill -f "next-server|next dev"`,
`rm -rf .next`, then start `dev` again — and expect to do this after every build
taken mid-session.

## Non-obvious invariants

**Dates use astronomical year numbering.** `event.year` is a `bigint`: 1 BCE = 0,
1000 BCE = -999, 4.54 billion BCE = -4539999999. There is no year zero gap, so
ordering, range filters and guess-distance are all plain integer subtraction —
never branch on era. Constraint: `year between -15000000000 and 3000`.

`event.sort_key` is a **generated** column (`year*10000 + month*100 + day`,
unknown parts collapsing to Jan 1). `sortKey()` in `lib/historical-date.ts`
reproduces it exactly; if you change one, change both. Peak magnitude ~1.5e14,
inside `Number.MAX_SAFE_INTEGER`, so no BigInt handling is needed in TS.

**`historical_year_label()` in SQL and `formatYear()` in TS must agree**,
including the "4.54 billion BCE" scale switch past a million. The view column
`event_localized.year_label` comes from the SQL side, so divergence shows up in
the UI. Verified identical across all distinct years; re-verify if you touch
either.

**An event with no photograph is not on the site.** Every read in
`lib/db/queries.ts` requires a primary image by default, so the games draw from
261 of the 497 events and the rest wait their turn rather than appearing as a
grey placeholder. Nothing has to be re-seeded to bring one back — attaching an
image is the whole of it. The default is a default, not a hard rule, because
editing tools have to be able to see exactly what the site is hiding: pass
`requireImage: false`. `EVENT_PLACEHOLDER_IMAGE` stays as the last-resort
fallback, but on the public site it should now be unreachable.

The pool this leaves: 261 for the date-guessing game, and 233 at or after 9999
BCE — 199 of them at distinct years — for the comparison game, which needs three
distinct years per round.

**Translations are rows, not columns.** A 6th language = insert into
`public.locale` + translation rows. No migration. A new translatable field = one
column on `event_translation`.

**Images: Postgres stores keys, never bytes.** `image.r2_bucket` +
`r2_object_key`; public URL is `${NEXT_PUBLIC_R2_PUBLIC_BASE_URL}/${key}`.
`source_page_url` and `license_code` are NOT NULL — an image cannot be inserted
without provenance. Partial unique index allows at most one `is_primary` per
event.

**Supabase grants ALL privileges to `anon` on every new table in `public`** via
default privileges. RLS is what actually blocks writes (there are no write
policies), but `20261002120300_harden_grants.sql` revokes the write grants too,
so both layers must be opened deliberately. **Any new table in `public` needs
the same treatment**, or it ships world-writable. This is why the migration
ledger lives in `internal`, not `public` — PostgREST only exposes `public`.

**One font family: Inter.** It was two until 2026-10-06 — Lora for anything
large enough to read as a title, Lato for body copy — and both tokens in
`app/globals.css` now resolve to the same face: `--font-display` is literally
`var(--font-sans)`. Inter loads through `next/font/google` in `app/layout.tsx`,
which self-hosts it (no runtime request to Google), as a **variable** font, so
one load covers 400 through 700 and nothing is synthetically emboldened. It
needs `latin-ext`, because Turkish ğ/ş/ı are not in `latin`.

**`--font-display` stays, and so does the `font-display` utility on the 35
headings that carry it.** It is a marker for "this text is a title", not a
second typeface — putting a display face back is one line in that token rather
than an edit per heading. Don't "clean up" the callers.

Two traps, both of which have already bitten. **Tailwind's default family token
is named `--font-sans` whatever face it holds**; preflight applies it to `html`,
so overriding it is what makes Inter the default for elements no utility class
touches — renaming it drops everything back to Tailwind's stock sans. And
**every name in a font stack must resolve**: a `var()` with no value makes the
whole custom property invalid at computed-value time, so `font-family:
var(--font-display)` is dropped and headings silently inherit the body face.
That is exactly how a display face pointed at an unloaded font failed —
silently, with no error anywhere.

The swap was checked against the two screens that cannot afford it: `/guess` and
`/compare` are each exactly one viewport and must not scroll, and both still
measure 0px of overflow in either axis at 1680x844. **Re-measure those two
after any further type change** — Inter is wider than Lato at the same size, and
`--compare-chrome` is a hand-maintained sum.

**The palette is neutral on pure black, and the tokens are ordered by
lightness.** `@theme` in `app/globals.css` holds it. It was sepia until
2026-10-04; the greys that replaced it were **solved for contrast ratio, not
picked to match lightness**, so each one keeps the ratio against `page` that its
sepia counterpart had (card 1.19:1, card-raised 1.44:1, hairline 1.66:1,
`ink-dim` 6.25:1) and the layout's contrasts all survived the swap.

That distinction matters whenever these are retuned. `--color-page` is now
`#000000`, so its luminance is exactly 0 and the ratio against it collapses to
`1 + 20 × L`. A grey chosen to *look* like the old token's lightness therefore
lands at the wrong ratio and the surfaces compress toward the floor until cards
stop reading as lifted. `page < card < card-raised < hairline` in lightness is
what makes a card read as a surface lifted off the page — keep that order.

`--color-accent` stays blue on purpose, and the chroma on the page is it, the
green and red beside it, and the two hues the verdict ladder added on
2026-10-07, so don't tint any of them toward the neutrals. Green is the true
answer in the comparison game. **Blue is no longer anything a player drives**:
it was the date-guessing rail's travelled portion until 2026-10-08 and that is
muted white now (see "The date-guessing screen"), so the token's remaining
callers are the site-wide focus ring and `--color-tier-perfect`.
`public/event-placeholder.svg` hardcodes its own copy of four palette colours
(three gradient stops and the clock stroke), so it has to be retuned alongside
them.

**The five `--color-tier-*` tokens are the verdict ladder**, worst to best, and
the only ordered colour scale on the site. Three of them are the accents above
and two (`#ffd60a` yellow, `#ff9f0a` orange) are the rest of the same Apple
dark-mode family those were taken from. The names collide with the tiers in one
place worth knowing: `--color-good` is the green of a *true answer* and it
paints the tier called **great**, while the tier called **good** is the yellow
one. `lib/game/verdict-style.ts` derives every shade of each with `color-mix`,
so a tier is one value to retune and never three.

**The date-guessing answer marker is no longer green.** It was a green stick
and a green caption on the rail until 2026-10-07 and is white now — see "The
date-guessing screen". Green still means "the true answer" in the comparison
game, which is why the token's name is unchanged.

**The one coloured thing on that rail is now the gap between the guess and the
truth**, drawn in the verdict's own tier colour from 2026-10-08 — so the five
tier tokens reach the ruler as well as the result card. See "The date-guessing
screen".

The bento block in `components/apple-bento.tsx` is otherwise all greys, with one
deliberate exception: the library card's sun keeps its amber `#f5a623`. It was
neutralised with the rest and put back by request — don't "finish" the grey pass
by taking it out again.

The per-era washes in `components/timeline-backdrop.tsx` are **not** part of
this palette and were deliberately left coloured — they encode which era you are
in (deep space, mossy prehistory, sunbaked antiquity, steel-blue recorded
history, cold cyan future) and are what keeps the five panes distinguishable
when R2 is unreachable.

**The home page's edge vines are gone.** A vine ran down each side of the first
screen until 2026-10-05, as an alpha mask (`public/ornament-vine.png`, pure
white) painted in `--color-ornament` by `Ornament` in `app/(public)/page.tsx`.
Both the component and the token were removed on request; the artwork is still
in `public/`, so restoring them is a component and a colour rather than new
pixels. The board was widened in the same pass, which is what used to force the
vines' breakpoint — see `--board-w` below.

**The home page's mark is a tile, and it does not turn.** `public/logo-mark.svg`
is the negative artwork — the `Tempus` sundial knocked *out* of a rounded square
— so used as an alpha mask it paints the tile and lets the glyph show the page
through. `SiteMark` in `components/site-header.tsx` is that mask and nothing
else; the paint is the element's own `.logo-sweep` background, which is why the
mark no longer needs the painted child the turning version had. Three things to
keep:

- **Only the alpha matters**, so the colour is the element's own background and
  the artwork's antialiasing survives — the same arrangement as the hero's edge
  vines. It is `bg-current`, i.e. the colour of the text it sits in: the mark
  and the word `Tempus` are one masthead and must not come apart when `ink` is
  retuned. It wore `.logo-sweep`'s grey ramp for an afternoon and at this size
  a gradient tile beside flat white text read as two different whites.
  `data/logo-negatif-siyah.svg` is the master; the copy in `public/` is that
  file with its C2PA `<metadata>` blob stripped, which is 7KB of base64 the
  browser would download and ignore.
- **Keep the box square.** The file's viewBox is square, so `mask-size: 100%
  100%` lands the tile with no padding to crop out; a non-square box stretches
  the corner radii into ovals.
- **It is sized in `em`, not pixels** (`h-[1.1em]`), because it sits inside the
  masthead `h1`, whose size is `clamp()`ed against the viewport. A pixel box
  would drift out of proportion with the word at both ends of that range.

It turned once a minute until 2026-10-05, hanging alone in the top-left corner.
It stopped when it moved next to the word it names: a glyph revolving beside its
own wordmark reads as a spinner rather than as a dial. `.logo-turn` and
`.logo-turn-counter` stay in `app/globals.css` with one caller left —
`IntelligenceIcon` in `components/apple-bento.tsx`, the same glyph on the "Built
for daily challenges" card, which still turns and still cancels the sweep's
rotation with a counter-rotating child. They remain shared classes rather than
moving into that component because the cancellation is only exact while both
halves read one keyframe set and one duration (verified 0.00° net rotation at
four angles). Under `prefers-reduced-motion: reduce` the rotation stops outright
rather than being shortened — a thing that turns forever is the case that
setting exists for.

`.logo-sweep` is the grey ramp, and the bento's glyph is now its only caller.

**The home page's masthead is a row on the board's own column.** `SiteHeader`
renders **nothing** on home — it used to carry the corner mark and now does not
— and the masthead lives in the hero in `app/(public)/page.tsx`: mark and
wordmark at the left end, the menu button at the right, in a box capped at
`--board-w`. That token is `GameBoard`'s own cap, read rather than repeated,
which is the whole point of the row: the mark lands over the top-left corner of
the Daily card and the button over the top-right corner of the date-guessing
card. Measured at 1680x844 — mark left 278.1px against the Daily card's 278.1px,
button right 1386.9px against that card's 1386.9px.

The menu button is **rendered by the page on home** (`<SiteMenu … inline />`)
and the layout's floating copy stands down there — two instances in the tree,
never two on screen. It has to be inline on that page specifically: the hero is
`min-h-dvh` and `justify-center`, so the masthead's height off the top of the
screen is a function of the viewport, and a button at a fixed `top-7` would sit
at a different height from the row it reads as part of on every screen but one.
Off home the button still pins itself to the viewport for the reasons below.

The tagline hangs under that row rather than inside it, which is why the row is
`items-center` on the title's line: the button stays level with the word it sits
beside instead of centring against a two-line block. The hero still fits the
first screen — 681px of content against 844px of viewport, measured after the
board was narrowed by a tenth on 2026-10-06.

**`<body>` must not carry an opaque background.** The page colour lives on
`html` (`app/globals.css`), and `app/layout.tsx` leaves `body` transparent on
purpose. An in-flow block's background paints *after* negative-z-index
descendants, so `bg-page` on `body` silently hides any full-bleed `-z-10`
backdrop — which is exactly how the date-guessing backdrop first rendered as
five identical black screens. `html`'s background is propagated to the canvas
and still paints under everything.

**The view uses `security_invoker = true`** (PG15+), so callers' RLS applies.
Local verification against Homebrew postgresql@14 requires stripping that
clause; hosted Supabase is PG17 and fine.

**The dataset parser reports, never guesses.** Unparseable dates and malformed
lines surface with line numbers instead of being coerced — a silently mis-dated
event would be taught as fact by the game. Dots are digit-group separators
(`MÖ 4.540.000.000`) *except* in ordinals (`5. yüzyıl`), so century/millennium
forms are matched before separator stripping. Centuries store the midpoint:
`MÖ 5. yüzyıl` → -449, `14. yüzyıl` → 1350.

## Content writes go through the service role

**On content**, `anon`/`authenticated` are SELECT-only and see
`status = 'published'` only. Content writes use `lib/db/admin.ts` (service-role
key, bypasses RLS) or the direct connection in `scripts/`. Admin authorization
is a Supabase `app_metadata.role = 'admin'` claim, which cannot be
self-assigned; `app/admin/layout.tsx` is the single gate.

**A browser can write exactly two things, and they go different ways on
purpose.**

A **date challenge** goes the way content does: `submitDateChallenge` in
`app/actions/challenges.ts` validates the pair it is given and hands one INSERT
to the service role. `public.event_date_challenge` has RLS on, zero policies and
no grants at all for `anon` or `authenticated` — verified both ways after the
migration — so there is no second path to it. That is the right shape here
because the game screen is playable signed out: there is no `auth.uid()` for a
policy to name.

A **username** goes through RLS instead, and that is a deliberate departure
rather than an oversight — see "Accounts are the first table written through
RLS". The short version: `public.profile` rows have an owner, so
`id = auth.uid()` in a policy is strictly stronger than re-checking ownership in
TypeScript. Badge progress stays service-role-only, because a player who could
write their own progress row could award themselves a badge.

The test when adding a third: **does the row have an owner the database can
name?** If yes, a policy. If no, the service role and a validated action.

**The direction *is* the vote.** The player is asked "earlier or later"; the
column is a `smallint` of `+1` (the real date is later than the stored year) or
`-1` (earlier), because the admin panel's requirement is to rank events by
upvotes and downvotes and a signed column aggregates straight into that.
`public.event_challenge_stats` is that read model — `later_votes`,
`earlier_votes`, `total_votes`, `score = sum(direction)` — LEFT joined from
`event` so an unchallenged event is still a row with a zero score, which makes
"most disputed" and "least" the same query in two directions.
`lib/db/challenges.ts` is the single place the word becomes the number; the UI
never sees the sign.

There was nothing to key "one vote per person" on when this was built, and
there still is not: accounts arrived on 2026-10-06 but a challenge is submitted
from the game screen, which is playable signed out and must stay that way. So
this remains a stream of reports for an editor to read rather than a
referendum — the counts say which dates players keep arguing with, and the
editor checks the source. **If a per-player limit is ever wanted, that is a
`user_id` column and a decision about signed-out play, not a tweak.**
`eventChallengeStats()` is written and unused: it is what the admin panel will
list.

## Environment

All values live in `.env.local` (gitignored, mode 600). **Never hardcode or
commit secrets.** `lib/env.ts` is the only module that reads `process.env`;
public values are lazy getters so a missing variable renders a setup notice
instead of crashing the module graph.

```
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY          # server-only, bypasses RLS
SUPABASE_DB_URL                    # direct Postgres, used by scripts/
CLOUDFLARE_ACCOUNT_ID              # NOT R2_ACCOUNT_ID
R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME                     # NOT R2_BUCKET; value: history-images
NEXT_PUBLIC_R2_PUBLIC_BASE_URL
```

The service-role key and R2 secret were pasted into a chat transcript. Rotating
both is still advisable.

**Auth adds no environment variables**, which is deliberate: the Supabase URL
and anon key were already there, and the callback origin is read from the
request's own `Host` rather than configured (see "Accounts"). What auth *does*
need lives in the Supabase dashboard, not the repo — the Google provider, and
the Site URL / Redirect URLs that the confirmation email and the OAuth round
trip come back through.

`.env.test.local` holds the throwaway QA account's credentials. It is covered by
the existing `.env*.local` ignore rule and is written by
`scripts/make-test-account.ts`, never printed.

## Known gaps / next steps

1. **`r2.dev` is blocked at the network level, not misconfigured.** Confirmed
   on 2026-10-03: from the owner's own browser the whole zone fails to resolve
   and every object URL errors, and switching on a VPN makes all of them load
   immediately. So the earlier "503" reading and the sandbox SERVFAIL below are
   one and the same problem — reachability from this location, not the bucket.
   **Settled, do not re-raise:** the owner has decided to point Cloudflare at a
   custom domain and will do it on their own schedule. Report a failed image
   load as "r2.dev is unreachable" and move on — no recommendation, no asking
   them to switch the VPN on. When the domain lands the only change is
   `NEXT_PUBLIC_R2_PUBLIC_BASE_URL`; `publicImageUrl()` is the single reader.
   Verify object *existence* via the S3 API, which always works.

   **`r2.dev` is unresolvable from the agent sandbox — this is not a bucket
   problem.** The whole zone SERVFAILs here, `r2.dev` itself included, and
   outbound DNS to public resolvers is blocked, so the public URL cannot be
   verified from inside Claude Code. It works from a browser. Verify R2 objects
   via the S3 API (`CLOUDFLARE_ACCOUNT_ID`.r2.cloudflarestorage.com), which does
   work. Do not conclude the bucket is misconfigured from a DNS failure here.
   For production, prefer a custom domain: r2.dev is rate-limited.
2. **261 event images, and they are now the whole of the visible dataset.**
   `image` has 261 rows, one primary per event: 93 of the 135 BCE events (69%)
   and 168 of the 362 CE ones (46%), added across 2026-10-02/06 — 78 of them in
   one batch on 2026-10-06. The remaining 236 events are **hidden from the
   site** rather than falling back to
   `EVENT_PLACEHOLDER_IMAGE` (see the invariant above) — attaching an image is
   all it takes to put one back in play. Their provenance is
   `source_name = 'Wikimedia Commons'`, `license_code = 'PD'`, and
   `source_page_url = 'https://commons.wikimedia.org/'` — the **site root, not
   the per-file page**, because the files were renamed to event slugs before
   upload and the original Commons page names are lost. Backfilling real file
   pages is open work; do not synthesise `File:<slug>.jpeg` URLs, they 404.
   **Every row now has real width and height**, which it did not until
   2026-10-06: nine AVIFs carried nulls because `probeImage()` sniffed the brand
   and gave up. It walks the box tree now — `meta` -> `iprp` -> `ipco`, picking
   the `ispe` that `pitm`/`ipma` say belongs to the primary item rather than the
   first one found, since a single AVIF can carry several (thumbnail, alpha,
   gain map) and "the first" is a coin flip. Verified against macOS `sips` on
   all 17 AVIFs in the bucket: identical, every one. The nine old rows were
   backfilled from the same read.

   **Three upload mistakes recur, and all three are caught, never guessed:**

   - *Apostrophes.* The slug for "Caesar's Gallic Wars" is
     `beginning-of-caesar-s-gallic-wars`, with `-s-`, so `…-caesars-…` does not
     match. Fix with explicit `image:attach --event <slug> --key <key>`, which
     takes the event directly and needs no rename. Twelve files so far; the
     2026-10-06 batch brought four at once — `yuri-gagarins-spaceflight`,
     `proclamation-of-the-peoples-republic-of-china`,
     `announcement-of-dolly-the-sheeps-cloning`, and
     `election-of-barack-obama-as-us-president`, whose event is
     `election-of-barack-obama-as-u-s-president` (initials split the same way:
     `u-s`, not `us`).
   - *Key shape.* `parseImageObjectKey()` demands
     `<era>/<slug>.<lowercase ext>`, so a trailing space before the extension
     (`council-of-nicaea .jpeg`) or an uppercase one (`…-buddha.JPG`) is
     refused. The fix is a conforming copy of the object, not `--allow-any-key`.
   - *Wrong era folder.* A BCE event's picture uploaded under `ce/` is refused
     by design. Watch for events that feel "AD" but are not: Confucius, the
     Buddha, Ashoka, the Qin and Han foundations, and the traditional birth of
     Jesus (astronomical year -3 **is** 4 BCE) all belong under `bce/`.

   Eight such objects were copied `ce/` -> `bce/` and six to corrected names on
   2026-10-03, and one more on 2026-10-04:
   `ce/publication-of-newtons-principia .jpg` (both traps at once — a trailing
   space *and* a missing `-s-`) was copied to
   `ce/publication-of-newton-s-principia.jpg`. Five more on 2026-10-06: four
   trailing spaces (`construction-of-the-berlin-wall`, `launch-of-the-iphone`,
   `nuremberg-laws`, `telephone-patent`) and one wrong folder —
   `ce/babylonian-capture-of-jerusalem.jpeg`, whose event is year -596, copied
   to `bce/`. **The malformed originals were left in place** and still show up
   as skips on every bulk run. Deleting them is safe and is open work.

   One more stray joined them: `ce/ashoka-adopts-buddhism.jpeg` is both in the
   wrong folder and redundant — the event is `ashoka-s-adoption-of-buddhism`
   (year -259) and already has a primary image under `bce/`. Do not attach it.

   The bucket also holds hand-uploaded homepage art under `homepage/` — the two
   Colosseum photos used as the bento hero background via
   `HOMEPAGE_HERO_OBJECT_KEYS`, the two cover pairs for the game cards, the
   seven `*-card` photographs the board's tiles are dressed in (see "Every
   photographed card on the board" below), `pattern.jpg` — the artwork behind
   the explorer's library statistics, and the about card's before that — with
   its own `-800`/`-1600` pair, and `survival-stage-1600.jpg`, the one picture
   the explorer needed at a size the board had no use for. The masters those cards were cut
   from are in there beside them, under the names they were uploaded with:
   `football.jpeg`, `basketball.jpg`, `movies-1.jpg`, `flag-1.jpg`,
   `arka-2.jpg`, `arka-3.jpg` and `arka-4.png`. **Three masters are the
   exception and sit under prefixes of their own** — `invention/invention.jpg`
   (a filament bulb), `when-born/when-born.webp` (the Confucius statue) and
   `coming-soon/coming-soon.jpg`, hand-uploaded on 2026-10-06 for the games
   view's last three bare cards; the 512px square cards cut from them went to
   `homepage/invention-card.jpg`, `homepage/when-born-card.jpg` and
   `homepage/coming-soon-card.jpg` with every other card, so the board stays one
   prefix and the dev proxy needed no new entry. The coming-soon master is a
   still from a feature film, like the poster collage behind the Film & TV card
   (`movies-1.jpg`) — neither is licensed, and both are a rights question to
   settle before the site is public. **`arka-1.jpg` — the gilded
   shrine of Tutankhamun — is uploaded but unused**: it arrived with the other
   four on 2026-10-05 and was never given a card. All of it belongs to no event,
   so `parseImageObjectKey()` rejects these keys by design. A stray
   `bce/formation-ofthe-moon.jpeg` (missing hyphen) is superseded by the
   correctly-named copy and is safe to delete; until then every bulk run
   reports it as one skip and exits non-zero.

   The bucket also holds **one 3D model**, under `3d-models/`:
   `tetradrachme_uit_macedonia-v1.glb`, 3.9MB, the coin the home page's explorer
   turns while nothing is open. Like every decorative asset it belongs to no
   event, so `parseImageObjectKey()` rejects the key by design. `3d-models/` and
   `glb` both had to be added to the dev proxy, and a missing prefix there looks
   exactly like a missing object. See "The explorer's coin".

   And **one video**, under `videos/`: the aerial of the Colosseum that coin
   replaced on 2026-10-07, as an uploaded master plus a derived 720p copy and a
   poster frame. Nothing reads it any more; it is kept rather than deleted.

   **The r2.dev public URL fails from the owner's network without a VPN** —
   see gap 1, which this was previously mis-read as a 503. The stored rows are
   sound (the attach script reads size, type, SHA-256 and dimensions from the
   bytes over the S3 API, which works), and attached images do render once the
   host is reachable. The placeholder and the bento's mesh gradient cover for it
   otherwise.
3. **Only era categories exist.** `category` holds `bce`/`ce`/`future` and
   nothing else — the source file has no topical column, so there are no subject
   tags yet. `category.kind` distinguishes `era` from future `topic`/`region`
   rows, and the era trigger only ever touches `kind='era'` links.
4. **Re-seeding reintroduces 3 duplicates.** The source file still contains
   duplicate pairs at lines 380 (Peace of Westphalia), 387 (Storming of the
   Bastille) and 449 (Brexit referendum) — same event and year as lines 200, 211
   and 340, differing only in Turkish wording. Their DB rows were deleted on
   request. Delete those three source lines, or re-delete the `*-2` slugs after
   any re-seed.
5. **There are accounts now, and still no saved scores.** `match`,
   `match_player`, `match_round` and `match_answer` exist because a two-player
   game cannot be refereed from a browser; they hold a match in flight and
   `versus_sweep()` deletes them afterwards. There are still **no solo
   sessions, no saved scores and no leaderboard data** — a solo set lives in
   component state and dies with the tab, and `/leaderboard` is ten written-out
   players. `event.status` and `category.kind` remain as they were: cheap now,
   awkward to retrofit.

   What changed on 2026-10-06 is that there is now somewhere for a score to
   *belong*. `public.profile` is one row per account and
   `public.user_badge_progress` is one row per (player, badge) — see "Badge
   progress is infrastructure". Both are durable player data, which makes them
   the second and third exceptions to the ephemeral rule alongside
   `event_date_challenge`. A solo session table is still **not** to be added
   speculatively; the badge rules come first, and they may not need one.

   `event_date_challenge` (see "Content writes go through the service role") is
   editorial data rather than game state — a report that a date is wrong —
   which is why it is not swept.

6. **The admin panel does not exist yet, and there is now something waiting
   for it.** `app/admin/layout.tsx` is still the only thing under `/admin`, so
   every route there 404s. `eventChallengeStats()` in `lib/db/challenges.ts`
   is written, typed and unused: the list of events ranked by how often their
   dates are disputed, which is the first screen that panel wants.

   Note that `/admin` is **not** in `PROTECTED_PREFIXES` and does not need to
   be: `requireAdmin()` in that layout is a stricter gate than the signed-in
   check, and it throws rather than redirecting. Nobody sees that today because
   there is no page under it to render.
7. **Google sign-in needs the provider switched on in the Supabase dashboard.**
   The code is complete and the redirect URL is right (verified: PKCE
   `code_challenge`, `redirect_to=<origin>/auth/callback`), but the project has
   the provider disabled, so the authorize endpoint answers 400.
   `providerRefuses()` turns that into this site's own error message instead of
   a dead end — see "Accounts". Enabling it also means adding
   `<project>.supabase.co/auth/v1/callback` to the Google OAuth client's
   authorized redirect URIs. No code change either way.

   **The account page's Google branch is therefore the one path that has not
   been exercised against a real account.** `/account` offers a Google-only
   player a "Set a password" form with no current-password field, and
   `updatePassword` skips the check for them — both decided by
   `hasPasswordIdentity`, so the shape of that branch is settled; what is
   unverified is only Supabase actually attaching an email identity to an OAuth
   user on `updateUser({ password })`. Worth walking once the provider is on.
   The email/password half **is** verified end to end against the live project:
   wrong current password refuses, correct one saves.
8. **Sign-ups are rate-limited by Supabase's built-in SMTP.** Email
   confirmation is on (`mailer_autoconfirm: false`, read from
   `/auth/v1/settings`), so every sign-up sends a mail — and the built-in
   sender allows only a handful an hour, after which `signUp` returns the
   rate-limit error rather than succeeding. That is a project setting, not a
   bug: it surfaces correctly as `authErrRateLimited`. **A real launch needs a
   custom SMTP provider configured in the dashboard.** It also means repeated
   sign-up testing stalls quickly — use `scripts/make-test-account.ts`, which
   goes through the Admin API and sends no mail. Note too that Supabase's
   public sign-up endpoint **rejects `@example.com`** outright (the Admin API
   does not), which reads back as `authErrEmailInvalid`.
9. **The contact address is a placeholder.** `CONTACT_EMAIL` in
   `lib/contact.ts` is `hello@tempusgame.com`, which does not exist — there is
   no domain yet (gap 1). One constant, deliberately not in the dictionary: an
   address is not a translation. It moved out of
   `components/contact-section.tsx` on 2026-10-07, when `/contact` became a
   second place that prints it.
10. **`/contact` is a structure waiting for its concept.** The page, the two
   sections, the order and which heading is the `h1` are settled (see "The
   contact page is one page with two doors"); the content is not, and the owner
   has said the details are coming. The tip jar in particular has **no way to
   send anything** — no payment route, no provider, no domain — so it shows the
   dashed "named, not built" note instead of a button. Filling either section in
   is content and a component, not a route.

## Head-to-head (two players, date guessing only)

A second player plays the **same** date-guessing screen: `/versus` opens a
match, `/versus/<code>` is the lobby and then the game. Only this mode is
multiplayer — the comparison game was deliberately left alone — but nothing in
the match machinery knows which game it is refereeing except the column holding
a guessed *year*.

**The server is the referee, and "the server" means Postgres.** Every
transition — a deadline passing, a round closing, a duplicate answer, two
answers in the same millisecond — is decided by plpgsql under
`select ... for update` in `20261005120000_versus_matches.sql`, not by
read-then-write from a server action. The application grades a guess
(`gradeGuess` stays the one copy of that rule) and the database decides whether
the graded guess counts. `versus_reconcile()` runs at the head of every entry
point, so a match is never stale because nobody called in.

**`public.match` is the only table a client may read, and that constrains its
columns.** Clients learn about changes through Supabase Realtime, which pushes
whole rows and cannot hide a column behind RLS. So the match row carries only
what both players may see, and the two things that would decide a live round
live where `anon` has no grant at all:

- `match_round.event_id` **is the answer** — `public.event` is world readable,
  so handing a client the event id hands it the year. It reaches the browser
  only as a `MaskedEvent` (`lib/game/versus.ts`), which is `LocalizedEvent`
  with `year`, `month`, `day`, `sortKey` and `precision` removed *in the type*,
  so putting one back is a compile error rather than a silent leak.
- `match_answer` holds the raw guesses. A seat gets its **own** guess back
  (`MatchView.yourGuess`, which is what restores the marker after a reload) and
  the opponent's only once the round is in `match.history`.

Before adding a column to `match`, ask whether showing it to the opponent
mid-round would change how they play. If so it belongs in one of the other two.

**Realtime carries state; a Server Action carries the question.** That split is
forced by the point above and is not an optimisation: the pushed row cannot
contain the next event, so the client fetches it per round — during the reveal
window, so it is never in the way. The same fetch re-measures the clock.

**The countdown is displayed, never kept.** `round_deadline_at` is the
authority. The client renders `deadline - (now + offset)` where `offset` is
measured NTP-style on a real request (`refresh()` in
`components/versus-game.tsx`), so a wrong system clock cannot lengthen a round,
and a suspended tab comes back showing the right number. When a client's
countdown hits zero it **prompts** the server to look at its own clock; it does
not decide. Both clients prompt, so one of them leaving cannot stall a match.

Two things about that prompt are load-bearing, and both were bugs that stalled a
match at "next round in 0" with nothing on screen to explain it.

**`serverNow` must come from the clock that stamps the deadlines**, which is
Postgres, not the Node process. `buildMatchView` reported `Date.now()` until
2026-10-05; on Vercel plus hosted Supabase those are two machines, measured
50-112ms apart on a dev box with no guaranteed sign. Node ahead of Postgres by
any margin means every client's countdown reaches zero before the deadline it
counts towards has passed, `versus_reconcile` rightly does nothing, and the
round stops. It now reads `public.versus_db_now()`
(`20261005140000_versus_db_clock.sql`), sampled **in parallel with the
reconcile** rather than after it — a sample taken late in the request biases the
offset high, which is the unsafe direction. Prompting late is free; prompting
early is the failure.

**The prompt retries; it is not latched.** It was once per
`(generation, round, phase)`, which made every way of losing a single request
permanent — a dropped fetch, a dev server restarting mid-match (which
invalidates in-flight Server Actions), or a prompt landing a few ms early. One
miss and the match sat there forever. `PROMPT_RETRY_MS` re-prompts every second
while a deadline stays passed. Note the contrast with the sibling effect that
fetches the question, which has always cleared `fetchedRound` on failure — and
with `refillAttempt` in both solo games. **Latching before a request is known to
have succeeded is the bug; the rest of the codebase already avoids it.**

**A long absence resumes a match, it does not race it to the end.** Each
transition stamps its next window from the current clock, so one reconcile
applies the deadlines that have already passed and then stops. A player whose
opponent vanished plays the match out at normal pace, winning each round by
timeout.

**Points are the existing grade read more finely, not a second scoring
system.** `roundPoints()` in `lib/game/scoring.ts` gives each verdict tier a
contiguous slice of 0–100 and slides within it on the same relative error that
chose the tier, so points can never disagree with the word on screen and
`BANDS` is still the one place difficulty is tuned. A `wayOff` guess decays
hyperbolically rather than scoring zero, so "less hopelessly wrong" still beats
"more hopelessly wrong". This is a different question from `timelineResult`'s
hit/miss, which is about a solo set's percentage and is unchanged.

`POINT_BOUNDS` grew a rung with the tiers on 2026-10-07 and one gap in it is
deliberate: `perfect` is the exact year and nothing else, so it is always worth
100 while `great` tops out at 90. An exact answer is a different kind of thing
from a near miss and the scale says so.

**A seat that never answered records the bottom tier, and that string is named
in SQL.** `versus_seat_result()` synthesises `'wayOff'` for a missing answer
row — the one place the database spells a verdict rather than storing what the
application handed it — so renaming a tier means a migration. That is what
`20261007120000_versus_way_off_verdict.sql` is; `match_answer.verdict` itself
is unconstrained text precisely so retuning the tiers never needs one.

**The invite URL is read from the page, which makes `localhost` a trap.** The
lobby builds the link, the WhatsApp message and the QR code from
`window.location.origin`, so a host browsing `http://localhost:3000` hands the
second player a URL whose host *is their own device* — the QR scans fine and
goes nowhere. `NEXT_PUBLIC_DEV_INVITE_ORIGIN` (`.env.local`) overrides the
origin for all three, and `inviteOrigin()` in `components/versus-lobby.tsx`
applies it **only on a loopback host**, so a value left in an environment can
never redirect a deployed site's invites. Testing on two devices also needs the
LAN address in `allowedDevOrigins` (`next.config.ts`) — without it the phone
gets the HTML and none of the JS, which looks like a broken app rather than a
blocked origin. Full recipe in `docs/VERSUS_IMPLEMENTATION_CHECKPOINT.md`.

**A seat is a bearer token in `sessionStorage`, which is per tab.** There are no
accounts. Per tab is deliberate: it survives a reload (the reconnect that
matters) and it lets two tabs on one machine play each other, which is the only
way to test this without two devices. Closing the tab gives the seat up — a real
limitation, and the reason a missing opponent only shows a banner while the
clock keeps running. Presence (`lib/realtime/match-channel.ts`) is **advisory**:
no match is ever paused, forfeited or ended because presence dropped.

**A rematch reuses the row.** Same match, same seats, same tokens,
`generation + 1` — because the spec is that neither player sends a new link.
Rounds and answers are keyed by generation so the new game cannot collide with
the finished one's rows.

### What the two games now share

`components/timeline-stage.tsx` holds everything both the solo and head-to-head
games *draw* — the five-pane camera, the rail, `RoundCard`, the pane labels,
`panDuration`, the answer marker. Each mode keeps what it *decides*. The split
is why head-to-head looks like the same game rather than a second one, so prefer
moving a shared visual there over copying it.

What a verdict is *called* and what colour it is drawn in moved out to
`lib/game/verdict-style.ts` on 2026-10-07, because the set summary — shared with
the comparison game, which has no stage — was carrying a second copy of the
label map. Four screens read it now: both flanks, the narrow-screen overlay, the
head-to-head result row and the summary.

Two additions worth knowing: `TimelinePaneView` takes an optional
`opponentYear`, drawn as a hollow grey ring rather than a new colour (the
player's marker and the answer's are both already on that rail, and a third
shape in a fourth colour would make it the most colourful thing on a neutral
page); and `RoundCard` takes an `aside` for the
countdown, opposite the round counter.

A third, from 2026-10-08: `gapColor`, the hue to draw the distance between the
guess and the truth in. Both modes pass `VERDICT_COLORS` — the solo game from
`accuracy.verdict`, the head-to-head one from *your own seat's* verdict, since
the gap is your marker's distance and not the round's. Everything head-to-head adds is an
**overlay on the photograph** for the same reason the solo verdict is — the
screen is one viewport and the height budget has nothing spare.

### The QR encoder

`lib/qr.ts` is a complete QR encoder (byte mode, EC level M, versions 1–10)
written out rather than installed. A hosted generator would put the invite URL —
a capability to join someone's game — in a third party's logs and would make the
lobby fail whenever that service did. It is rendered as one inline SVG path with
a painted white quiet zone, because a transparent code on dark glass does not
scan.

Verified against Apple's Vision framework: every version 1–10 round-trips, and
so does the code as actually rendered in the browser. Two bugs it is worth not
reintroducing, because both produce a plausible-looking code that simply will
not scan — the generator polynomial must be built highest-degree-first
(multiplying by `x` moves a coefficient toward index 0), and the first copy of
the format information is transposed relative to the second.

## Era categories and R2 layout

Every event carries exactly one `kind='era'` category, derived from its year:

| year | category slug / R2 folder |
| --- | --- |
| `<= 0` | `bce` |
| `1 .. 2026` | `ce` |
| `> 2026` | `future` |

The boundary is `<= 0` because astronomical year 0 **is** 1 BCE. Year numbering
has a zero so arithmetic crosses the era boundary without a gap; the era of that
year is still BCE.

Slugs are ASCII so they double as R2 folder prefixes. The rule lives in **two
places that must be changed together**: `public.era_slug_for_year(bigint)`, last
set by `20261002120600_era_boundary_fix.sql`, and `eraForYear()` in
`lib/historical-date.ts`. **`npm run era:check` asserts they agree** across every
boundary and that no stored link contradicts the rule — run it after touching
either side.

The link is maintained by `public.sync_event_era_category()`, an AFTER trigger on
`insert or update of year`. Never write era links by hand. The trigger deletes
only `kind='era'` links, so topical categories an editor sets are left alone.

The bucket contains three zero-byte placeholder objects — `bce/`, `ce/`,
`future/` — which is how R2 represents empty folders. `parseImageObjectKey()`
rejects them, but **any script that lists the bucket must skip keys ending in
`/`** or it will treat them as 0-byte images.

Object keys are `<era>/<filename>.<ext>`, e.g. `ce/beginning-of-world-war-ii.webp`.
`buildImageObjectKey()` builds them from the event's year, `parseImageObjectKey()`
validates and inverts them, and `attach-image.ts` refuses a key whose folder
contradicts the event's era.

## The home page is one board that swaps its own contents

`components/game-board.tsx` owns everything between the tagline and the scroll.
Two views live in it:

- **Play** — two cover cards over a row of three. Daily and date guessing on
  top; 1v1, comparison and "other games" underneath.
- **Games** — eight square cards: survival, football, basketball, film & TV,
  inventions, "born when?", "coming soon", and the way back. Everything but the
  way back carries a photograph. The last two slots stood empty until
  2026-10-06; the view no longer holds any open.

Survival sat on the play view until 2026-10-05 and moved into the games view,
taking one of the three slots that were being held open there. It belongs with
them: it is a mode that is named but not built, which is what everything else in
that view is.

Only `/guess`, `/versus` and `/compare` exist. Daily, survival and everything in
the second view are **named before they are built**, by request, so the shape of
the product is visible while the games behind it are written. The board replaced
a pair of grids — two 16/10 covers and six short tiles — on 2026-10-05.

**Every card on the board is one height — `CARD_HEIGHT`, one line in
`components/game-board.tsx` — and that is what makes the two views line up.**
Both are two rows of it, so swapping the board cannot move a card up or down.
Four things that depend on:

- **It is a height, not an aspect ratio, because the cards are no longer one
  shape.** A cover spans half the board, a play tile a third of it, a games
  card a quarter. Only the games cards come out square, and they do so for
  free: the value *is* a games card's width.
- **The board is an `@container`.** `100cqw` is the board's own width; the
  `3rem` is the three 1rem gaps between four columns. Every grid drops to two
  columns under `md`, where a card's width is `(W - 1rem)/2` instead, so the
  height carries a `md:` pair that tracks that breakpoint. Verified against the
  square side at 327, 700 and 1308px of board width, both branches.
- **A fixed aspect ratio cannot do this.** A cover spans two columns *plus the
  gap between them*, so the ratio that lands it on the squares' height is
  `2(W-16)/(W-48)` — a function of the board's width, not a constant. `16/10`
  was 71px too tall at the cap, which is what made the games view sit lower:
  the cell took the taller play view's height and `self-center` hung the
  shorter one in the middle of it, 35px down.
- **The play view is six columns and the games view four**, which is the one
  place they differ. Three tiles do not divide four columns; at six, a cover
  spans three and a tile two, so both rows still end flush with the board's
  edges and the two views stay the same *width* as well as the same height.
  Both counts are written out in `BoardView` rather than interpolated —
  Tailwind reads the source for class names and never sees
  ``md:grid-cols-${n}``.

`BoardCard`'s `span` prop is how wide a card sits, never how tall. Unset is one
column; `"wide"` is `md:col-span-2`, the play row's third; `"full"` is the same
third above `md` and the whole width under it, which is what the odd tile in a
two-column row needs so the mobile row is flush too (play and games are both
four rows there).

They are still stacked in one grid cell (`col-start-1 row-start-1`) with
`self-center`, which is now belt and braces rather than the thing doing the
work: the hero is `min-h-dvh` and `justify-center`, so a board that changed
height between views would move the masthead above it by half the difference.

Measured at 1680x844: both views exactly 1109x546 at the same `offsetTop`, all
cards 265px tall — covers 546 wide, play tiles 359, games cards 265 square.

**Only the arriving view deals its cards in.** Both inner grids are keyed on a
swap counter so the entrance can replay — a finished CSS animation does not run
again merely because its element became visible — but `data-swapped` is gated on
`active`, or the departing cards restart their own entrance underneath their
fade and the board reads as flinching. The leaving view goes as a block, for the
same reason the menu's rows do: a staggered exit holds the last card past the
moment its replacement has arrived underneath it, and the two boards become
legible through each other. The rules are the `.board-view` / `.board-card-in`
block in `app/globals.css`.

**The hidden view is `inert`**, like the menu panel. `opacity: 0` alone would
leave a grid of links and buttons sitting invisibly over the page — verified
that only the active view is tabbable.

**The board hands focus between the two cards that swap it.** The card you just
pressed is inside the view that has gone `inert`, so the browser drops focus to
the body and the next Tab restarts from the top of the page. The effect in
`GameBoard` moves it to `[data-board-swap]` in the arriving view. No ring
appears after a click — a programmatic focus inherits the modality of the
interaction that caused it, so `:focus-visible` only lights up when the card was
activated from the keyboard, which is exactly when it is wanted.

**A card that cannot be played is a `div`, not a disabled link**, and that is
unchanged from the tiles it replaced: with an `href` it is a `Link` carrying an
arrow, with an `onClick` it is a `button`, and with neither it is an
`aria-disabled` div carrying a "soon" chip in the arrow's place. Not a `Link`
because there is nothing to navigate to and a 404 is worse than a label; not a
`<button disabled>` because there is nothing to press. They stay out of the tab
order deliberately.

**There are no dashed edges on the board any more.** A dashed edge used to mean
a card that cannot be used — the two empty slots and the "coming soon" card wore
one, and the two cards that swap the board deliberately did not, being the one
live control on the view they sit in. The slots are named now and "coming soon"
has a photograph of its own, so `outlined` lost its last caller and was removed
along with `EmptySlot`. The "soon" chip is the whole of the distinction. Bringing
the variant back is a `surface` branch and a prop.

**Every card answers the pointer, and what it answers with says whether it can
be pressed.** A live card — a `Link`, or one of the two `button`s that swap the
board — brightens its border *and* its fill. A card that cannot be played
brightens only the border (`hover:border-ink/25`, asked for on 2026-10-07 so
the games view answers the pointer the way the play view does) and comes out of
its mute (`opacity-80` to full, or `opacity-60` to `opacity-80` with no
photograph), with the default cursor. **The fill is the half that stays
withheld**: `hover:bg-card-raised` is what a pressable card looks like, and
wearing it would promise a click the card cannot answer. **The picture carries
the hover both of them share** — a 4% scale over 700ms, clipped by the card's
`overflow-hidden`, with the scrim a sibling so the title does not drift with it.
It is on the photograph rather than on the card because a card's own border and
fill are invisible underneath one, which is why only the three interactive cards
appeared to react at all before 2026-10-06. `CoverCard` had the zoom first; the
square cards match its numbers so the board reads as one system.

**The entrance animation nearly swallowed all of that, and the fix is in the
keyframe.** `board-card-in` ended at `opacity: 1` with a `both` fill, and an
animation beats a class: after a swap every card on the games view sat at full
strength, so the mute was only ever visible on the first paint (where the
animation does not run) and the hover had nothing left to change. The `to`
keyframe now names no opacity at all — which makes the 100% keyframe implicit,
so a card animates up to *its own* opacity — and the fill is `backwards`, which
hands the element back to its own styles the moment the animation ends.
`backwards` is still what the stagger needs: it is the delay that has to find
the card already invisible.

**Every card anchors its text to the bottom and wraps rather than truncating.**
That started as a property of the square cards — there is room for a second
line, and a name that needs one grows the block upward into space the card
already has — and the two covers joined them on 2026-10-06. Their titles stood
in the middle of the frame until then, which made them the only cards on the
board whose label was not in the same corner as everybody else's, so the eye
had to find the name twice per row. A `CoverCard` now carries exactly a
`BoardCard`'s three things in the same places: icon chip top left, chip or
arrow opposite, kicker-and-title block at the foot. What is bigger is the type
(`text-3xl sm:text-4xl` against the tiles' `text-xl sm:text-2xl`), not the
arrangement. The tiles were `text-lg` until 2026-10-07, which at a third of the
board read as a caption beside a cover; the step up was asked for with the
constraint that it stay clearly under a cover's, so Daily and Date Guessing are
still the loudest names on the board.

It is also why the kicker is optional — the title is the last line either way,
so the titles across a row share a baseline whether or not there is a line
above them. The tiles these replaced were one line tall and had to `truncate`,
which made every new language a measurement; this does not.

**Every card but the way back carries a sentence that unrolls under its title
on hover**, which is the one thing on the board a card's own name cannot say:
what the mode actually is. `CardBlurb` in `components/game-board.tsx` is all of
it, and four things hold it up.

- **The row animates, not the text.** `grid-template-rows: 0fr -> 1fr` with the
  child owning the `overflow-hidden` — the explorer's pills' arrangement, and
  the only way to animate a height from nothing without measuring one in
  JavaScript. There are thirteen of these on the board.
- **Growing the row is what lifts the title.** Every card's text block is
  anchored to the card's lower edge, so a row opening underneath the title
  pushes the title up by exactly the paragraph's own height and moves nothing
  else on the card. A translate on the title would have been a guess at that
  number, and the number changes with the language.
- **It never opens on a touch screen**, for free: Tailwind v4 compiles
  `group-hover:` inside `@media (hover: hover)` (verified in the built CSS).
  That matters because a phone's card is ~163px tall and the open text block
  wants ~200 — on a pointer device the worst case is 167px of 257.
- **The text is always in the document.** It is revealed by CSS, not mounted by
  script, so a screen reader reads each card's name *and* what the mode is.
  `.board-card-blurb` exists only so `prefers-reduced-motion` can reach both
  the row's duration and the paragraph's.

The two built games reuse the instruction their own screen already carries
(`timelineBlurb`, `comparisonBlurb`) rather than keeping a second sentence
about the same game in five languages; the other ten are `card*Blurb` keys.

**The kicker is the game a mode is played over** ("date guessing"), which is
what the Daily, 1v1 and survival cards carry. Comparison has none, and neither
does the date-guessing cover: each *is* a game, and its name is the whole
label.

**`CardScrim` is the card's own surface colour fading up out of the picture,
not a black wash over it.** `--color-card` is where a bare card already sits,
so the photograph dissolves into the board rather than being dimmed by a film
laid on top of it — which is the whole difference between a card that looks
dark and one that looks deep. It is bottom-weighted (`h-[72%]`, `from-card via-card/55 to-transparent`)
because every card's text is anchored to its lower edge now, so the part of the
picture a title has to stay legible against is the bottom and the top two-fifths
are left at full strength. It replaced the covers' flat `bg-black/40` and the
tiles' full-card `from-black/85 … to-black/25` on 2026-10-06.

Only cards with something behind them get one: on a plain `bg-card` surface it
would be card colour over card colour, and inside a dashed placeholder it would
read as a fill the card is not meant to have.

**Every card on both views now carries a photograph, and `.board-mesh` has no
caller.** Daily was the last bare one — it painted the mesh until 2026-10-07 on
the stated grounds that the mode does not exist and a mesh says so where a
picture would not. What it wears instead was asked for and is **the
date-guessing game's own common-era backdrop**
(`timelineBackdropUrl("ce")` / `timelineBackdropSrcSet("ce")`, resolved in
`app/(public)/page.tsx` and passed down as `dailyCover`): art the site already
has rather than a new upload, like everything on the explorer's stage, and a
plate from the game Daily is played over. Its derived widths are the backdrops'
1440/2560 rather than the covers' 800/1600, which the card's existing `sizes`
hint handles — half the board is 546px at the cap, so 1440 is what a 2x screen
picks. The "soon" chip is still the whole of what says the mode is not ready.

The mesh rule stays in `app/globals.css` and the `CoverCard` branch that paints
it stays too: it is where a third cover added without art would land. It is the
bento hero's geometry with every stop darkened by about a third — there it is
glimpsed under a photograph, here it would be the whole card next to a real
one, and at the bento's values it was the brightest thing on a page whose
background is pure black.

**The comparison cover photographs are now unused.** `GAME_COVER_BASE_NAMES`
still holds both pairs and both are still in the bucket; only `guess` is read,
because comparison is a tile with its own single photograph now.

**Every photographed card on the board** goes through `BoardCard`'s `photo`
prop and `boardPhotoUrl()`, which is the one map from card to object key. The
games view's three named cards came first on 2026-10-05; survival and the whole
of the play row followed on 2026-10-06 — 1v1 (`flag-1`), comparison
(`arka-2`), other games (`arka-3`) and survival (`arka-4`), and inventions and
"born when?" in the same pass. Five things about them:

- **One file each and no srcset.** These cards are a third of the board and
  under — 359 CSS px at the cap, ~155 on a phone — so one width covers every
  device and a second would mostly ship bytes no browser would pick. This is
  the one place the "derive two widths" rule does not apply, and it is a
  consequence of the card's size, not an oversight. The two *cover* cards are
  half the board and do carry a pair.
- **Two shapes, and the grids choose which.** A games-view card is a quarter of
  the board both ways, so it is square at every width and its photo is square
  in the *file* at 512px — `object-cover` is left nothing to crop, which is
  what lets each crop be a judgement about its own picture. The football master
  is a 736x1308 phone shot whose centred crop clips the ball and the boots. A
  play-view tile is **not one shape** — 359x265 above `md`, square under it,
  and full-width in the two-column row for the odd third tile — so no file can
  be pre-cropped for it: those stay 16/9 at 800px and let `object-cover` take
  the sides off. That is safe only because all three are centred compositions,
  which is a property to check before swapping one. 800 still covers the widest
  case with room to spare: at 359 CSS px the cover scale puts ~700 source pixels
  behind the visible box, and it covered the 400px tile these were cut for.
- **`arka-3` is 300x200 as uploaded**, which is already smaller than the card
  it fills, so `other-games-card.jpg` is a copy rather than a derivative —
  resampling could only add pixels that are not in the picture. It is soft on a
  2x screen and softer still in the full-width mobile row. Re-cut it from a
  larger master if that starts to show.
- **A photograph does not mean a mode exists.** The unbuilt ones are still
  `aria-disabled` with their "soon" chip, exactly like the Daily cover, and
  keep `opacity-80` rather than the bare card's `opacity-60`, which muted the
  photographs to grey rectangles. What a photo changes is the chrome: icon
  chip, "soon" chip, **the arrow** and both lines of text switch to the
  white-on-glass treatment, over a **bottom-weighted** scrim rather than the
  flat wash a `CoverCard` uses — this card's title is anchored to its lower
  edge rather than floating in the middle. The arrow only needed a
  photographed colour once 1v1 and comparison got pictures: before that only
  `soon` cards carried one, and they show the chip in the arrow's place.
- **The URLs are resolved on the server** in `app/(public)/page.tsx` and passed
  down as one `photos` record, like the date-guessing cover: strings cross into
  the client component instead of the whole of `lib/storage/images`.

**`--board-w` sets the whole board's scale, and widening it is never free.**
Every card is a quarter of it less the gaps, so the board's height grows by half
again whatever the width grows by.

It is **69.3rem** since 2026-10-06 — 77rem less a tenth, asked for so the cards
would take up a tenth less room across and, through `CARD_HEIGHT`, the same
share less down the page. 1108.8px, so the board, the explorer, the bento and
the FAQ are all exactly that wide. Under the cap they already agreed (`100vw -
3rem` each); above it they agree because **the column below the fold is now
capped at `calc(var(--board-w) + 3rem)`** rather than at `max-w-7xl`. 77rem was
`max-w-7xl` (80rem) less that `px-6`, which made the two agree by arithmetic;
reading the token makes them agree by construction, and the board can be
rescaled again from one line. Change that column and change this.

Two things move when it does:

- *Height.* The hero centres on the first screen at 681px of content against
  844px of viewport (1232px of board gave 743px, 1024px gave 659px). It was
  801px for part of 2026-10-05, when the board was 1308px wide — 43px of slack,
  and the cards crowded the screen.
- *The cover cards' `sizes`.* `CoverCard` spans half the board, so its hint says
  `546px` above a 1160px viewport — the cap engages at `--board-w` plus the
  column's `px-6`, ~1157px. Both that number and the breakpoint are derived from
  this token, not chosen, and so is the explorer stage's `631px` (what is left
  of the column after the card's padding, the stepper rail and the 21rem pill
  column).

## Below the fold: the explorer, the bento, the FAQ, the contact block

Four blocks, in that order, each in
`mx-auto max-w-[calc(var(--board-w)+3rem)] px-6` and each wrapped in its own
`ScrollReveal`. The column *is* `--board-w` plus the padding it carries, so all
four line up with the cards on the first screen and keep lining up when the
board is rescaled. They were `max-w-7xl` until 2026-10-06, which agreed with the
then-77rem board by arithmetic rather than by construction.

The FAQ's wrapper is `pt-40` where the bento above it has `pt-32`: it is plain
text on the page rather than a block of cards, so it has no edge of its own to
hold it off the bento. The contact block below it is back to `pt-32` for the
mirror of that reason — the FAQ ends on a hairline, which already reads as a
boundary. **Whichever block is last carries the page's `pb-32`**; it moved from
the FAQ's wrapper to the contact block's when that was added.

**Each run of empty space belongs to the wrapper, never to the revealed
element.** `ScrollReveal` observes its own box, so padding *inside* it trips the
animation while nothing but blank space is on screen. That is why the spacing
lives on the capped divs rather than inside the four blocks.

## The contact block

`components/contact-section.tsx` is the last thing on the home page. It was the
destination of the menu's Contact row until 2026-10-07; that row goes to
`/contact` now, and this block **stays** rather than being replaced by a link —
it is what a reader who has scrolled the whole page arrives at, the address
offered without having been asked for. It keeps `id="contact"`, so `/#contact`
is still a live anchor for anything that links it. It is a Server Component with
no state; the arrival on scroll belongs to its `ScrollReveal` wrapper like every
block above it.

**The address and the `{email}` substitution both moved out of this file.**
`CONTACT_EMAIL` is in `lib/contact.ts` beside the page's own paths, and
`components/contact-email.tsx` is the one implementation of dropping the
`mailto:` into the slot, because two blocks print it now. It is still one
constant and still deliberately not in the dictionary — an address is not a
translation.

**The composition is transcribed from the supplied Apple reference**: a hairline
across the top of each column, a long drop of empty space, then one large line
of tinted type with its explanation under it. What carries the design is the
**pair of rules** — two short bright-to-dark gradients side by side, which is
what tells the eye there are two columns before it has read a word. They are the
whole of the structure: no card, no border, no fill, which is also what lets
this sit directly under the FAQ's plain text rather than reading as a third grid
of tiles. A rule belongs to a column, so a column that wraps on a phone takes
its rule with it and the treatment survives at every width.

**The colour is amber, not the reference's blue**, which was asked for, and the
value is the one the site already has: `#f5a623`, the bento library card's sun.
Both ramps live in `app/globals.css` beside the bento's sweeps —
`.contact-rule` and `.contact-sweep` — and both were **sampled off the
reference** rather than eyeballed, which is why the stops sit where they do (the
rule's midpoint is a third of the way along, not halfway). The *luminance* curve
is the reference's with amber in place of its steel blue. `.contact-sweep` stops
short of the dark end for the same reason the bento's text sweeps do: the page
is pure black, so a glyph reaching `#6b4716` would sit near 2:1 and the last
word of a headline would disappear.

**Each column's headline is a row with one piece of artwork beside it** — the
site's own `SiteMark` on the left, the mail icon on the right — and *beside*,
never above. Above the line the icon pushed "Contact Us" 44px below "Tempus"
opposite, which made the pair of rules look like two unrelated blocks. Both are
*siblings* of the swept text rather than children, because `background-clip:
text` with a transparent colour applies to the whole element and a mask or an
icon inside would be clipped to glyphs it does not have.

Four things about that row, all settled on 2026-10-07 and all asked for:

- **The mark is the masthead's component, not a copy**, and it is painted flat
  `text-ink` — exactly what it wears in the top-left corner of the site. A
  gradient tile beside the word read as two different whites up there and the
  reason holds here, even though the word beside it is amber.
- **The headline is ~30% smaller** (`clamp(22px,3.2vw,36px)`, down from
  32/4.6vw/52): it was the largest type on the page and sat louder than the FAQ
  above it.
- **The font size lives on the row**, which is what lets both pieces of artwork
  be sized in `em` — mark `1.1em`, envelope `1.15em`, since line art reads
  smaller than a solid tile at one size — and track the headline through the
  whole `clamp()` range. The same arrangement as the home masthead.
- **`min-h-[1.2em]` on the row is what pins the two baselines.** The row is as
  tall as its tallest item and the two columns' items differ by a pixel, which
  centred each column's text in a different box. A floor taller than both takes
  the icons out of that sum. Measured after: both headlines at the same `top`,
  to four decimal places.

**The address is part of the paragraph, not a heading.** It sat between
"Contact Us" and the explanation at `text-xl font-semibold` until 2026-10-07,
which read as a second heading under the first; it is now a `mailto:` inside
the sentence that tells you what to write. `contactBlurb` names a `{email}`
slot and `withEmail()` splits on it, so each language decides where in its own
sentence the address falls — `split` rather than an index, so a translation
that drops the slot renders as plain prose instead of throwing. The address
itself is still one constant in that file and deliberately **not** in the
dictionary: an address is not a translation, and five copies would be five
places to update. It is a placeholder — see gap 9. **There is exactly one
headline per column and nothing else in this section is a heading.**

## The contact page is one page with two doors

`/contact` is where **both** the menu's Contact row and its Buy-me-a-coffee row
land. The two errands are the same errand — reaching the person who builds this
— so they share a document rather than taking a route each, and what the door
decides is only the **order**: whichever section you came for is the first thing
on the page, the other is one scroll below it.

**It is a scaffold on purpose.** The structure — two sections, the order, the
jump pair, which heading is the `h1` — is settled; what fills them is not, and
the concept for it is still to come. The tip jar has nothing to link to yet (no
payment route, no domain — gap 1), so it carries the site's dashed "named, not
built" note where the way to send one will go, exactly like the leaderboard's
sample standings.

**The order is a validated search parameter, not a second route.**
`lib/contact.ts` holds `CONTACT_VIEWS` (`contact` | `support`), `contactHref()`
for the two menu rows and `contactView()`, which narrows whatever the query
string actually held. One route means one page, one metadata block and one
canonical URL; the order is presentation rather than identity. An unknown or
repeated parameter falls back to `contact` — same discipline as `safeNextPath`
beside it, and nothing a visitor can type produces a view that was never
designed. The module carries no imports and no `server-only` marker because
three things read it: the page, its `generateMetadata`, and `SiteMenu`, which is
a Client Component.

**Reordering, not a hash jump.** A `/contact#support` would leave the section
you did not ask for sitting above the one you did and arrive mid-page with no
heading over it. Dealing the sections in arrival order means the page always
starts at its own top with the thing that was pressed.

**The arriving section carries the `h1`**, the other an `h2`. The two sections
are the same composition, so which one is the document's heading follows from
which one leads — the outline then says what the page is *for this visitor*
rather than permanently naming one of its halves. `generateMetadata` reads the
same parameter for the same reason, so a tab opened from the tip jar row says
so.

**The jump pair links to anchors, never to the two views.** Both sections are on
the page and the one you did not arrive for is below the fold, so the page names
what it holds before the first headline. Pressing a link that re-ordered the
page under the pointer would read as a navigation that went nowhere; the leading
chip is marked `aria-current` and stays a link, which is the way back to the top
after a scroll.

**The layout is its own, and what it shares with the home page's block is the
family resemblance rather than the composition.** There, two columns are two
different things side by side (the product, and the way to reach it). Here each
section is one errand split into a headline column and an answer column, and the
two sections stack. Both use `.contact-rule` across the top of a column and the
`.contact-sweep` headline — the page's type is a step up (26/3.6vw/42 against
22/3.2vw/36) because the first of these *is* the page's heading with no `h1`
above it to sit under. The amber stays the one chroma: `SiteMark` flat in
`text-ink` beside the swept word, as in the masthead, and the tip jar's cup in
`#f5a623` at `1.15em` against the mark's `1.1em`, since line art reads smaller
than a solid tile at one size.

Both pieces of artwork are **siblings** of the swept text, never children:
`background-clip: text` with a transparent colour applies to the whole element,
so an icon inside one is clipped to glyphs it does not have. Same trap as the
home block.

Three new dictionary keys, in all five languages: `supportTitle` (which replaced
`menuCoffee`, since the row is now named from its destination), `supportLead`
and `supportSoon`, plus `contactNavLabel` for the jump pair. `contactTitle`,
`contactLead` and `contactBlurb` are shared with the home block rather than
copied.

## The explorer is six pills and one stage

`components/home-explorer.tsx` is the first block below the fold. It replaced
`components/about-card.tsx` on 2026-10-06 — two paragraphs of prose about what
Tempus is, now deleted along with `aboutBlurb` and `aboutHow` — with the same
content said six times, one item at a time: the two games that exist, the two
that are named but not built, the badges, and the library the rounds are drawn
from. The modes it names are the board's own, so the first screen is the grid of
names and this is that list explained.

**It has no heading.** A `Tempus` title and a line of blurb sat above the row
until 2026-10-06; both were removed on request and nothing replaced them, and
`explorerBlurb` was deleted from all five dictionaries. The header row survives
because the close button still needs a corner to sit in — it keeps
`justify-end` rather than collapsing to nothing, so the button lands where it
always did. The ~36px it reserves while the list is shut is the cost of the
button having a frame to fade in on; it is not slack to tighten.

**Nothing in it navigates.** It is a showcase and the pills only describe. There
were Play buttons on the two built games and a link to `/achievements` for an
afternoon; they were removed on request, and the reasoning holds independently —
the board on the first screen is where a game is started, and a second set of
doors one scroll below it is two entrances to one room. Removing them is also
what made the panels short enough for the column below. `explorerSeeAll` went
with them.

**It opens closed, and the closed state is the point.** With nothing open the
pills are collapsed, neither the stepper nor the close is on screen, and the
stage turns a 3D coin. Opening a pill brings both controls and crossfades the
coin out for that item's artwork; the close brings it back. This is the pattern
it was drawn from (Apple's spec explorer) and it is the third shape this block
has had — "one item always open, no close" until an idle state existed to fill
the stage, then the Colosseum loop that filled it, then this.

**The idle stage has no frame, and that is the one place the stage box is not a
card.** The box's border and its `bg-page` plate are painted only while one of
the six panels is open: a sheet of pure black inside a `bg-card` section is the
mount a photograph hangs in, and it is exactly wrong behind an object that is
supposed to be sitting on nothing. Both fade over `FADE_MS` with the panel they
belong to rather than switching, or a frame snaps in ahead of the artwork it
frames. The coin's own layer is still opaque, because the crossfade needs every
layer to be — but opaque in `bg-card` rather than `bg-page`, which is what lets
it cover the panel it is replacing while reading as no plate at all.

Seven things hold it up.

**The stage's height is the pill column's**, fixed at `md:h-[39rem]`, so opening
a different item cannot resize the block. The column is centred in that box and
clipped, so the height has to clear the worst case *in every language*: five
closed pills at 60px plus the achievements panel, which is the only one carrying
a swatch row under its body. Re-measured in all five locales after the pills
were enlarged on 2026-10-06 — en 568, tr 568, es 568, de 592, fr 592 — so 624 is
the worst case plus 32px. **Lengthen a body, enlarge the type or narrow the
column and re-measure this** — the failure is silent, a line of text clipped off
the top and bottom of the list.

The pills grew on request in that pass: 21rem of column rather than 19, a 16px
label and a 15px body (from 14 and 13), 30px icon chips and `px-5 py-3.5` of
padding, which makes a closed pill 60px tall rather than 52. The stage is 631px
at the cap as a consequence, which is what `STAGE_SIZES` says — that number is
derived from the column rather than chosen, so it moves whenever the column
does.

**A pill's radius is half its closed height, so a closed pill is a stadium**,
and it is one number rather than a pair because the pattern this is drawn from
holds its radius constant — the same corner reads as a stadium at 60px and as a
generously rounded panel once the body is open. It was 22px until 2026-10-06,
which rounded neither shape enough; it is 30px now, measured off the reference
(a constant 28px there, against a 56px pill). Change the padding or the type
size and this has to follow, or the closed shape stops being a stadium and
becomes a rounded rectangle that is nearly one.

**The hover is a brighter fill, and it used to be a dimmer one.** `hover:opacity-80`
dimmed the whole pill, text included, which reads as a control going away under
the pointer; one step up the palette — `card-raised` to `hairline`, the same
proportional step the reference makes from #191919 to #202022 — reads as it
coming forward. It is on the **button**, not the shell: the shell's transition
is the opening, whose duration is `FADE_MS`, and a fill that took most of a
second to arrive would not read as an answer to the pointer. A closed pill's
body is zero-height, so the button is the whole of what you see, and the shell
clips it to the stadium. **There is deliberately no scale** — the reference's
pill is identical to the pixel across a hover, measured — and the hover is off
while the pill is open, where the thing under the pointer is a 300px panel
rather than a control.

**The opening is 780ms**, up from 520 on request. One constant drives the
shell's width, the body's height, every fade and the stage's crossfade, which is
what makes an opening read as a single gesture; splitting it per element is what
makes it read as three things happening at once.

**The body is laid out at the open width the whole time, and that is a second
measurement, not the closed one.** A paragraph inside a box whose width is
animating re-wraps on every frame of it: the text arrives on one line, drops a
word to the next, then another — which reads as the panel correcting itself
rather than opening. The body carries an explicit pixel width (the row's, less
the shell's two borders), so the line breaks are decided once and the growing
shell merely uncovers them. It steadies the height animation too, whose `1fr`
target was moving mid-transition for the same reason. Verified by the text's own
geometry rather than by eye: the paragraph measures 290x120 with the pill shut
and 290x120 with it open, so nothing about its line breaking depends on the
shell.

**The stepper is a column of the grid, not something floated over the card's
padding.** It sits to the left of the pills, as in the source pattern, and the
pills must not shift sideways when it appears — which they would if it were
absolutely placed, since the card's 32px of padding cannot hold a 36px control.
It is `hidden` under `md`, where the whole list is one thumb-reach away and a
stepper is chrome. The close is at the top right of the header row, where the
stepper itself lived for an afternoon.

All three of those controls are one `RoundButton` with a `shown` prop: they fade
and scale rather than unmounting, because an element that unmounts has no frame
to leave on, and they carry `inert` while hidden — verified that the closed
state's tab order is exactly the six pills and nothing else.

**A pill's closed width is measured, not guessed.** A pill hugs its label closed
and fills the column open, and `width` interpolates between a length and a
percentage but *not* out of `fit-content` — so the shape cannot animate on its
own. A hidden twin of the closed pill sits behind each row (same shell, same
padding, `w-max`) and is measured instead. Two traps, both of which were bugs:
`offsetWidth` rounds a fractional width *down*, which leaves the label a
hundredth of a pixel short and `truncate` answers that by eating four
characters — so it is `Math.ceil(getBoundingClientRect().width) + 1`. And the
twin is watched with a `ResizeObserver` rather than measured once:
`document.fonts.ready` resolves against whatever is pending at the moment it is
read, so on a warm cache it had already resolved and every pill kept the
fallback face's width, ellipsis and all.

**The stage crossfades the way the game's backdrop does** — the layer being left
held at full opacity underneath, only the incoming one animating — and **every
layer is opaque**. Two of the seven panels are not full-bleed pictures, and
without an opaque layer the badge sat on top of the photograph the stage was
leaving. Six of them are opaque in `bg-page`; **the coin's is `bg-card`**, which
is the same guarantee in the colour that makes the idle stage read as no plate
at all. The coin is a layer like any other (`StageId` is `ItemId | "idle"`),
which is what makes closing the panel the same crossfade as switching between
two of them rather than a second code path.

**The outgoing layer has to be released once the dissolve is over**, and not
releasing it was a bug until 2026-10-07. `leaving` pins a layer at opacity 1
underneath the one arriving, which is the whole point — but it used to stay set
until the stage next changed, so any layer you came *back* to was still sitting
at 1 and simply took the z-index. There was nothing left to fade. Closing a
panel was the loud case, because the coin reappeared in one frame, and going
back to a pill you had just looked at was the same cut. A timer clears it after
`FADE_MS`, which drops it to 0 underneath a layer that is opaque by then, so
nothing is visible on the way down and it is ready to fade in next time.
**Verified both directions**: with a panel open the idle layer's opacity target
is 0 and the panel's is 1; closed, the reverse.

**The body of a closed pill is `inert`.** It is collapsed by a grid row
(`0fr`/`1fr`), which is what makes the height animate, so the achievements
swatches inside one would otherwise stay tabbable behind a pill that reads as
shut.

**Reduced motion needs `!important` here**, which is the one place on the site
that does. Every duration is set inline from `FADE_MS`, so a media query cannot
outrank it; `.explorer-motion` marks those elements and the rule in
`app/globals.css` cuts them to 1ms. The two arrivals that *are* keyframes —
`.explorer-tile-in`, `.explorer-badge-in` — are applied by a class toggled on
`active`, because an animation that has already finished does not replay merely
because its element became visible again.

Three notes on the panels themselves:

- **The achievements panel's swatches are metal**, and that is the second
  deliberate chroma on an otherwise neutral page (the bento's amber sun is the
  first). A grey circle for gold would not be restraint, it would be wrong: the
  artwork it stands for is gold. `BadgeFrame`'s avatar diameter is **solved from
  the stage's box** with a `ResizeObserver`, never scaled — `transform: scale()`
  leaves the layout box at full size, so a badge shrunk for a phone would still
  reserve a 347x314 hole and push its own caption off the plate.
- **The subject panel is a triptych filling the stage**, not three squares
  floating in it. Three squares across a 5:4 stage can only be a third of its
  width, which left them 196px tall in a 544px box and reading as thumbnails
  that had failed to load. All three pictures are centred compositions, so a
  tall crop is safe; under `sm` the three become rows rather than columns.
- **The library panel's event count is read from the database**, and it is the
  site's own count — published *and* illustrated — so it can never claim more
  than the games can deal. It is the home page's only query and is wrapped in a
  `try`: the page rendered with no connection at all before this, and a front
  page that 500s over a statistic is the worse trade. A failed read prints a
  dash.
- **The idle stage is the coin**, and it is the one thing on this block with a
  section of its own — see "The explorer's coin" below.

  **Chrome starves a background tab**, which is worth knowing before debugging
  either the coin or the video it replaced. `IntersectionObserver` callbacks and
  `requestAnimationFrame` are both delivered on the rendering steps, and a
  hidden tab has none: an automated check driving a tab it never brings to the
  front sees the coin's loader never fire at all — no module requests, no
  canvas, no error — which looks exactly like a broken component and is not one.
  The same tab showed the old `<video>` as `readyState` 0 with `networkState`
  LOADING. Verify the bytes over the S3 API or the dev proxy instead, and take a
  screenshot first if the page itself has to be driven: that is what brings the
  tab forward.

**The artwork is all art the site already had**, assembled by `explorerArt()`
rather than uploaded: the two game covers (the comparison pair had gone unused
when that card lost its photograph), four board photographs, and
`homepage/pattern.jpg` behind the library statistics — the textile repeat the
prose card used, which is what lets it be cropped hard at any width since there
is no subject in it to clip. It is served at 800/1600 (`aboutArtUrl`), not the
backdrops' 1440/2560, and those widths were derived with
`npm run backdrops:derive -- --key homepage/pattern.jpg --widths 800,1600` —
**`--widths`** exists for art that is not full-bleed; without it the script uses
`BACKDROP_WIDTHS`, which stays the one list a *backdrop's* widths are written in.

**The `videos/` prefix is now dead weight that is deliberately kept.** It holds
the Colosseum loop the coin replaced on 2026-10-07 — the uploaded master
(`videos/collesium-video.mp4`, 1920x1080 at 60fps, 11.2MB), the derived
`collesium-video-720.mp4` that was actually served, and a poster frame. Nothing
reads any of them. The objects stay in the bucket, and `videos/` plus `mp4` stay
in the dev proxy's allowlists, so putting the film back anywhere is a component
rather than an upload. The `Range` support it needed stays with them and costs
the images nothing — `getObject()` takes a `range` and returns `contentRange`,
and the route answers 206 when it is set.

The third new object is `homepage/survival-stage-1600.jpg`. Survival is the only
board photograph the explorer shows full-bleed, and `survival-card.jpg` is 512px
square for a card 265px wide — across a 690px stage that is upscaled on every
screen and twice over on a retina one. It is the same master
(`homepage/arka-4.png`, 4800x2700) cropped square the same way and resampled to
1600 rather than 512. The three subject photographs need no such copy: a panel is
a third of the stage, where 512 is still better than 2x.

**The FAQ is a section, not a route**, and it is where the menu's FAQ row goes
(`/#faq`, from anywhere on the site). Six answers of two sentences are shorter
than the chrome of a page with a header and a way back. The questions are
numbered keys (`faqQ1`…`faqA6`) rather than an array, because `Dict` derives
from the English dictionary and that is what makes a missing translation a type
error. Landing on `/#faq` directly needs no second code path: the hash jump
scrolls the section into view and the observer fires on arrival.

**It is a column of native `<details>`, and that is not the same trade-off a
scripted accordion would be.** It was a two-column grid of `dl` cards until
2026-10-06, on the stated grounds that collapsing the answers would make this
the one block on the page that needs JavaScript to read. That holds for an
accordion built from state and a click handler, and not for the element: the
browser ships the open/close, every answer is in the document either way, and
the section is still a server component. So the old note was right about the
cost and wrong about where it comes from.

The style it replaced the cards with is plain text, as asked: a hairline between
items and nothing else, numbered `01`…`06` at the left so the answer has
something to indent against, and a plus that turns into a minus at the right.
Rules run the full column — the page has one left edge — but an **answer** is
capped at `70ch`, because a paragraph measured across 1100px is one nobody
finishes. `list-none` alone does not remove Safari's disclosure triangle; it
needs `::-webkit-details-marker` too. The open state has no animatable height
without measuring one in JavaScript, so what animates is the paragraph's
arrival (`faq-answer-in` in `app/globals.css`), not the row's height.

## The explorer's coin

`components/explorer-coin.tsx` is what the explorer's stage shows while nothing
is open: a photogrammetry scan of a Macedonian tetradrachm, turning slowly on
its vertical axis, grabbable, and sitting on nothing. It replaced the Colosseum
video loop on 2026-10-07. The film was 2.2MB of aerial footage that said
"antiquity" the way a stock plate does; a coin you can pick up and turn over is
the same claim made with an object the game is actually about.

**Nothing is drawn behind it.** The canvas is transparent (`alpha: true`,
`setClearAlpha(0)`) and the stage drops its frame for this layer, so the
explorer card's own surface is the whole of what is under the coin. A backdrop
would make this a scene rather than an object.

**The asset needs three decoders and ships with all of them.**
`3d-models/tetradrachme_uit_macedonia-v1.glb` declares
`EXT_meshopt_compression`, `KHR_mesh_quantization` and `EXT_texture_webp` in
`extensionsRequired` — literally required, so a loader missing any one of them
throws rather than degrading. Quantization and WebP are native to `GLTFLoader`;
Meshopt is not, and `setMeshoptDecoder(MeshoptDecoder)` is the whole of wiring
it up. Without it the load fails with "Unsupported extension" and the stage
stays empty, which looks exactly like a missing object — so the failure is
`console.warn`ed rather than swallowed, because the three ways this breaks (the
key missing from the dev proxy's allowlist, r2.dev unreachable, a decoder not
wired up) are indistinguishable from the outside.

**`three` is a dynamic `import()`, and two things can trigger it.** 1.4MB of
library plus a 3.9MB model is far more than the front page should spend
*during* its own load — on the critical path that is paid for in Largest
Contentful Paint and in the main-thread time the page needs to become
interactive — so none of it is fetched while the page is loading. What starts
it is whichever comes first: the block coming near the viewport
(`IntersectionObserver`, `rootMargin: 200px`), or the browser going idle once
`load` has fired.

That second trigger arrived on 2026-10-07 and is the fix for "the coin is late
to its own entrance". On the observer alone the 3.9MB download *began* when the
reader scrolled to the stage, so the stage was empty for as long as the model
took — the gating bought a clean page load and spent it on a visible wait.
`requestIdleCallback` with a `PREFETCH_IDLE_TIMEOUT_MS` (2s) ceiling is what
keeps both: the fetch is still off the critical path, and it is usually decoded
and drawn before anybody gets there. The timeout is not optional — "idle" never
arrives on a busy thread, and waiting for it forever puts the lateness back.
A plain `PREFETCH_FALLBACK_MS` timer covers browsers without the callback.

**And the stage is never empty while it waits.** A cold cache on a slow
connection is exactly what the idle gap cannot fix, so the coin's layer carries
`.pending-ring` — the menu button's own arc, not a second spinner — centred,
armed only once the download has actually started, and faded out as the coin
fades in. `--ring-inset: 0` is the one difference from the menu's: that ring
hangs off the button it belongs to and this one owns its box.

The `near` latch is **one-way**: scrolling past pauses the render loop but never
tears the WebGL context down, because rebuilding one re-compiles everything and
the pause is what actually saves the work.

**The model arrives off-centre and pre-rotated, and is measured rather than
positioned by hand.** Its one node carries a translation, a 13.51x scale and a
quaternion that lands the disc's face on world +Z — which is already the
camera's axis, so **the GLB's own orientation is the frontal view** and nothing
corrects it. Only the offset is undone, by subtracting the scene's own
bounding-box centre, so the pivot it hangs in turns about the coin rather than
swinging it.

**The fit radius is the disc's own, and `Box3.getBoundingSphere()` is the trap.**
That method circumscribes the *box*, so for a disc it returns half the box
diagonal — about 1.41x the coin's actual radius — and the coin comes out roughly
a third smaller than whatever fill is asked for. It is
`Math.max(size.x, size.y) / 2` instead: a disc spinning about Y never presents
more than its diameter in either axis, the vertical extent being constant and
the horizontal one only shrinking towards the rim, so that is the true worst
case and the fit still holds at every angle. The coin never grows, never clips
and never appears to breathe as it turns. Refitted by a `ResizeObserver`, since
the stage is fluid under `md`.

**Size is stated as a fill, not as a margin**, because the fraction of the stage
the coin takes up is the thing anyone retuning it is actually looking at.
`STAGE_FILL` is **0.73**, which is two rounds of "bigger" on 2026-10-07 — 0.58
as first drawn, a fifth up once the card around it was gone and there was no
frame left to crowd, then 5% again.

**It hangs from its bottom edge, not from its centre.** `BOTTOM_ANCHOR` (0.164
of the stage's height) is where the coin's floor sits, and the camera distance
is what adapts around it. Centring means a bigger coin grows down as well as up,
and down is where the composition has least room — the pills beside it end well
short of the stage's floor, so growth downwards reads as the coin sinking rather
than as the coin getting larger. The value is the gap the centred composition
had at the fill *before* the last 5%, so that increase moved the top edge and
left the bottom where it was. `NUDGE_LEFT` (0.11 radii) is the matching
horizontal placement, asked for in the same pass.

Both are applied by moving the **coin**, not the camera, so the view stays
square to it and the spin picks up no skew. Note the two different trigonometric
functions: the fit distance uses `sin` (a sphere's tangency, which is what
guarantees the no-clipping property above) while the anchor measures the frame
with `tan`, which is where a flat edge actually lands.

**Lighting only, no environment map.** The material is `metalness: 0` with
`KHR_materials_specular` setting its specular colour to black, so image-based
lighting has literally nothing to contribute and a `RoomEnvironment` would be
pure cost. A hemisphere and two directional lights give the relief its form; the
albedo is baked into the scan's texture. The fill light is not decoration — the
coin is double-sided and spends half of every turn with its back to the key, and
without it the far face passes through as a silhouette.

**Releasing it returns it to frontal; it never stays where it was left.** Five
modes — `spin`, `drag`, `fling`, `hold`, `recentre`. `spin` advances yaw at
`SPIN_RATE` (0.26 rad/s, one turn in ~24s). `recentre` eases yaw and pitch to
zero by exponential smoothing with a half-life rather than a fixed-duration
tween, because the release can happen at any rotation and there is no distance
to divide a duration by; yaw is wrapped into `(-pi, pi]` on release so the way home
is the short way round however many times the coin has been spun. Reaching the
threshold snaps both to exactly zero before handing back to `spin`, so the
resumed rotation starts frontal rather than a thousandth of a radian short of
it.

**A flick is thrown, not just released**, as of 2026-10-07. The pointer's
recent horizontal travel is kept (`FLICK_WINDOW_MS`, ~90ms — a wider window
averages a flick back down into a drag) and a release above `FLICK_MIN` hands
that speed to the spin as `fling`, which then loses it to friction and lands in
the same `hold` -> `recentre` -> `spin` the slow release does. Four things about
it:

- **The friction is two terms, and both are load-bearing.** Viscous decay
  (`FLING_TAU`) is proportional to the speed, so on its own it only ever
  *approaches* zero: the coin would creep forever, `fling` would never hand
  over, and the dwell could never start. A constant dry term (`FLING_DRAG`)
  is what brings it to an actual stop, and it is what the last of the
  deceleration is made of, which is why the stop has no jolt in it.
- **The pair was simulated, not eyeballed**, and the numbers are the thing to
  retune: a hard flick runs ~5.2s and 4.7 turns, a middling one ~4.4s and 2.5
  turns, a gentle one ~3.1s and under a turn. `FLICK_MAX` (21 rad/s, ~3.3 turns
  a second) is both a legibility cap — past it the relief strobes against the
  refresh rate — and what bounds the whole spin, so nothing here can turn
  indefinitely. Verified framerate-independent at 30, 60 and 120fps: 3 frames
  of variation across the entire decay.
- **A tilt bleeds out as it spins** (`FLING_PITCH_TAU`). Pitch tilts the axis
  yaw turns about, so a fast spin left at the angle it was flicked at wobbles
  like a dropped coin rather than reading as a spinning one.
- **Three releases are deliberately not throws.** A pointer that came to rest
  while still held down (`FLICK_IDLE_MS`) is placing the coin at an angle to
  look at; a `pointercancel` is the browser taking the gesture (a vertical
  swipe becoming a scroll), not the reader letting go; and under
  `prefers-reduced-motion` the throw is skipped outright rather than shortened,
  since a coin turning on its own for five seconds is exactly the motion that
  setting exists to stop. A drag stays available in all three cases, and
  grabbing a spinning coin stops it dead.

**`hold` is the rung between the two, and it is not a polish detail.** The
return used to begin on the same frame as the release, which made the coin read
as sprung rather than handled — you let go and it was already leaving, so the
whole gesture felt refused. It now stays exactly where it was let go of for
`HOLD_MS` (one second, asked for on 2026-10-07) before the journey home starts.
The hold draws nothing at all: the coin is already where it belongs, so it costs
one comparison per frame and no render.

**`touch-action: pan-y`, not `none`.** The stage is a ~630px block in the middle
of a page people are scrolling through, and swallowing vertical drag to allow a
tilt nobody asked for would make the front page feel broken on a phone.
Horizontal drag — the axis the coin actually turns on — still reaches us;
vertical belongs to the document. Pitch is therefore mouse-only, which is the
right trade rather than a gap.

**It reads `prefers-reduced-motion` itself**, unlike everything else in the
explorer, because its motion is a render loop rather than a transition and
`.explorer-motion`'s `!important` cannot reach it. Under that setting the coin
stands still and stays grabbable: the perpetual turn is what the setting is for,
and a drag is the reader's own motion.

**The stop waits out the dissolve, and here that is not a nicety.** A WebGL
drawing buffer is cleared after compositing unless `preserveDrawingBuffer` is
set — which costs memory and a copy per frame — so a canvas that stops rendering
is not holding its last frame, it is holding an undefined one, and in practice
it goes blank. Stopping on the same tick the panel began fading in therefore
made the coin *vanish* rather than dissolve. It now draws until the layer above
it is opaque. The old `<video>` delayed its pause for the softer reason that the
film should still be moving while it fades; this one has to.

**It carries the photographs' arrival too** — resting at `scale(1.06)` while its
layer is off and settling to `scale(1)` as it arrives, over `FADE_MS * 2`,
which is exactly what `StagePhoto` does. A layer that only changes opacity reads
as a slideshow rather than as a dissolve, and matching the number is what makes
the coin feel like one of the seven panels instead of a hole cut in the stage.
`fadeMs` is a **prop**, not a second constant: the explorer owns `FADE_MS` and
the coin has to keep drawing for exactly as long as the stage takes.

**The render loop starts and stops with the layer**, and `start()` resets to
frontal. A 239k-triangle scan redrawn at 60fps behind an opaque panel, or below
the fold, is a tab that never goes quiet. The reset is invisible because the
layer is fading in from nothing, and it is what guarantees the coin is never
found where the last visitor left it. Frames where nothing moved are skipped
rather than re-rendered.

It is `aria-hidden` and out of the tab order, exactly like the loop it replaced.
Turning it reveals nothing a reader is missing, so it is decoration that answers
the pointer rather than a control.

## Accounts

There are accounts as of 2026-10-06. Supabase Auth is the identity provider —
email/password and Google — and the one table of our own that an account owns is
`public.profile`, which holds **a username and nothing else**. Email, password
and provider all stay in `auth`, where they are Supabase's to keep.

`/signin` is the one door: sign in and sign up on one route, switched by a
segmented control inside `components/auth-form.tsx`. `/account` is the only page
behind it, and it is deliberately four things — the name, the address, the
password and the way out. There is no avatar upload, no notification settings
and no match history, because none of those exist to settle.

**Nothing on `/account` is editable until it is asked for**, as of 2026-10-07.
Each setting states what it currently is — the name as text, the password as
four dots — with one button beside it (`Change username`, `Change password`,
`Set a password`) that swaps the line for the form. Before that both forms sat
open with permanent Save buttons, which made the two destructive controls the
loudest things on the page and left a half-typed name indistinguishable from a
saved one. `Editor` in `components/account-panel.tsx` is the whole mechanism and
three things about it are load-bearing:

- **The fields are unmounted while it is shut**, not hidden. A hidden input is
  still submitted and still holds what was last typed into it, so an abandoned
  edit would be waiting on the next open — and a password field would sit filled
  with whatever the browser's manager had autofilled. Unmounting is also what
  makes `autoFocus` fire on every open rather than only the first.
- **It closes on the *submission finishing*, not on the saved state being
  true.** `useActionState` holds `saved` until the next submit, so an editor
  keyed on the value alone cannot be opened a second time; one keyed on the
  value *changing* closes on the first save and never again, because the second
  save sets the same object. The falling edge of `pending` — the third element
  `useActionState` returns — is the only thing that ticks once per submission.
- **Reopening clears the note.** Otherwise "Saved" sits under a form that has
  not been submitted yet.

**The password form has two shapes and the session picks which, on both
sides.** An account with an email identity is asked for its **current
password** — new on 2026-10-07; there was no such check before, and a borrowed
unlocked browser could lock its owner out. An account that signed in with Google
has no password to be asked for, so it is offered a first one instead, and
Supabase adds the email identity *beside* the Google one: both doors work
afterwards, which is why the control says "set" and not "switch".

`hasPasswordIdentity(user)` in `lib/auth/server.ts` is the single predicate.
It lives there rather than in `app/actions/auth.ts` because a `"use server"`
module may export nothing but async functions, and it is read **twice on
purpose**: the page reads it to decide the form's shape, and `updatePassword`
reads it again from the session to decide whether to *require* the field. A
browser that deleted the input would still be refused. The current password is
verified by signing in with it — Supabase keeps the hash and offers no "is this
the password" call — and a failed `signInWithPassword` leaves the existing
session untouched, while a successful one re-issues cookies for the same user,
which is a no-op from the page's side. Setting a *first* password
`revalidatePath`s the layout, because the email identity Supabase has just added
is what the next render has to see; a plain change alters nothing any page
reads.

The wrong current password is its own code, `current-password-wrong`
(`authErrCurrentPassword`), deliberately not `invalid-credentials` — that one
means "that email and password are not an account", which is a different
sentence to show somebody who is already signed in.

**Every auth write is a Server Action, never a browser call to Supabase.** The
session has to arrive as an HTTP cookie that Server Components can read on the
very next render; a client-side `signInWithPassword` leaves the server blind, so
the menu would still say "sign in" on the page you just signed in from.
`app/actions/auth.ts` is all of it, and `redirect()` is always called **outside**
the try/catch around a Supabase call — it works by throwing, so swallowing it
turns a successful sign-in into a silent no-op.

**Failures travel as codes, never as sentences.** Supabase's messages are
English only and the UI ships in five languages, so every failure maps to an
`AuthErrorCode` and the form looks the word up in the dictionary. The two forms
that can also *succeed* in place (rename, change password) return a `saved`
state rather than falling back to `idle` — otherwise a freshly loaded form and
a form that has just worked are the same object, and the page announces a save
it never made.

**The gate is stated once, in `lib/auth/paths.ts`, and enforced twice.**
`PROTECTED_PREFIXES` is `/account` and `/achievements` — prefixes, so a
sub-route added under either is gated by default. `middleware.ts` does the
redirecting, because the answer has to come *before* the page renders;
`requireAccount()` in each page is the actual boundary, since the matcher can be
narrowed by mistake and a page that calls it cannot render either way. The
middleware also sends a signed-in visitor *away* from `/signin`, which is how a
bookmark or a back-button press after signing in stops looking like being
signed out.

Everything else is public on purpose: both games, head-to-head, the home page
and the leaderboard. A leaderboard is something you read before deciding to
join, so gating it would be the one place where signing in is the price of
looking.

**`next` is validated, not trusted.** `safeNextPath()` refuses anything that is
not a path on this site — an absolute URL, a protocol-relative `//host`, or a
backslash — because a redirect target a visitor can set is an open redirect.
The menu's two gated rows link at `signInHref(...)` rather than straight at the
page they want, so the URL in the status bar is the truth before the click.

**The profile row is created by the database, not by the sign-up path.**
`handle_new_user()` is an AFTER INSERT trigger on `auth.users`, because there
are three ways in — email, Google, and whatever is added next — and a profile
created by one of them is a profile the others forget. A taken username does
**not** fail the sign-up: the trigger swallows the unique violation and leaves
the account unnamed, and the account page asks for one. That is why
`profile.username` is nullable.

**Usernames are normalised, so uniqueness is a plain index.**
`public.normalize_username()` folds to lower case and strips anything but
`[a-z0-9_]`, returning null when fewer than 3 characters survive.
`normalizeUsername()` in `lib/db/accounts.ts` is the TypeScript twin — like
`eraForYear`, both exist because the database enforces the rule and the form has
to be able to refuse a name before submitting. **Change one and change both.**
The column's CHECK re-applies the SQL one, so a row can never hold a name the
function would not produce.

**Google needs the provider switched on in the Supabase dashboard**, and that
is the one part of this that is not in the repo. `signInWithOAuth` never
contacts the provider — it only builds the authorize URL — so it cannot tell an
enabled provider from a missing one, and with Google off that URL answers 400
and would strand the player on a JSON error page on another origin.
`providerRefuses()` HEADs the URL first and turns a 4xx into this site's own
"Google sign-in is unavailable" in five languages. Anything that is not a 4xx is
let through, so a slow provider still reaches Google.

The callback is `app/auth/callback/route.ts` and must stay a **Route Handler**:
exchanging the `code` for a session *writes* cookies, which a Server Component
cannot do. It is excluded from the middleware matcher for the same reason — a
session check that ran before the exchange would run before there is a session.
Both the Google redirect and the emailed confirmation link land there. The
absolute URL it is reached at is built from the request's own `Host` rather than
an env var, for the same reason the versus invite is read from
`window.location`: there is no domain yet (gap 1), so a baked-in origin is wrong
on localhost, wrong on the LAN address a phone uses, and wrong again on a
preview deployment.

**A QA account exists.** `scripts/make-test-account.ts` creates or resets one
through the Admin API with `email_confirm: true`, so it is usable without a
mailbox; the credentials go to `.env.test.local` (gitignored) rather than being
printed. Delete the script and the user when they stop being useful.

## Badge progress is infrastructure, not an achievement system

`public.user_badge_progress` is one row per (player, badge): `progress`,
`target`, `unlocked_at` and a `details` jsonb. **It deliberately says nothing
about how progress is computed**, because the rules are not decided — the
criteria on `/achievements` are prose. When they land they fill these rows and
nothing here has to be rebuilt.

Two plain integers rather than a percentage, because every criterion written
down so far is a count of something and a percentage cannot be incremented.
`unlocked_at` is passed in rather than derived from `progress >= target`:
whether reaching the target is what *earns* a badge is exactly the kind of rule
this layer must not decide. `details` is the extension point — a streak, a best
score, which eras have had a Perfect — so the eventual rule does not become a
column per badge.

`public.badge` is six rows of reference data: slug, sort order,
`default_target`, `is_rank`. The targets are **transcribed** from the criteria
already written on the page (finish one set, 6/10, 8/10, 10/10, ten duels, a
Perfect in each of four eras), not invented. The artwork and the ring geometry
stay in `lib/badges.ts`, where they have to be anyway; the point of the table is
the foreign key, so a typo'd slug cannot create an orphan progress row.

`readBadgeProgress()` is two queries and a merge rather than a view — six rows
of reference data joined to at most six progress rows is cheaper in TypeScript
than a view is to keep in step with the hand-edited generated types. The merge
is what makes a badge with no row read as zeros instead of disappearing, which
is the normal case today. `writeBadgeProgress()` is written, typed and
**unused**: it is the seam the rules will be written against, and it is
service-role only, because a player who could update their own progress row
could award themselves a badge.

## Accounts are the first table written through RLS

This is a deliberate departure from "writes go through the service role", not an
oversight. That rule exists because content has no owner a policy could name,
and `event_date_challenge` had no identity to key on — so ownership had to be
re-checked in TypeScript. On `public.profile` `auth.uid()` *is* the owner, and a
policy saying `id = auth.uid()` is strictly stronger than an application check:
it holds even if a future Server Action forgets to make one.

The grant is **column-scoped** — `grant select, update (username) on
public.profile to authenticated` — so `id`, `created_at` and `updated_at` are
not the player's to set, which is a cheaper guarantee than a trigger that
checks for tampering. Badge progress has a SELECT policy and **no write policy
at all**.

Uniqueness is caught, not pre-checked: `setUsername()` lets the unique index
raise and maps PostgREST's `23505` to `USERNAME_TAKEN`. Two sign-ups racing for
the same name would both pass a `select` first and one would still fail on
insert, so the constraint's answer is the only one that is always right.

**Any new table in `public` still needs the same treatment** — revoke the
default grants, then hand back exactly what is needed — or it ships
world-writable.

## The badges page

`/achievements` is the six badges, where you are on them, and the rules each is
given out by. It **needs an account**: a badge belongs to somebody, and without
a player the progress bar has nothing to report.

It was a grid of six cards plus a preview bench until 2026-10-06;
`components/badge-gallery.tsx` and `components/badge-preview-lab.tsx` are both
deleted, and so are `achievementsBlurb`, the two ladder/special headings and
`badgesPickHint`. What replaced them is `components/badge-showcase.tsx`.

**It is a tab strip, transcribed from the supplied Apple reference**: a row of
plain text labels over one continuous hairline, a bright 2px indicator that
*slides* between them — travelling and resizing at once — and a panel below that
crossfades. Six things hold it up.

- **The indicator is measured, not computed.** Its offset and width come from
  the selected button's own box through a `ResizeObserver`, because the labels
  are six dictionary strings in five languages: a position derived from an index
  would be right in English and wrong in German, and wrong again for however
  long the webfont takes to land.
- **`left-0` on the indicator is not redundant.** An absolutely positioned child
  of a flex container takes its *static position* from the container's
  alignment, so under `justify-center` the bar started life in the middle of the
  row and every measured offset was added to that — it sat a clear 500px right
  of the tab it belonged to.
- **It is not rendered until it has been measured.** Mounting it at zero width
  does not work: `width` and `transform` are both transitioned, so the bar grew
  out of the left edge and slid into place on every first paint, and an
  `opacity` guard does not help because that transitions over the same 520ms.
- **It lives inside the scroller.** Six badge names do not fit across a phone,
  so the row scrolls sideways; an indicator positioned against the outer box
  would stay put while the labels slid under it.
- **Every panel is in the same grid cell** (`col-start-1 row-start-1`), which
  makes the block exactly as tall as its longest member in whatever language is
  on — no measuring, no clipping, and the tab strip never moves. The same
  arrangement the home board's two views use. The five hidden ones are `inert`;
  verified that the tab order is exactly the six badge tiles plus the one
  selected tab.
- **All of it is timed in CSS**, unlike the explorer, so
  `prefers-reduced-motion` can outrank it with an ordinary media query instead
  of needing `!important`. One duration (`--badge-ms`, 520ms) for the travel,
  the dissolve and the gradient handover; the bar's own fill is slower (900ms)
  because it is reporting a quantity rather than answering a press.

**The progress bar's track is tinted, and that is the one decision here that is
not cosmetic.** Nothing writes badge progress yet, so every bar reads 0% — and a
0%-wide fill has no gradient to show, which would make the bronze-to-silver
crossfade the bar exists for invisible on every account that exists. The track
carries the same ramp at low alpha so the theme is legible at any value.

**The gradient crossfades; it does not interpolate.** `background-image` is not
animatable, so switching badges would be a cut. Two stacked layers per surface
instead, outgoing held at full opacity underneath while the incoming one fades
in over it — the same rule the game's backdrop and the explorer's stage follow.
`rampTrackGradient()` mixes the alpha into the *stops* with `color-mix` rather
than setting `opacity`, because a translucent layer lets the one beneath show
through and two tracks at a fifth each composite to one at a third.

**Ruby and amethyst give nothing away.** They are the standalone feats and stay
unrevealed until earned: the artwork is taken to a silhouette
(`grayscale(1) brightness(0.17)`) with a "?" in the ring where the picture would
go, and the bar wears `MYSTERY_RAMP` — a warm grey falling to a cool one —
rather than their real red and violet. Not plain grey, which would read as
"disabled" rather than as "not yet". `rampFor()` is the one place that is
decided, so no part of the page can leak a colour the rest is hiding. **The
leaderboard does show them in full colour**, on the grounds that those players
have earned them; if the mystery should hold there too, that is one call to
`rampFor`.

**A locked rank is dimmed but still recognisably itself** — you are meant to see
what you are climbing towards — which is why only two of the six are blacked
out.

**Every badge is a ring, not a medal.** The artwork is an annulus with an
ornament hanging off it and a hole in the middle where a profile picture goes,
so the number that matters about each file is not its size but where its hole
is. `lib/badges.ts` holds that circle per badge, and nothing can be laid out
without it. Four things follow from how it was derived:

- **It was measured off the alpha channel, then checked by compositing the
  avatar into it** — not eyeballed. The ornaments are not symmetric about the
  hole (a gem hangs below it on four of the six), so the centre of the file is
  several per cent away from the centre of the ring, and centring the picture
  in the *file* leaves it visibly low.
- **The shipped files are the masters rescaled so every ring is the same 520px
  across.** That is what lets one avatar size dress all six: `BadgeFrame` takes
  one number — the picture's diameter — and the frame's box and the hole's
  offset are stored as multiples of it, so the wings, laurels and crystals size
  themselves around a picture that never changes. `holeContent` is the same
  geometry used for something other than a photograph, which is how the "?" of
  an unrevealed badge lands in the ring rather than in the middle of the file.
- **The four tier masters share one canvas and one ring position** (2096x1896,
  hole at 1057,888, d 907), which is how the artist registered them: bronze is
  a bare ring and diamond a full pair of wings, both drawn around the same
  circle. Ruby and amethyst have canvases of their own.
- **Re-exporting a master means re-measuring.** `data/*-badge.png` are the
  masters; `public/badges/*.webp` are the 520px-ring exports. WebP rather than
  PNG because the six PNGs were 2.2MB and are 384KB this way, and the site
  serves pictures through plain `<img>` everywhere — `next/image` is used
  nowhere.

**The compact grid is three across at every width, and both its numbers are
derived.** The ring diameter is the cell's width over the widest frame
(2.313 avatars, the four tiers), measured with a `ResizeObserver` because the
cell is a third of a fluid column — never `transform: scale()`, which leaves the
layout box at full size. Each tile's art box is `TALLEST_FRAME` tall whatever
that badge's frame is, which is what puts the six names on one line: a pair of
wings is 2.09 avatars tall and a laurel 1.69, so without it diamond's label sat
23px below ruby's in the same row. The grid is capped at `26rem` and centred
below `lg`, or a tablet gives each cell 240px and the rings come out *larger*
than on a desktop.

**The criteria live in the dictionary, in all five languages.** Four ranks on
one ladder — the best set of ten you have finished, which is a rule the game
already has (`lib/game/set.ts`: everything above the bottom tier is a hit,
`wayOff` is a miss) — and two standalone feats, ruby for head-to-head wins and amethyst for a
Perfect in each era. Retuning one is a string edit, not a component change.
`badgeBronzeRule` is the countable half pulled out of the sentence so the chip
beside the name reads at a glance.

**Amethyst's criterion got harder on 2026-10-07 and nobody has decided whether
it should have.** "A Perfect in every era" was written when `perfect` was a
2.5% band; it is the exact year now, which on the two log panes means hitting
one position on a rail that is three decades wide. Nothing computes badge
progress yet (gap 5), so this is a string to revisit when the rules land rather
than a bug — but it is the one criterion the scoring change moved.

The menu's Achievements row is still labelled from `t.achievementsTitle` while
the page's own heading is `t.badgesTitle` ("Badges"), which was asked for: the
row names the destination the way the rest of the menu does, and the heading
names the thing on it.

## The leaderboard is ten made-up players

`/leaderboard` is the shape, not the data. There are no saved scores (gap 5), so
nothing can be ranked; what is settled here is the column, the badge beside a
name and the two numbers, so that wiring a real query later is a query rather
than a design. It says so in a dashed note at the top.

The standings are **written out**, not generated. `Math.random()` here would be
a different board on the server and the client — which React reports as a
hydration error — and a different board on every reload, which reads as a bug
rather than as sample data.

`pr-12 sm:pr-0` on the list is clearance, not decoration. The menu button is
`fixed` on every route but home and the bar under it hides on a downward
scroll, so on a phone — where the button's track and this column are both
`100vw - 3rem` and end at the same pixel — the button scrolls over whichever
row's score is 28px down the viewport. Above `sm` the column is narrower than
the track and there is nothing to clear.

## The top bar draws nothing

`SiteHeader` has carried **no surface on any route** since 2026-10-07 — no
fill, no blur, no rule. It was a `border-b border-hairline/60 bg-page/70
backdrop-blur-xl` panel everywhere except `TRANSPARENT_ROUTES`, and those three
were the ones that read as clean: the rest wore a line across the top of every
page for no reason but to separate the wordmark from content that already had
its own margin. Every page now looks like `/versus` did — the `Tempus` wordmark
at the left, the menu button at the right, and nothing drawn to hold them.

**What did *not* change is as important as what did.** The bar still reserves
`--site-bar-h` and still hides on a downward scroll, so the three game screens'
`h-[calc(100dvh-var(--site-bar-h))]` arithmetic is untouched — re-measured 0px
of overflow in either axis on `/guess` and `/compare` after the change. The
wordmark stays, and so does its `on-photo` drop shadow, which is now doing real
work on the content routes too: with no fill behind it the text sits directly
over whatever has scrolled under it.

**`isTransparentRoute` no longer says anything about the bar**, and that is the
one trap here. It stays because the *controls* still need it: the menu button
and its panel are surfaces of their own, and over a photograph they take the
game's glass rather than the card they wear on an ordinary page. Deleting it
along with the bar's branch would have put a `bg-card` panel on top of a
full-bleed picture.

## The top-right control is a menu, not a language picker

`components/site-menu.tsx` replaced `LanguageSelector`, which is deleted. Three
bars fold into an X and a panel grows out of the corner the button sits in.

**All eight rows are live as of 2026-10-07.** Home, leaderboard, achievements,
account, contact and the tip jar are routes; FAQ is a *section* of the home
page (`/#faq`) rather than a route of its own, which is what makes it work from
anywhere on the site.

**Home is first, and it is the only way out of a game.** `/guess` and
`/compare` are exactly one viewport with no masthead to press — the bar carries
a `Tempus` wordmark on every *other* route, and on those two it is the single
thing in the top-left of a full-bleed photograph. The row was added on
2026-10-07; before it, leaving a game meant the browser's back button. It is
`menuHome`, a `menu*` key rather than a borrowed page title, because the home
page's own heading is the wordmark `Tempus` and a row labelled that would read
as the site's name rather than as a destination. All of them close the panel on the way out, or it is left
sitting over the thing it just scrolled to. The tip jar was the last placeholder
and gained a destination on 2026-10-07 — see "The contact page is one page with
two doors". `MenuRow` is a `Link` when it is given an `href` and an
`aria-disabled` button when it is not, and **that branch stays** even with no
caller: a link to a 404 is worse than a control that says so, which is what the
next unbuilt row should be.

**Every press in the panel arms a ring around the button**, and that is a
consequence of the panel closing on the way out: between the press and the next
page there was nothing on screen saying anything was happening, which on a route
that deals a round's worth of events is a visible silent wait. `.pending-ring`
in `app/globals.css` is one thin arc at `inset: -4px` on the button, turning
once every 900ms. It was `.menu-ring` until 2026-10-07, when the explorer's
stage needed the same mark while the coin's model loads — the inset is
`var(--ring-inset, -4px)` for that second caller, which owns a box of its own
rather than hanging off a control. Four things about it:

- **It is a `conic-gradient` masked to an annulus**, not an SVG circle: one
  element, no viewBox to keep square, and the stroke is the one number in
  `--ring-w`. The inset is measured from the button's *padding* box, which is
  2px narrower than the button — hence -4px for a 3px clearance.
- **The rows navigate through `router.push` inside a transition** rather than
  letting the `Link` do it, because `pending` is what the ring is. The `href`
  stays on the anchor and only the plain left click is diverted, so a
  middle-click, a modified click and a copied link address all still behave
  like links.
- **It is always mounted and faded by `data-busy`**, so a navigation that
  resolves inside the 140ms fade never shows a ring at all — which is the right
  answer for one that fast.
- **Under `prefers-reduced-motion` it stops turning outright** and shows as a
  complete faint annulus. A thing that revolves until something else finishes is
  exactly what that setting is for; `aria-busy` on the button is what actually
  announces the state either way.

The language chips and the sign-out share the ring, because from the reader's
side they are the same press. The sign-out is a `<form action>`, whose pending
state only exists *inside* the form, so `SignOutButton` lifts it with
`useFormStatus` — and its cleanup is what clears the ring, since that action
redirects rather than returning.

**Contact and the tip jar are the same destination entered from two ends.**
Both rows go to `/contact` and differ only in the order it deals its two
sections. The tip jar's label is therefore `supportTitle` — its own section's
heading — joining the three rows named from where they land; contact keeps
`menuContact`, because the page it lands on has two names and neither of them
is that row's.

**Two rows change with the session and one changes identity.** Achievements and
account need an account, so while signed out they point at `signInHref(...)`
rather than at a page the middleware would bounce — the URL in the status bar is
then the truth before the click. The "sign in" row *becomes* a sign-out form
once there is a session, because one slot holds the door in and the door out; it
is a `form`, not a `Link`, because clearing the session cookie is a write and a
GET must not do it. The account row carries the player's name as a second,
quieter line, which is the whole of the panel's "you are signed in" state — a
banner above the list would be a second thing to translate and to lay out, and
the row it would announce is right there.

The session is read on the **server** and handed down as one `account` prop:
`app/(public)/layout.tsx` resolves it for every route, and `app/(public)/page.tsx`
resolves it again for its own inline copy, because the layout's value does not
reach a sibling route segment. A browser read would leave the panel saying
"sign in" on the page the player just signed in from.

Three labels are taken from their destination's own title rather than a `menu*`
key (`leaderboardTitle`, `achievementsTitle`), so a row and the heading it lands
on cannot drift apart in five languages. `menuLeaderboard` was deleted for that
reason. The language picker is still the other live control inside.

**Off home the button is pinned to the viewport, and that is why it is a sibling
of `SiteHeader` rather than a child of it.** It must not be something you scroll
away from — and the bar deliberately hides on a downward scroll, so a menu
inside it would have gone with it. Being inside was also impossible for a
concrete reason, not just a tidy one: the bar hides by translating itself, and
**a transformed ancestor is the containing block for its `fixed`
descendants**, so the button would still have slid away. It is rendered beside
the header in `app/(public)/layout.tsx` instead.

**Its `top` is solved, not chosen**:
`calc((var(--site-bar-h) - var(--menu-btn)) / 2)`, which is the arithmetic the
bar's own `items-center` does, written out. It was a flat `top-7` until
2026-10-07 and the button's centre sat at 49px against the wordmark's 37px — 12px
apart on every route off home, which is what a second independent number buys.
`--menu-btn` (42px) is new in `app/globals.css` beside `--site-bar-h` and the
button's own box reads it too, so neither the bar's height nor the button's size
can move without the other following. Verified both centres at 37px on
`/leaderboard`, `/guess` and `/compare`; home is unaffected, where the inline
button and the `h1` have always agreed at 71.3px.

Horizontally it rides a
`fixed inset-x-0` track with the same `mx-auto max-w-7xl px-6` the in-flow rows
use: a fixed box's `inset-x-0` measures the initial containing block, which
excludes the scrollbar, so it agrees to the pixel with the columns below it. The
track is `pointer-events-none` with the button itself `pointer-events-auto`, or
a full-width invisible bar would make the top of every page dead.

**On home it is `inline` instead** — a flex item at the right-hand end of the
hero's masthead row, rendered by the page, with the floating copy standing down
(the `home` check in `SiteMenu`, which must stay below every hook). See the
masthead section above for why: that page's header is centred against the first
screen rather than pinned to the top of it, so a fixed `top` would float the
button free of the row it belongs to.

The button is 42px — `--menu-btn` since 2026-10-07, 38px until 2026-10-05 — and its bars are 20x14. Those
two sizes are not independent: `.menu-bars`' half-height less half a bar is the
`6.25px` the outer bars travel to meet at the centre, and it has to be
re-derived in `app/globals.css` whenever the box is, or the arms of the X
overlap instead of meeting. Off home the button is out of flow, which is what
lets it grow without touching `--site-bar-h`; on home it is 42px against a
masthead row whose height is the title's, so it does not set that row either. Re-verified after the change:
0px of overflow on `/guess`, `/compare` and `/versus`.

**The language picker is a row of chips because a menu must not open a menu.**
It was a dropdown of its own; inside the panel that would have stacked two
layers of overlay over a game. Five two-letter codes fit on one line at every
width the panel has, with the current one simply marked.

**The panel grows by `clip-path`, never by `transform: scale()`.** A scaled box
takes its corner radius and its 1px border with it, so the panel would open with
a huge soft corner and a fat edge that both tighten as it grows — visibly a
rubber sheet rather than a panel arriving. An inset clip reveals the finished
box through a window: radius and border are the final ones from the first frame,
and the content is laid out at full size throughout so nothing reflows mid
animation. The `round 24px` in the clip path **must match the element's own
radius**, or the clip's corners cut inside the panel's and the corners read as
chipped.

**The bars fold in two movements, which is why each is two elements.** The outer
`.menu-bar` travels, the inner `<i>` turns, and the two carry opposite
transition delays: travel then turn on the way open, turn then separate on the
way closed. Collapsing them into one `translate(...) rotate(...)` runs both at
once and the bars cross the middle of the box already tilted — a slip rather
than a fold. The middle bar scales to nothing as it fades; fading alone leaves a
ghost across the X while the arms arrive.

**The panel is always mounted and `inert` when closed.** It has to animate in
both directions, and an element that unmounts on close has no closing frame to
show. `pointer-events-none` alone would leave six focusable rows behind the
page, so `inert` is what actually takes it out of reach — verified both ways.

**The item stagger replays by remounting, not by a class toggle.** A CSS
animation that has already finished does not run again merely because its
element became visible, so the list is keyed on a counter bumped on every open.
Going *out*, everything leaves together: a staggered exit would hold the last
row past the moment the clip has already swallowed it, so it would be invisible
and the closing would feel slower for nothing.

Over a photograph (`TRANSPARENT_ROUTES`) both button and panel switch to the
timeline's glass, for the same reason the language pill did — a card-surfaced
panel over a picture reads as a leftover from another page. All three game
screens still fit exactly one viewport with it: verified 0px of overflow on
`/guess`, `/compare` and `/versus`.

## The date-guessing screen

**It is exactly one viewport and must never scroll** — not before a guess, not
after one. `app/(public)/guess/page.tsx` sizes itself `100dvh` minus the top
bar, and both sides of that subtraction read `--site-bar-h` from
`app/globals.css`: `SiteHeader` sets the bar to it, the game subtracts it. They
were two independent numbers before and had already drifted 5px apart, which is
enough to put a scrollbar on a page built not to have one. **Change the bar's
height only through that token.**

Inside, the column is a height budget. The rail and the footer are `shrink-0`;
the event card is the one part that gives, taking whatever is left (capped at
26rem so a tall screen does not turn it into a billboard, floored so a short one
still shows a picture). Verified to fit with no overflow down to a 600px-tall
window.

**The footer is one button in one position for the whole round.** "Lock in
guess" and "Next round" share a single grid cell, so they share a centre and the
second lands exactly where the first was — verified identical: same top, same
46px height, centres 0.004px apart, measured in two different panes. They are
told apart by colour, not by place (solid white before the guess, dark glass
after), which is why `ROUND_BUTTON` carries a border on *both*: the glass one
needs a visible edge, and a 1px box difference would be a 1px jump in the one
element that exists not to move. `inert` keeps whichever is hidden out of the tab
order while it is only holding the slot open.

**The result is beside the card, not in the column and not on the picture.**
That is a height-budget decision twice over. The verdict and its numbers are
~80px of content; in the flow they sit between the rail and the button and push
the button down the moment it matters most — on a short screen, off the bottom
of a page built not to scroll. That was the original bug, and stacking the two
*states* in one cell only hid it by reserving the taller one's height all
round. Painting it over the foot of the photograph cost the budget nothing but
put a verdict across the one thing the round is about, so since 2026-10-06 it
hangs off the card's own box instead: `VerdictFlank` on the left in the
verdict's colour, `NoteFlank` on the right with what the event was
(`components/round-flank.tsx`). The visible masthead was removed from this
screen for the same budget (an `sr-only` `h1` keeps the document outline).

Six things hold that composition up:

- **The flanks are `absolute` against a wrapper that repeats the card's own
  caps**, so the photograph does not move a pixel when a round is answered and
  the column's height is exactly what it was before the guess. Measured at
  1680x788: card unmoved (dx/dy/dh all 0), both flanks 240x402 against the
  card's own 402, the button's top and centre unchanged, 0px of overflow in
  either axis. A panel laid out *in flow* beside the card shoves the card
  sideways the moment it appears.
- **`inset-y-0` is why the wrapper must be the same height as the card.** It
  carries `sm:max-h-[26rem]` for that reason alone — a wrapper free to grow
  taller hangs the flanks past the card's corners.
- **Below 1120px there are no sides, so `RoundVerdict` takes over.** 512px of
  card plus two 240px panels and their 16px gaps wants 1024px of column, and
  the page's column is the viewport less its `px-6`. The overlay and the
  flanks share one `@media (min-width: 1120px)` block — `:flex` on the pair,
  `:hidden` on the overlay — so they can never both be on screen. The note has
  no narrow-screen home and simply is not shown: a second overlay would bury
  the picture.
- **The left panel is a ticket: a saturated head over a dark foot.** Chosen
  from a catalog of 25 designs on 2026-10-08 (five per tier, since deleted —
  it lived at `app/card-lab/`) and it is the one change here that is a change
  of *kind*. The panel was a dark surface carrying about a sixth of the tier's
  hue, with the word on it printed in a gradient of that same hue — so two
  neighbouring rungs of a five-step ladder differed by the colour of thirty-odd
  pixels of type. The head is 46% of the card's height in the tier's own
  colour, read before the word is, and the word is plain near-black on it
  rather than a gradient competing with its own background. `verdictDeckHead`
  and `verdictDeckFoot` in `lib/game/verdict-style.ts` are where those two
  fills are mixed, so retuning a tier still retunes its card.

  The head is **mixed in oklch**, unlike everything else in that file: its two
  ends are a lightened and a darkened copy of one hue, and srgb's naive
  interpolation takes the light end through a visibly desaturated grey on the
  orange and yellow tiers. The rest of the file mixes toward white or black at
  low proportions, where that does not show.

  The foot is the two numbers, **labelled** — `distanceTitle` (new in all five
  languages) over the existing `yearsOff` string, and `yourGuess` over the
  year, which stays the one thing below the head in the tier's colour. The
  actual year is still absent from both panels: it is marked on the rail the
  camera has just flown to, and printing it here as well is two reveals of one
  answer.
- **The two are deliberately not equally transparent, and the result is the
  less transparent one.** Both were ~50% glass over the round's photograph
  until 2026-10-07, which is what made the yellow tier unreadable — a 14% tint
  over a 50% scrim over an arbitrary picture is not a colour anybody can name.
  The result card is **90%** (`DECK_ALPHA`, asked for on 2026-10-08 with the
  design above; it was 96% between those two dates) and the note panel 80% —
  60% until 2026-10-07, where a pale sky or a lit interior behind it came
  through brightly enough to compete with the small type on it. The note's
  fill is also the result card's own near-black (`#070707`) rather than pure
  black, so the two read as one set of chrome at two depths. Neither has ever
  changed size.

  That 10% is what decides how the **notches** are drawn. They are punched out
  of the head's lower corners with an intersected pair of radial-gradient masks
  (`.verdict-deck-head` in `app/globals.css`), never painted on it: a disc in
  the foot's colour composites *over* a translucent head and shows as a dark
  blob. The same rule owns the head's slow drift — 9s across a 180% box, long
  and small on purpose, since this sits beside a photograph — and stops it
  outright under `prefers-reduced-motion` rather than shortening it.

  **The padding moved out of the shared `FLANK` box** in the same pass, into
  `NoteFlank`, because a head that has to reach all four of its own edges is
  the one thing a panel-wide `p-5` cannot allow. The card's `overflow-hidden`
  is what rounds the head's top corners, so the radius is still written once.
- **The challenge lives in the right panel.** It was a 32px "?" in the corner
  of the result panel and is a labelled control under a rule of its own now: what is being disputed is the *event's*
  date, which is what the right-hand panel is about, and the room it freed on
  the left went to the verdict. It takes its space from the description, which
  is why that stays a scroller — the panel's own size is unchanged.

**The right-hand panel is Lorem Ipsum until the descriptions exist.**
`event_translation.description` is null for all 497 rows, and the fallback is
on the *value* (`note?.trim() || PLACEHOLDER_NOTE`), not on a flag — the day
the five-language descriptions are seeded they start appearing with nothing to
switch over. It is deliberately nonsense Latin rather than plausible filler:
this is a game that teaches dates, and invented prose that reads as fact is the
one placeholder it must not ship.

**Guesses are graded on time depth, never on the raw year gap.**
`gradeGuess()` in `lib/game/scoring.ts` is the only place this is decided. The
gap is divided by the event's own age — `depth = |PRESENT_YEAR - actual|` — so
900 years out on something in 1900 (relative error 7.14) is correctly a worse
answer than 10,000 out on something in 110,000 BCE (0.089). Scoring the gap
directly inverts those two, which is the whole reason the module exists.

Each band also carries a **floor in years**, and it is not a fudge: depth shrinks
to nothing near the present (the moon landing is 57 years deep), and a purely
relative band there would demand the exact year for anything above the bottom
tier. Whichever of the two is more generous wins. Both sequences are monotonic,
so the bands nest and the first match is the best one. Retuning difficulty means
editing `BANDS` and nothing else.

**There are five tiers since 2026-10-07, and they were calibrated rather than
picked.** The ladder is `wayOff` → `bad` → `good` → `great` → `perfect`, up from
four, and the old bottom tier is the reason: `bad` was labelled "Way off" and
caught everything outside the widest band, which was about half of every set —
the reported "five in ten". Modelling a player who lands within ~8% of the
rail's width (the error that reproduces that figure under the old bands) the new
ones give great 15%, good 32%, bad 37%, way off 15%; at ~4% it is 26 / 40 / 29 /
5. In years, on Columbus (1492): great 27, good 107, bad 454. On the moon
landing, where the floors are binding: 8 / 35 / 100.

Two consequences to keep in mind. **`perfect` is now the exact year and nothing
else** — it carried a 2.5% band before, which made it the commonest verdict of
all on a drag, so it is the thing you can only do on purpose with the arrow
keys. And the worst tier's id is **`wayOff`**, not `bad`: the new rung took that
name, because an id printing as "Way off" beside a different id printing as
"Bad" is exactly the kind of thing that gets mis-read later. The one place that
rename reaches the database is `versus_seat_result()` — see "Head-to-head".

Each tier's label and colour live in `lib/game/verdict-style.ts`
(`VERDICT_LABEL_KEYS`, `VERDICT_COLORS` and the three gradient helpers), which
is one hue per rung — blue, green, yellow, orange, red — rather than the three
colours for four tiers it was before. At five rungs the colour is a scale, and a
scale has to be readable without reading.

**The answer's marker on the rail is white, and the date is inside it.** It was
a green stick with the year hanging under it as a second caption until
2026-10-07; it is a pointer centred over a block that holds the year, in the
same white everything else on the rail is drawn in — the green was one of only
two saturated hues on that rail and it read as chrome left on top of the
picture. Three things hold it up.

- **The centring lives in the keyframe, not in a class.** The marker is placed
  by `left: <fraction>%` and pulled back half its own width by
  `translateX(-50%)` inside `answer-marker-in` (`app/globals.css`), because an
  animation outranks the element's own styles — a Tailwind `-translate-x-1/2`
  would hold for the element's whole life *except* the 380ms it is being looked
  at. Both keyframes carry it. Verified: pointer centre and block centre agree
  to 0.004px.
- **`top-7` is measured.** The band below the rail is `pb-14`, 56px, and the
  ruler's own numerals occupy the first 27px of it, so the marker starts where
  they end and its 49px still fit. Grow either piece and re-check that sum —
  the stage viewport clips, so the overflow would silently take the bottom off
  the block.
- **The pointer is a `clip-path` triangle**, not the border trick: one element,
  exactly symmetrical about its own centre at any size, and it takes `bg-ink`
  like the rest of the rail instead of needing its colour spelled out as a
  border.

The player's own marker is unchanged and still carries its pill *above* the
rail, which is now the whole of what tells the two white markers apart when a
guess and its answer share a pane. `.answer-label` survives for the
head-to-head mode's opponent ring; `.answer-stick` had no caller left and was
removed with the green.

**The travelled portion of the rail is muted white, not blue.** It was
`bg-accent` until 2026-10-08 — the palette's blue, the player's own mark
everywhere else — and over a photograph it was the one saturated hue on the
screen, exactly as it was on the comparison rail before that one went white for
the same reason. It is `bg-white/55` against the track's `white/25`: *muted*
rather than brilliant, because the marker itself is solid `ink` and a full-white
fill leaves the travelled portion competing with the marker it exists to lead
the eye to.

**The gap between the guess and the truth is drawn along the rail, in the
verdict's colour.** `gapColor` on `TimelinePaneView` — passed `VERDICT_COLORS`
by both modes, so the bar and the result card beside the photograph are the same
red or the same green, and the distance the card names as a number is also a
length on the scale the guess was read off. Four things about it:

- **It renders only on the pane that holds both markers.** `showGuess` is true
  for the pane the guess was made in and the answer's fraction is non-null only
  on the pane the answer lives in, so the condition is simply both — a guess an
  era away from the truth has no single rail to draw a gap on, and the camera's
  journey is what reports that instead.
- **A `perfect` guess draws nothing, for free.** The two years are the same, so
  the bar has no width; there is no special case.
- **No z-index, deliberately.** It has to stay *under* the guess marker and the
  answer's pointer — a coloured line across the white dot it starts from reads
  as a fault — so it sits between the travelled fill and the ticks, which
  already cross that fill.
- **It grows out of the guess towards the answer** (`.answer-gap` /
  `answer-gap-in` in `app/globals.css`), on the answer marker's own delay, so a
  bar that reports a distance draws itself rather than appearing whole. The
  origin is set inline because which end it grows from depends on whether the
  guess was early or late.

**The ruler's numerals sit on their marks.** Each label used to be pulled back
by its own width *in proportion to how far along the rail it sat*
(`translateX(-at * 100%)`), which kept the first and last inside the rail's ends
and left every one in between sitting right of the line it belongs to — by a
quarter of its own width at the quarter mark, and by nothing at all only in the
middle. They are plainly centred since 2026-10-08 (verified: every label's
centre within 0.00px of its tick's). The ends therefore hang into the pane's own
padding, which is why that is **`px-8` below `sm`** and not `px-6`: the widest
tick label on any pane is 59.8px ("10 million"), so an end label needs 29.9px of
room beyond the rail and 24 left it with its first digit shaved off by the stage
viewport's clip.

**A pane's heading is its era's name and nothing else.** Three of the five
carried a line of description under it until 2026-10-06 (`paneBlurb`, now
deleted along with the three dictionary keys); the common era and the future
never did, so the row of panes read as a heading on two of them and a small
essay on the other three. Removed on request — the rail under it is what says
what the era holds.

**Each pane snaps to its own grid of whole years, and the grid is finer than
the ruler.** One year across 1–10,000 BCE, ten through the evolution pane, a
hundred through the cosmos — `stepYears` in `PANE_SPEC`. The civilisation pane
moved in 100-year steps until 2026-10-04, which put events like 359 BCE at a
year the rail had no position for; all 10,000 of its years are now exact fixed
points of `fractionAtYear` -> `yearAtFraction`. The tick layout is deliberately
untouched, so the rails read exactly as before.

A log pane rounds to a multiple of its step just as a linear one does. The one
visible consequence is in the evolution pane between 10,000 and 999,999 BCE,
where the year is printed in full: a drag now reads `316230 BCE` where the old
3-significant-figure snap gave `316000 BCE`. Above a million `formatYear`
switches to magnitudes ("3.47 million BCE") and the grids make no visible
difference at all.

**The key step and the snap grid are the same thing only on the linear panes.**
`keyStepFraction` is one year there, which is what makes a specific year
reachable — the civilisation rail is 10,000 years over ~940px, so a drag alone
can only land on about one year in eleven; you drag to the neighbourhood and
step onto the year. On the log panes the key step stays a hundredth of a decade,
because a 10-year press would take a million of them to cross the pane.

A one-year arrow needs a coarse partner or the pane cannot be crossed at all:
`coarseStepFraction` (Page Up/Down, shift+arrow) is 100 fine steps, capped at a
tenth of the rail so one press on a log pane is not a third of the era. On the
civilisation pane that is exactly the 100 years the arrow key used to take.

**Rounds are a client-side queue, not a route refresh.** The page deals
`ROUND_QUEUE_DEPTH` (2) events — the one being played and the one after it —
and `TimelineGame` plays through them, topping the queue back up from
`dealTimelineEvents` (`app/actions/rounds.ts`) in the background while the
current round is still being guessed, and preloading the next picture with a
bare `new Image()`. So "next round" is a state change: no reload, no fetch in
the way, no waiting on an image. What plays instead is the photograph
dissolving and the camera flying back to the common era, which carries the
backdrop through its own crossfade.

Three things about that are easy to get wrong:

- **The refill effect keys on the queue's *length*.** A failed draw leaves the
  length unchanged, so it would never retry — hence the explicit `refillAttempt`
  counter. A draw also drops anything already in hand, which is what stops the
  same event appearing twice running; a batch can never be filtered away
  entirely, so the queue always grows and the effect always settles.
- **`randomEvents` returns its batch in timeline order.** Dealing two at a time
  and using them in that order would make every round older than the one after
  it, in pairs. `dealTimelineEvents` shuffles before returning.
- **The rails are reset in two parts** (`nextRound`). The pane being landed on is
  reset immediately — it is off-camera then, or already on screen where the
  marker simply glides back to centre. Every other pane keeps its marker until
  the journey is over, because resetting them up front is a visible jump on the
  rails the camera is about to fly past.

**The title does not cross-dissolve, and that is deliberate.** The photograph
follows the backdrop's rule — outgoing held opaque underneath, only the incoming
layer animates — but two *strings* at half alpha on top of each other read as a
rendering fault rather than as a transition, so the old caption leaves first and
the new one arrives after the picture has settled. Timings are the
`round-photo-in` / `round-title-in` / `round-title-out` rules in
`app/globals.css`; `PHOTO_FADE_MS` in the component must match the first of
them. The caption's box is a fixed height so names from two words to a dozen
cannot move the ruler under it.

A `"use server"` module may export nothing but async functions, which is why
`ROUND_QUEUE_DEPTH`, `ROUND_PHOTO_FADE_MS` and `EVENTS_PER_COMPARISON_ROUND` all
live in `lib/game/rounds.ts` and not beside the actions that read them. `tsc`
does not catch that; only the bundler does.

**Both games share this machinery**, so the notes above apply to the comparison
page too — see below for what is different about it.

## Play happens in sets of ten

Both games bracket their endless round queue into a **set of ten questions**,
then show a summary and offer another. `lib/game/set.ts` is the whole of the
rules and knows about neither game: `SetResult` is the one shape both record, a
`{ hit, verdict }` pair, which is what lets a single `components/set-summary.tsx`
serve them both. `QUESTIONS_PER_SET` is a product decision written down once —
the user may change it, so never inline a 10.

**The queue is kept one round deeper than the pair in hand, and that is a bug
fix, not a tuning knob.** The refill effect tops up to `ROUND_QUEUE_TARGET`
(3), not to `ROUND_QUEUE_DEPTH` (2, which is still what the page deals on the
server). With the two equal, the refill condition `length < 2` was never true
for an opening queue of exactly 2 — **nothing was prefetched during question
1**, and the first draw of the game started only when the player advanced to
question 2. At that moment the queue held one round, `upcoming` was null, and
`disabled={!upcoming}` made "Next round" genuinely dead for the length of that
draw: measured at **1609 ms** locally, worse over a real network, on question 2
of every game. One deeper makes `length < 3` true at mount, so the first draw
happens while question 1 is still being read and the queue oscillates 4-3-2-4
without ever reaching 1.

**Neither game's advance button is ever disabled.** A press with nothing queued
is latched (`pendingNext`) and played by an effect the moment a round arrives,
so a slow or failed draw makes the button *late*, never dead. `aria-busy` and a
`cursor-progress` tint are the only feedback. Re-introducing `disabled` here
re-introduces the bug above.

**A set lives in component state and dies with the tab.** There are still no
game tables and none should be added speculatively (gap 5). Nothing is
persisted: no streak across sets, no history, no leaderboard.

**The result is banked in `nextRound`, not in `submit`.** So `results.length` is
always the number of questions *left behind*, which makes it simultaneously the
score and the index of the one on screen — hence `lastQuestion` is
`results.length === QUESTIONS_PER_SET - 1` and the button on that question reads
"See results" instead of "Next round". **The round underneath advances anyway**,
so the summary covers a freshly-dealt, unanswered question 1 and "Play again" is
`setResults([])` and nothing else — no deal, no refetch, no loading state. That
is the whole reason the summary is cheap; do not "fix" it by holding the queue
back on the last question.

**What counts as a hit is not a second opinion about difficulty.** The
comparison game is right-or-wrong. The date-guessing game's five tiers split
four-to-one exactly as `VERDICT_COLORS` already paints them — the red tier is
the miss and everything above it is a hit. Retuning that means editing `BANDS`
in `lib/game/scoring.ts`, not `MISSED_VERDICT` in `set.ts`.

**The line did not move when the ladder gained a rung**, so `bad` is a hit where
before the bottom tier was the only thing it could be. That is deliberate: the
bottom tier was ~45% of all guesses under the old bands and is ~15% under the
new ones, so holding the line is what makes a set's percentage more forgiving
rather than slightly harsher. Making `bad` a miss as well is one line in
`set.ts` if that is ever wanted.

**The share text is the Wordle shape** — title, score, emoji grid, link — and
the grid spoils nothing: the squares say how well the set went, never which
events came up, so it can be pasted to someone who has not played. Its colours
match the on-screen pips exactly, which five tiers made easier rather than
harder: the ladder runs blue → green → yellow → orange → red and Unicode has a
square for each (🟦🟩🟨🟧🟥), so a pasted result needs no legend. The comparison
game, which grades no tiers, keeps the plain 🟩/⬛ pair. The URL is read from `window.location` at click time, because the site
has no domain yet (gap 1) and a baked-in one would be wrong everywhere.
`navigator.share` is tried first and falls back to the clipboard; an
`AbortError` is the player dismissing the sheet and is deliberately silent.

**The summary costs the height budget nothing, because it replaces the round
rather than joining it.** Both game screens are still exactly one viewport and
must not scroll. The panel caps itself at `max-h-full` and scrolls internally on
a window too short for it — verified at 520px, where the panel sits at 472px and
"Play again" stays inside it. The live "n of 10" counter takes no row in
either game for the same reason: it is absolutely positioned on the photograph
in the date-guessing game (where the verdict already lives), and in the
comparison game it is part of the masthead pill, which is itself out of the
flow (see below).

**The comparison masthead moved from the page into the game.** Its blurb is a
live instruction ("which of the two dates…"), and left on the page it stood over
the finished set asking a question that was no longer on screen — only the game
knows the set is over. The page keeps an `sr-only` `h1` for the outline.

**And then out of the flow altogether.** `RoundHead` in
`components/comparison-game.tsx` is one pill — the game's name, a dot, and
"n of 10" — `fixed` in the top bar's own row from 2026-10-08, where the
wordmark and the menu button are. It was an 84px block of flow (a `text-3xl`
title, its blurb and a margin), and on a screen whose height is a
hand-maintained sum those were 84px the two photographs did not get:
`--compare-chrome` dropped to **20.75rem** and the cards went to their 360px
cap at a 1680x844 window. Seven things about it:

- **Its `top` is solved, not chosen**, the way the menu button's is:
  `calc((var(--site-bar-h) - var(--compare-head)) / 2)`, where
  `--compare-head` is the pill's own closed height (2.875rem — `text-lg`'s 28px
  line box plus `py-2` and the border). Measured at 1680x844: wordmark, pill
  and menu button all centred at 37.0px.
- **One type size for both halves, and it is the `Tempus` wordmark's**
  (`text-lg`), which was the point of the change — the row reads as one
  masthead rather than as a heading with a counter stuck to it. `SetProgress`
  is no longer used on this screen; the string is formatted in place, because
  that component is a small dark pill in its own right.
- **The instruction unrolls on hover** instead of standing under the title. It
  is the home board's `CardBlurb` mechanism exactly — `grid-template-rows: 0fr
  -> 1fr` with the child owning the `overflow-hidden` — so it never opens on a
  touch screen (Tailwind compiles `group-hover:` inside
  `@media (hover: hover)`) and the text is always in the document for a screen
  reader. `.compare-head-blurb` exists only so `prefers-reduced-motion` can
  reach both the row's duration and the paragraph's.
- **The radius is half the closed height, written as exactly that.**
  `rounded-full` resolves against the box, so the corners would tighten and
  slacken through the whole 420ms and the pill would read as a rubber sheet
  rather than as a panel opening — the same trap as the menu panel's
  `clip-path` radius. One constant gives the stadium closed and holds it open.
- **Only the pill row is a pointer target.** The wrapper and the unrolled row
  are `pointer-events-none`, so the open panel — which hangs over the top of
  the floating bubble — cannot swallow the drag that starts the round. Hover
  still reaches the card, because an element is `:hover` whenever the hit
  target is one of its descendants.
- **Below `sm` it is back in the flow**, because the bar's row physically has
  no space for a third thing: a phone's wordmark and menu button leave about
  175px between them and the shortest of the five languages needs more than
  that. It is one element switching between `static` and `fixed` rather than
  two instances, so a screen reader is never read the same masthead twice.
  That row is *not* in `--compare-chrome` and does not need to be — a phone's
  cards are capped by `38vw` rather than by the height, so the budget has slack
  (at 375x667 the width cap gives 142px against the 180px the height would
  still allow).
- **The round's instruction is the only help text left.** The line under the
  rail — "slide the event along the timeline, then lock in your guess" — was
  removed on request in the same pass. `comparisonHint` stays in the dictionary
  because it is still the rail's accessible name, and the box it stood in stays
  reserved at `min-h-16`, because that is the verdict's room and it has to be
  paid for before the verdict arrives.

**The round's button is a tenth larger than the site's other round buttons**
(`px-[1.925rem] py-[0.825rem] text-[0.9625rem]/[1.375rem]`, from 28/12/14px),
asked for on 2026-10-08. All three numbers are scaled, not just the padding — a
button that grows its box around the same type reads as padded rather than as
bigger — and the line height is spelled out with the size because `text-sm`
carried a 20px line box of its own and a bare `text-[…]` falls back to
`normal`, which would have taken the box up 12% rather than 10%. Measured 48.4px
tall against 44.

## The comparison page's backdrop

One photograph for the whole game, under `comparison-game/` in R2 — the cosmos
plate, byte-identical to the date-guessing game's copy but kept separately on
purpose, so re-dressing one game cannot silently re-dress the other. One rather
than five because a comparison round holds two anchors that can sit in any two
eras at once: there is no single era for a backdrop to illustrate, and the
cosmos is the one view that belongs to no period and so cannot contradict the
round in front of it. `ComparisonBackdrop` is a Server Component — there is
nothing to crossfade.

**No blue on this page.** The date-guessing game paints the player's marker in
`--color-accent`, but over a photograph that was the only saturated hue on
screen and read as chrome left on top of the picture. Everything the player
drives here — rail, travelled portion, lit end, live caption, focus ring — is
white at varying alpha. Green and red stay: they are the verdict, not the
controls. The surfaces are the timeline game's glass
(`bg-black/35 backdrop-blur-2xl`) for the same reason an opaque `bg-card` panel
over a photograph reads as a leftover from another page, which is also why
`/compare` joined `TRANSPARENT_ROUTES`.

**Its rounds are a queue too**, on the same pattern as the date-guessing game
(`dealComparisonRounds`, refill keyed on queue length with a `refillAttempt`
retry, next round's pictures preloaded). Three differences are worth knowing:

- **A round is three events, and the shuffle before the cut is load-bearing.**
  The action draws `3 x count` events in one go and slices them into threes.
  `randomEvents` returns its batch in timeline order, so slicing it unshuffled
  would hand each round three events adjacent in history — anchors a few years
  apart, and a question with no room in it. `distinctYears` is asked of the whole
  draw, which is stronger than needed and is what guarantees no round can come
  out with two anchors on the same year.
- **All three bubbles dissolve at once**, and each `EventBubble` owns its own
  handover. The crossfade keys on the **event's identity, not the caption** —
  the floating bubble's "???" becomes the real date mid-round, and that has to
  update in place rather than trigger a dissolve. `shown.active` is kept in step
  with the live caption purely so it carries the *revealed* one when it later
  becomes the outgoing layer.
- **The text block reserves two lines**, and the rare third is absorbed by the
  *lane* rather than by the card. Measured against the 66 longest names in the
  dataset at the full 360px bubble, exactly one still wants a third line and
  none has ever wanted a fourth; it reserved three when the card was 228px wide,
  which is where most of the picture's new height came from.

The marker is not cut back to the middle on a new round: it keeps the 450ms ease
the drag release uses, so it glides home while the pictures dissolve.

## The comparison page is a height budget run backwards

Like the date-guessing screen it is **exactly one viewport and must not
scroll**, and both sides of that subtraction read `--site-bar-h`. But the budget
works the opposite way round. There the card takes whatever height is left over;
here a card's height *follows its width* through a 16/9 picture, so a width
picked from the viewport's width decides how tall the page has to be. `--bubble`
in `components/comparison-game.tsx` therefore solves for the width: subtract
everything that is not a photograph, split what is left between the two lanes,
convert back to a width. `min(38vw, …)` caps it on a phone and 360px stops a
tall window turning the cards into billboards; below ~637px of viewport height
the 132px floor wins and the page scrolls, which is the deliberate safety valve.

**`--compare-chrome` in `app/globals.css` is that subtraction**, and it is a
hand-maintained sum: page padding, rail lane, both caption blocks and borders,
column gap, the reserved verdict block. Every row the chrome gains is a row the
pictures lose, so changing any of those sizes without changing the token either
leaves a strip of dead space or puts a scrollbar on a page built not to have
one. The masthead was the 84px row at the head of that list until 2026-10-08
and is out of the flow now, which is the whole of why the token is 20.75rem
rather than 26.

**The two lanes have fixed heights and the cards are anchored to the rail** —
upper lane `items-end`, lower lane `items-start`. That is what pins the rail: a
caption that needs a third line grows the card *away* from the rail, into the
space above or the verdict's gap below, instead of pushing everything under it
down the screen. Verified: a forced three-line name grows the target
card from 262px to 282px, its top moves up 20px, its bottom and the rail do not
move at all. It is also what makes the page's total height a pure function of
`--bubble`, which is what makes the budget above exact.

**The cards are landscape, not square.** They were 228x227 with a 226x127
picture — 56% of the card. They are 315x262 with a 313x176 picture at a 1680x844
window, twice the image area, and the caption block is the half of that which
came from reserving two lines instead of three. The event name grew with the
card (`text-sm sm:text-base`); the date above it deliberately did not, since on
the two anchors it is the one thing the player has already been told.

**A new decorative prefix needs adding to the dev image proxy.**
`app/api/r2/[...key]/route.ts` serves R2 bytes from localhost (r2.dev is
unreachable from here — gap 1) and refuses any key outside `ALLOWED_PREFIXES`,
and any extension outside `ALLOWED_EXTENSIONS`. `comparison-game/` rendered as a
bare gradient until it was added there, and the failure looks exactly like a
missing object. The route also honours `Range` now, which only the explorer's
video needs but which costs the images nothing.

## Date-guessing backdrops

Each of the five timeline panes has its own full-bleed photograph, under
`date-guessing-game/` in R2 — decorative art belonging to no event, so like the
homepage heroes `parseImageObjectKey()` rejects their keys by design.
`lib/storage/images.ts` maps pane -> base name and the record is total, so a
sixth pane will not compile without a sixth photo. **A base name says nothing
about which pane shows it**: three of the five were re-dressed on 2026-10-07
with photographs uploaded under the names they arrived with — common era is
`game-backgrounds-001`, civilization `game-backgrounds-002` and evolution
`game-backgrounds-003` — so that record is the only place the pairing is
written down. Cosmos and future still match their pane's slug by history rather
than by rule; renaming an object to match its pane would mean regenerating its
derived widths, which is why they were left as uploaded. All three new ones are
night skies, so those three panes read more alike than they did, and **the home
page's Daily card follows the common era** (it reads `timelineBackdropUrl("ce")`
on purpose) and is now a starfield.

**Load the derived widths, never `<base>.jpg`.** The originals are 24-megapixel
camera files, 2-4MB each. A browser caches the *decoded* bitmap, so three of
those on screen is ~290MB of texture and Chrome evicts and re-decodes them — the
backdrop visibly flickers to black. `-1440.jpg` and `-2560.jpg` variants are
generated with `sips` and uploaded alongside; `timelineBackdropSrcSet()` serves
them at `sizes="100vw"`, which still picks 2560 on a wide retina screen. The
originals stay as masters. Any new backdrop needs the same two derivatives.

**They are not redundant low-resolution copies, and nothing falls back to the
master.** A pane whose derivatives are missing requests URLs that 404 and shows
no photograph at all — which is exactly what happened to cosmos, common-era2 and
future when they were deleted on 2026-10-04; three of the five panes were
running on their gradient wash alone until they were regenerated.
`npm run backdrops:derive -- --prefix <folder>/` rebuilds whatever is missing
(`scripts/derive-backdrops.ts`): it recognises masters by their lack of a
`-<width>` suffix, skips what is already there, and is safe to re-run.
`BACKDROP_WIDTHS` in `lib/storage/images.ts` is the one list of widths, read by
both the page helpers and that script.

`components/timeline-backdrop.tsx` crossfades panes. The one rule that matters:
**only the incoming layer animates** — the outgoing pane is held at full opacity
underneath it. Fading both at once leaves each at ~50% alpha mid-transition,
which composites 25% of the black page between them and reads as a dark band
sweeping the screen. That band is the seam the crossfade exists to hide. Each
pane also carries a gradient wash under its photo, so the eras still change
colour when R2 is unreachable (gap 1).

## Attaching images

```bash
npm run image:attach -- --event <slug> --key <r2-object-key> \
  --source-url <https://…> --license <code> \
  [--source-name …] [--author …] [--attribution …] [--primary] [--dry-run]
```

The object must already be in the bucket. The script reads byte size, content
type, SHA-256 and pixel dimensions **from the bytes in R2**, so those columns
cannot drift from reality — never hand-type them.

`--source-url` and `--license` are mandatory because `image.source_page_url` and
`image.license_code` are `NOT NULL`. **Never invent an attribution to satisfy
them** — a fabricated rights claim is worse than a missing image. Ask for the
real source. Valid license codes: `PD, PD-US, CC0-1.0, CC-BY-4.0, CC-BY-SA-4.0,
CC-BY-3.0, CC-BY-SA-3.0, CC-BY-NC-4.0`.

To attach a whole folder at once, where each filename is already the event
slug:

```bash
npm run images:attach -- --prefix bce/ \
  --source-url <https://…> --license <code> \
  [--source-name …] [--primary] [--dry-run]
```

It runs each object through the same `attachImage()` as the single-file CLI
(`scripts/attach-core.ts` holds the one implementation), so a bulk run is
exactly as strict. A key whose base name is not an existing slug is reported and
skipped — **never fuzzy-matched**, since a mis-attached picture would be taught
as fact. The provenance flags apply to the entire batch, so only use it when the
batch genuinely shares one source and licence; mixed sources need separate runs.

The key must be `<era>/<filename>.<ext>` and the folder must match the event's
era, or the script refuses it. `--allow-any-key` bypasses that for legacy
objects. Multiple images for one event use `--variant` style names
(`ce/waterloo-2.webp`); a partial unique index still allows only one
`is_primary` per event.

## Conventions

- Comments explain *why*, not what. Match surrounding density.
- Verify before claiming: run `npm run typecheck` and, for schema work, apply
  against a throwaway Postgres or use `--dry-run` first.
- `server-only` marks modules that must never reach the client
  (`lib/db/admin.ts`, `lib/storage/r2.ts`, `lib/auth/*`).
- **Imports inside `lib/` are relative with an explicit `.ts` extension**, not
  the `@/` alias. `scripts/` runs under plain `node --experimental-strip-types`,
  which cannot resolve tsconfig path aliases; relative specifiers load under
  both Next's bundler and node, so the era rule has exactly one definition.
  App code under `app/` still uses `@/`.
- Migrations are append-only. `scripts/migrate.ts` warns if an applied file's
  checksum changed; add a new migration rather than editing history.
