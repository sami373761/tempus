# TEMPUS — working notes

A historical date-guessing game. **Foundation only: there is no game UI and no
admin UI yet.** The database schema, data-access layer, storage layer and auth
layer exist and the dataset is loaded.

Stack: Next.js 15 (App Router) · TypeScript · Tailwind v4 · Supabase Postgres 17
· Cloudflare R2 · targeted at Vercel. Not a git repository yet.

## Current state (as of 2026-10-02)

The remote Supabase database (`kyxydoaevasuauflrjrl`) is migrated and populated:

- **497 events**, all `status = 'published'`
- **2485 translations** — 497 × 5 locales (`en, tr, de, fr, es`), none missing
- **3 era categories** (`bce` 135, `ce` 362, `future` 0), one per event, kept in
  sync by trigger
- **183 images** — 92 `bce/`, 91 `ce/`, one primary each; see gap 2 below
- Range: 4.54 billion BCE → 2022 CE; precision `year` 474, `century` 23
- 9 migrations applied, tracked in `internal.schema_migrations`

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
183 of the 497 events and the rest wait their turn rather than appearing as a
grey placeholder. Nothing has to be re-seeded to bring one back — attaching an
image is the whole of it. The default is a default, not a hard rule, because
editing tools have to be able to see exactly what the site is hiding: pass
`requireImage: false`. `EVENT_PLACEHOLDER_IMAGE` stays as the last-resort
fallback, but on the public site it should now be unreachable.

The pool this leaves: 183 for the date-guessing game, and 155 at or after 9999
BCE — 140 of them at distinct years — for the comparison game, which needs three
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

**Two font families, split by size.** Lora (`--font-display`, the `font-display`
utility) sets headings and anything large enough to read as a title; Lato
(`--font-sans`) sets body copy and everything smaller. Both load through
`next/font/google` in `app/layout.tsx`, which self-hosts them — no runtime
request to Google — and both need `latin-ext`, because Turkish ğ/ş/ı are not in
`latin`. Lato has no 600 but plenty of body-sized text is `font-semibold`, so
weight `700` is shipped to avoid a synthetic bold.

Two traps. **Tailwind's default family token is named `--font-sans` whatever
face it holds**; preflight applies it to `html`, so overriding it is what makes
Lato the default for elements no utility class touches — renaming it drops
everything back to Tailwind's stock sans. And **every name in a font stack must
resolve**: a `var()` with no value makes the whole custom property invalid at
computed-value time, so `font-family: var(--font-display)` is dropped and
headings silently inherit the body face. That is exactly how a display face
pointed at an unloaded font failed — silently, with no error anywhere.

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

`--color-accent` stays blue on purpose, and is now the only chroma on the page:
in both games blue is the player's guess and green is the true answer, so don't
tint them toward the neutrals. `public/event-placeholder.svg` hardcodes its own
copy of four palette colours (three gradient stops and the clock stroke), so it
has to be retuned alongside them.

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

## Writes go through the service role

`anon`/`authenticated` are SELECT-only and see `status = 'published'` only.
Content writes use `lib/db/admin.ts` (service-role key, bypasses RLS) or the
direct connection in `scripts/`. Admin authorization is a Supabase
`app_metadata.role = 'admin'` claim, which cannot be self-assigned;
`app/admin/layout.tsx` is the single gate.

**A date challenge is the one thing a browser can write**, and it goes the
same way everything else does: `submitDateChallenge` in
`app/actions/challenges.ts` validates the pair it is given and hands one INSERT
to the service role. `public.event_date_challenge` has RLS on, zero policies
and no grants at all for `anon` or `authenticated` — verified both ways after
the migration — so there is no second path to it.

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

There are no accounts, so there is nothing to key "one vote per person" on.
This is a stream of reports for an editor to read, not a referendum — the
counts say which dates players keep arguing with, and the editor checks the
source. `eventChallengeStats()` is written and unused: it is what the admin
panel will list.

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
2. **183 event images, and they are now the whole of the visible dataset.**
   `image` has 183 rows, one primary per event: 92 of the 135 BCE events (68%)
   and 91 of the 362 CE ones (25%), added across 2026-10-02/04. The remaining
   314 events are **hidden from the site** rather than falling back to
   `EVENT_PLACEHOLDER_IMAGE` (see the invariant above) — attaching an image is
   all it takes to put one back in play. Their provenance is
   `source_name = 'Wikimedia Commons'`, `license_code = 'PD'`, and
   `source_page_url = 'https://commons.wikimedia.org/'` — the **site root, not
   the per-file page**, because the files were renamed to event slugs before
   upload and the original Commons page names are lost. Backfilling real file
   pages is open work; do not synthesise `File:<slug>.jpeg` URLs, they 404.
   Nine rows have null width/height, and all nine are AVIF:
   `toba-supereruption`, `arrival-of-the-black-death-in-europe`,
   `beginning-of-the-thirty-years-war`, `sealing-of-magna-carta`,
   `spanish-capture-of-tenochtitlan`, `california-gold-rush`,
   `declaration-of-the-rights-of-man-and-of-the-citizen`,
   `english-bill-of-rights` and `publication-of-on-the-origin-of-species`.
   `probeImage()` does not read AVIF dimensions; every AVIF upload will land
   this way until it does.

   **Three upload mistakes recur, and all three are caught, never guessed:**

   - *Apostrophes.* The slug for "Caesar's Gallic Wars" is
     `beginning-of-caesar-s-gallic-wars`, with `-s-`, so `…-caesars-…` does not
     match. Fix with explicit `image:attach --event <slug> --key <key>`, which
     takes the event directly and needs no rename. Eight files so far — the
     latest is `ce/napoleons-rise-to-power.jpeg`, whose event is
     `napoleon-s-rise-to-power`.
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
   `ce/publication-of-newton-s-principia.jpg`. **The malformed originals were
   left in place** and still show up as skips on every bulk run. Deleting them
   is safe and is open work.

   One more stray joined them: `ce/ashoka-adopts-buddhism.jpeg` is both in the
   wrong folder and redundant — the event is `ashoka-s-adoption-of-buddhism`
   (year -259) and already has a primary image under `bce/`. Do not attach it.

   The bucket also holds hand-uploaded homepage art under `homepage/` — the two
   Colosseum photos used as the bento hero background via
   `HOMEPAGE_HERO_OBJECT_KEYS`, the two cover pairs for the game cards, the
   seven `*-card` photographs the board's tiles are dressed in (see "Every
   photographed card on the board" below) and `pattern.jpg`, the about card's
   artwork, with its own `-800`/`-1600` pair. The masters those cards were cut
   from are in there beside them, under the names they were uploaded with:
   `football.jpeg`, `basketball.jpg`, `movies-1.jpg`, `flag-1.jpg`,
   `arka-2.jpg`, `arka-3.jpg` and `arka-4.png`. **`arka-1.jpg` — the gilded
   shrine of Tutankhamun — is uploaded but unused**: it arrived with the other
   four on 2026-10-05 and was never given a card. All of it belongs to no event,
   so `parseImageObjectKey()` rejects these keys by design. A stray
   `bce/formation-ofthe-moon.jpeg` (missing hyphen) is superseded by the
   correctly-named copy and is safe to delete; until then every bulk run
   reports it as one skip and exits non-zero.

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
5. **The only game tables are the head-to-head ones, and they are
   ephemeral.** `match`, `match_player`, `match_round` and `match_answer`
   exist because a two-player game cannot be refereed from a browser; they
   hold a match in flight and `versus_sweep()` deletes them afterwards. There
   are still **no solo sessions, no saved scores and no leaderboards**, and
   those should not be added speculatively — a solo set still lives in
   component state and dies with the tab. `event.status` and `category.kind`
   remain as they were: cheap now, awkward to retrofit.

   The one durable player-generated table is `event_date_challenge` (see
   "Writes go through the service role"). It is editorial data rather than
   game state — a report that a date is wrong — which is why it is not swept
   and why it is the exception to the rule above rather than a crack in it.

6. **The admin panel does not exist yet, and there is now something waiting
   for it.** `app/admin/layout.tsx` is still the only thing under `/admin`, so
   every route there 404s. `eventChallengeStats()` in `lib/db/challenges.ts`
   is written, typed and unused: the list of events ranked by how often their
   dates are disputed, which is the first screen that panel wants.

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
`BANDS` is still the one place difficulty is tuned. A `bad` guess decays
hyperbolically rather than scoring zero, so "less hopelessly wrong" still beats
"more hopelessly wrong". This is a different question from `timelineResult`'s
hit/miss, which is about a solo set's percentage and is unchanged.

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
`panDuration`, `VERDICT_COLORS`. Each mode keeps what it *decides*. The split is
why head-to-head looks like the same game rather than a second one, so prefer
moving a shared visual there over copying it.

Two additions worth knowing: `TimelinePaneView` takes an optional
`opponentYear`, drawn as a hollow grey ring rather than a new colour (blue is
the player, green is the truth, and a third hue would make the rail the most
colourful thing on a neutral page); and `RoundCard` takes an `aside` for the
countdown, opposite the round counter. Everything head-to-head adds is an
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
  two empty slots, "coming soon", and the way back. The middle three carry
  photographs.

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

**A dashed edge means a card that cannot be used.** That is why the two cards
that swap the board are *not* `outlined` even though they carry no cover and no
kicker: they are the one live control on the view they sit in, and dressing them
as placeholders would have hidden the only thing on the screen that does
anything. The three empty slots and the "coming soon" card keep the dashes.

**Every card anchors its text to the bottom and wraps rather than truncating.**
That started as a property of the square cards — there is room for a second
line, and a name that needs one grows the block upward into space the card
already has — and the two covers joined them on 2026-10-06. Their titles stood
in the middle of the frame until then, which made them the only cards on the
board whose label was not in the same corner as everybody else's, so the eye
had to find the name twice per row. A `CoverCard` now carries exactly a
`BoardCard`'s three things in the same places: icon chip top left, chip or
arrow opposite, kicker-and-title block at the foot. What is bigger is the type
(`text-3xl sm:text-4xl` against the tiles' `text-lg`), not the arrangement.

It is also why the kicker is optional — the title is the last line either way,
so the titles across a row share a baseline whether or not there is a line
above them. The tiles these replaced were one line tall and had to `truncate`,
which made every new language a measurement; this does not.

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

**The Daily card is the one card with no photograph, so it paints
`.board-mesh`.** Every other card on both views carries one as of 2026-10-06,
and leaving this one bare was asked for: the mode does not exist, and a mesh
says so where a picture would not. The mesh is the bento hero's,
geometry for geometry, but every stop is darkened by about a third — there it
is glimpsed under a photograph, here it is the whole card next to a real one,
and at the bento's values it was the brightest thing on a page whose background
is pure black. The eye went straight to the one card that cannot be played.

**The comparison cover photographs are now unused.** `GAME_COVER_BASE_NAMES`
still holds both pairs and both are still in the bucket; only `guess` is read,
because comparison is a tile with its own single photograph now.

**Every photographed card on the board** goes through `BoardCard`'s `photo`
prop and `boardPhotoUrl()`, which is the one map from card to object key. The
games view's three named cards came first on 2026-10-05; survival and the whole
of the play row followed on 2026-10-06 — 1v1 (`flag-1`), comparison
(`arka-2`), other games (`arka-3`) and survival (`arka-4`). Five things about
them:

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
share less down the page. 1108.8px, so the board, the about card, the bento and
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
  this token, not chosen, and so is the about card's `472px` (its 0.85 share).

## Below the fold: the about card, the bento, the FAQ

Three blocks, in that order, each in
`mx-auto max-w-[calc(var(--board-w)+3rem)] px-6` and each wrapped in its own
`ScrollReveal`. The column *is* `--board-w` plus the padding it carries, so all
three line up with the cards on the first screen and keep lining up when the
board is rescaled. They were `max-w-7xl` until 2026-10-06, which agreed with the
then-77rem board by arithmetic rather than by construction.

The FAQ's wrapper is `pt-40` where its neighbours are `pt-32`: it is plain text
on the page rather than a block of cards, so it has no edge of its own to hold
it off the bento above.

**Each run of empty space belongs to the wrapper, never to the revealed
element.** `ScrollReveal` observes its own box, so padding *inside* it trips the
animation while nothing but blank space is on screen. That is why the spacing
lives on the `max-w-7xl` divs.

**The about card is the one piece of prose on the site.**
`components/about-card.tsx`: the name at the top left, what the game is and how
a round is played, a `Play` button to `/guess` at the foot, and the pattern
artwork as the right-hand column. It is a section rather than a seventh tile on
the board — the board is a grid of names, and prose in a cell that size would
either clip or make every card taller. The name is written in the component,
not translated: it is the product's name, set in the same display face the
masthead uses.

Its artwork is `homepage/pattern.jpg`, a **textile repeat rather than a
photograph**, which is what lets the column crop it hard at any width — there is
no subject in it to clip, so there is no judgement to record about the crop. It
is served at 800/1600 (`aboutArtUrl`), not the backdrops' 1440/2560: the panel
is at most half of `--board-w`. Those two widths were derived with
`npm run backdrops:derive -- --key homepage/pattern.jpg --widths 800,1600` —
**`--widths` is new** and exists for art that is not full-bleed; without it the
script still uses `BACKDROP_WIDTHS`, which stays the one list a *backdrop's*
widths are written in.

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

## The top-right control is a menu, not a language picker

`components/site-menu.tsx` replaced `LanguageSelector`, which is deleted. Three
bars fold into an X and a panel grows out of the corner the button sits in.
Leaderboard, account, sign-in, contact and the tip jar are rows in it that
announce themselves as unavailable — the same holding pattern the home page's
tiles use. **FAQ is the exception**: it is a real `Link` to `/#faq`, the section
at the foot of the home page, and it closes the panel on the way so the menu is
not left sitting over the thing it just scrolled to. `MenuRow` is a `Link` when
it is given an `href` and an `aria-disabled` button when it is not. The language
picker is the other live control inside.

**Off home the button is pinned to the viewport, and that is why it is a sibling
of `SiteHeader` rather than a child of it.** It must not be something you scroll
away from — and the bar deliberately hides on a downward scroll, so a menu
inside it would have gone with it. Being inside was also impossible for a
concrete reason, not just a tidy one: the bar hides by translating itself, and
**a transformed ancestor is the containing block for its `fixed`
descendants**, so the button would still have slid away. It is rendered beside
the header in `app/(public)/layout.tsx` instead.

One `top-7` then places it on every one of those routes. Horizontally it rides a
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

The button is 42px (it was 38px until 2026-10-05) and its bars are 20x14. Those
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

Four things hold that composition up:

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
- **The verdict's colour carries the whole left panel** — border, fill and the
  word — mixed from `VERDICT_COLORS` with `color-mix` rather than picked per
  verdict, so retuning a verdict's colour retunes its panel with it. The
  actual year stays off both panels: it is marked on the rail the camera has
  just flown to, and printing it here as well is two reveals of one answer.

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
relative band there would demand the exact year for anything above "bad".
Whichever of the two is more generous wins. Both sequences are monotonic, so the
bands nest and the first match is the best one. The four tiers print through
`VERDICT_LABEL_KEYS`/`VERDICT_COLORS` in `components/timeline-game.tsx`; three
colours for four tiers is deliberate, since green is already the true answer's
colour and the top two share it. Retuning difficulty means editing `BANDS` and
nothing else.

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
comparison game is right-or-wrong. The date-guessing game's four tiers split
three-to-one exactly as `VERDICT_COLORS` already paints them — `perfect`,
`great` and `good` are hits, only `bad` is a miss. Retuning that means editing
`BANDS` in `lib/game/scoring.ts`, not `MISSED_VERDICT` in `set.ts`.

**The share text is the Wordle shape** — title, score, emoji grid, link — and
the grid spoils nothing: the squares say how well the set went, never which
events came up, so it can be pasted to someone who has not played. Its colours
match the on-screen pips exactly (🟩 for the green tiers, ⬜ for "good", ⬛ for a
miss). The URL is read from `window.location` at click time, because the site
has no domain yet (gap 1) and a baked-in one would be wrong everywhere.
`navigator.share` is tried first and falls back to the clipboard; an
`AbortError` is the player dismissing the sheet and is deliberately silent.

**The summary costs the height budget nothing, because it replaces the round
rather than joining it.** Both game screens are still exactly one viewport and
must not scroll. The panel caps itself at `max-h-full` and scrolls internally on
a window too short for it — verified at 520px, where the panel sits at 472px and
"Play again" stays inside it. The live "n of 10" counter is positioned
absolutely for the same reason: on the photograph in the date-guessing game
(where the verdict already lives), and in the empty top of the upper lane in the
comparison game. **Neither takes a row**, and `--compare-chrome` therefore did
not change.

**The comparison masthead moved from the page into the game.** Its blurb is a
live instruction ("which of the two dates…"), and left on the page it stood over
the finished set asking a question that was no longer on screen — only the game
knows the set is over. The page keeps an `sr-only` `h1` for the outline. The
markup and the space it occupies are unchanged, so the chrome sum still
balances.

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
hand-maintained sum: page padding, header, rail lane, both caption blocks and
borders, column gap, the reserved verdict block. Every row the chrome gains is a
row the pictures lose, so changing any of those sizes without changing the token
either leaves a strip of dead space or puts a scrollbar on a page built not to
have one.

**The two lanes have fixed heights and the cards are anchored to the rail** —
upper lane `items-end`, lower lane `items-start`. That is what pins the rail: a
caption that needs a third line grows the card *away* from the rail, into the
header's margin above or the verdict's gap below, instead of pushing everything
under it down the screen. Verified: a forced three-line name grows the target
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
unreachable from here — gap 1) and refuses any key outside `ALLOWED_PREFIXES`.
`comparison-game/` rendered as a bare gradient until it was added there, and the
failure looks exactly like a missing object.

## Date-guessing backdrops

Each of the five timeline panes has its own full-bleed photograph, under
`date-guessing-game/` in R2 — decorative art belonging to no event, so like the
homepage heroes `parseImageObjectKey()` rejects their keys by design.
`lib/storage/images.ts` maps pane -> base name (`ce` is `common-era2`, the rest
match the pane slug) and the record is total, so a sixth pane will not compile
without a sixth photo.

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
