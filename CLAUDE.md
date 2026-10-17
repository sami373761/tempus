# TEMPUS

A historical date-guessing game. Playable: `/guess` (date guessing), `/compare`
(comparison), `/versus` (head-to-head: friend rooms and online matchmaking).
Accounts, TP scoring, badges, the leaderboard and Chrono Rating (KP, online
only) are live. There is no admin UI yet.

Stack: Next.js 15 (App Router) · TypeScript · Tailwind v4 · Supabase Postgres 17
· Cloudflare R2 · targeted at Vercel.

## Rules for this file

- **Do not add to or edit CLAUDE.md unless I explicitly ask.**
- No session logs, change history, dates, measurements or summaries of finished
  work. This file holds only stable facts: setup, commands, invariants, rules.
- Explain design decisions in code comments, not here.

## Commands

```bash
npm run dev                 # localhost:3000
npm run typecheck           # run before declaring done
npm run build

npm run events:check        # parse the dataset, no DB access — ALWAYS run first
npm run db:seed:events      # upsert events + translations (idempotent on slug)
npm run db:migrate          # apply supabase/migrations/*.sql (supports -- --dry-run)

npm run era:check           # SQL era rule == TS era rule; run after touching either
npm run versus:bot:check    # bot tier mix, grid snap, era rules; run after touching the bot, BANDS or panes
npm run image:attach -- …   # link one R2 object to an event
npm run images:attach -- …  # link a whole R2 prefix, filename == event slug
npm run backdrops:derive -- --prefix <folder>/          # rebuild -1440/-2560 widths
npm run backdrops:derive -- --key <key> --widths 800,1600
npm run images:shrink       # cap event images at 1600px; run LAST, after any attach
npm run images:shrink -- --dry-run --prefix film-dizi/

# Confirmed QA account (no mailbox needed). Writes creds to .env.test.local, never prints them.
node --experimental-strip-types scripts/make-test-account.ts
```

- `npm run db:types` needs the Supabase CLI, which is **not installed**. Hand-edit
  `lib/db/database.types.ts` to match any migration.
- **`npm run build` while `npm run dev` is running breaks the dev server** (every
  route 500s with "Cannot find module"). Not a code error. Recover with
  `pkill -f "next-server|next dev"`, `rm -rf .next`, restart dev.

## Environment

All values live in `.env.local` (gitignored). **Never hardcode or commit
secrets.** `lib/env.ts` is the only module that reads `process.env`.

```
NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY          # server-only, bypasses RLS
SUPABASE_DB_URL                    # direct Postgres, used by scripts/
CLOUDFLARE_ACCOUNT_ID              # NOT R2_ACCOUNT_ID
R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME                     # NOT R2_BUCKET; value: history-images
NEXT_PUBLIC_R2_PUBLIC_BASE_URL
NEXT_PUBLIC_DEV_INVITE_ORIGIN      # optional, LAN origin for versus invites in dev
```

Auth adds no env vars. The Google provider and Site/Redirect URLs are configured
in the Supabase dashboard, not the repo.

## Data

Source: `data/tarihsel_olaylar_500_5_dil.txt`, lines `TR:EN:DE:FR:ES:Date`.
Database: Supabase project `kyxydoaevasuauflrjrl`. Locales: `en, tr, de, fr, es`.

- **Astronomical year numbering.** `event.year` is `bigint`: 1 BCE = 0,
  1000 BCE = -999. Ordering and guess distance are plain integer subtraction —
  never branch on era.
- **Paired SQL/TS rules — change both together:**
  - `event.sort_key` (generated column) ↔ `sortKey()` in `lib/historical-date.ts`
  - `historical_year_label()` ↔ `formatYear()`
  - `era_slug_for_year()` ↔ `eraForYear()` (verify with `npm run era:check`)
  - `normalize_username()` ↔ `normalizeUsername()` in `lib/db/accounts.ts`
  - TP bonus amounts in `lib/game/points.ts` ↔ `scoring.sql` functions/triggers
  - `chrono_tier()` / `chrono_delta()` ↔ `chronoTier()` / `CHRONO_RATING_RULES`
    in `lib/game/chrono-rating.ts`
  - the column grant on `public.match` ↔ `MATCH_CLIENT_COLUMNS` in `lib/game/versus.ts`
- **Eras:** `year <= 0` → `bce`, `1..2026` → `ce`, `> 2026` → `future`. Era
  category links are maintained by a trigger; never write them by hand.
- **An event with no primary image is hidden from the site.** Queries in
  `lib/db/queries.ts` require one by default (`requireImage: false` for editor
  tools). Attaching an image is all it takes to bring an event back.
- **Translations are rows, not columns.** A new language = a `public.locale` row
  + translation rows, no migration.
- **The dataset parser reports, never guesses.** Bad lines surface with line
  numbers. Centuries store the midpoint (`14. yüzyıl` → 1350).
- **Re-seeding reintroduces 3 duplicates** (source lines 380, 387, 449). Delete
  those lines or re-delete the `*-2` slugs after a re-seed.
- Most translations have a `description`; the UI shows Lorem Ipsum as a
  deliberate placeholder only where one is missing.

## Database security

- **Supabase grants ALL to `anon` on every new `public` table.** Every new table
  must revoke default grants and add RLS, then hand back exactly what is needed,
  or it ships world-writable. The migration ledger lives in `internal` for this
  reason.
- **Content is read-only to clients** (published rows only). Content writes go
  through `lib/db/admin.ts` (service role) or `scripts/`.
- **Rule for new client-writable tables:** if the row has an owner the database
  can name (`auth.uid()`), use an RLS policy; otherwise use the service role
  behind a validated Server Action.
  - `profile` → RLS, column-scoped grant on `username` only.
  - `event_date_challenge` → service role only (game is playable signed out).
  - `user_badge_progress`, `score_entry`, `solo_set`, `solo_answer`,
    `chrono_rating_entry` → service role only (players must not award
    themselves points, rating or badges).
  - `reserved_username` (names bots have worn), `match_player`, `match_round`
    → service role only.
- Admin auth is `app_metadata.role = 'admin'`; `app/admin/layout.tsx` is the gate.
- The `event_localized` view uses `security_invoker = true` (PG15+).
- Migrations are append-only; never edit an applied one.

## R2 and images

- Postgres stores keys, never bytes. URL = `${NEXT_PUBLIC_R2_PUBLIC_BASE_URL}/${key}`,
  read only through `publicImageUrl()` — except masked rounds (versus, daily),
  which use `maskedImageUrl()` (`/api/masked-image/<token>`) so the era folder
  never reaches the client before the reveal.
- Event image keys: `<era>/<slug>.<lowercase ext>`. The folder must match the
  event's era (watch BCE events that feel "AD": Confucius, Buddha, Ashoka, birth
  of Jesus = year -3).
- Slugs turn apostrophes and initials into separate segments:
  `caesar-s-gallic-wars`, `u-s-president`. Mismatched filenames are refused,
  never fuzzy-matched; fix with `image:attach --event <slug> --key <key>`.
- **`images:shrink` runs last — after every attach, never before.** Attaching
  demotes the event's current primary and inserts the new key as primary, so a
  bulk attach after a shrink puts the multi-megabyte masters back on the
  download path and leaves the shrunk `-<width>` rows as non-primary orphans.
  Those orphans are invisible (only `is_primary` is ever read) and they block
  the next shrink run on `image_object_unique`; clearing them is a deletion,
  which is the user's call. A 600-900KB result at the 1600px cap is normal
  single-encode output, not a missed row. The master is never touched, and
  backdrops are out of reach by construction — they have no `public.image` row.
- **Attaching:** `--source-url` and `--license` are mandatory. **Never invent an
  attribution** — ask for the real source. The script reads size, type, hash
  and dimensions from R2 bytes; never hand-type them. Valid licenses:
  `PD, PD-US, CC0-1.0, CC-BY-4.0, CC-BY-SA-4.0, CC-BY-3.0, CC-BY-SA-3.0, CC-BY-NC-4.0`.
- Existing images use the Commons site root as `source_page_url`; do not
  synthesise `File:<slug>` URLs, they 404.
- Scripts that list the bucket must skip keys ending in `/` (folder placeholders).
- Decorative art (`homepage/`, `date-guessing-game/`, `comparison-game/`,
  `3d-models/`, `videos/`) belongs to no event; `parseImageObjectKey()` rejects
  it by design.
- **Backdrops: load the derived `-1440`/`-2560` widths, never the master.** Any
  new backdrop needs both. `BACKDROP_WIDTHS` in `lib/storage/images.ts` is the
  one list. Pane → photo mapping lives only in that file.
- **A new R2 prefix or extension must be added to the dev proxy**
  (`app/api/r2/[...key]/route.ts`, `ALLOWED_PREFIXES`/`ALLOWED_EXTENSIONS`), or
  it fails exactly like a missing object. A new event-image prefix also goes in
  `EVENT_IMAGE_PREFIXES` in `lib/storage/masked-image.ts`.
- **r2.dev is unreachable from the owner's network and from the sandbox.**
  Settled — do not re-raise or recommend fixes. Report "r2.dev is unreachable"
  and move on. Verify objects via the S3 API instead. When a custom domain
  arrives, only `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` changes.

## Game logic

- **Scoring:** `gradeGuess()` in `lib/game/scoring.ts` is the only place a guess
  is graded — by relative error against the event's age, with a floor in years.
  Tune difficulty only via `BANDS`. Tiers: `wayOff → bad → good → great → perfect`
  (`perfect` = exact year only). `roundPoints()` derives points from the same grade.
- Tier labels and colours live only in `lib/game/verdict-style.ts`.
- `versus_seat_result()` in SQL names `'wayOff'`; renaming a tier needs a migration.
- **Sets of ten:** rules in `lib/game/set.ts`. Never inline 10 — use
  `QUESTIONS_PER_SET`.
- **TP:** tier → TP in `lib/game/points.ts`; the ledger is `score_entry`
  (idempotent on `source`). Badge rules only in `lib/game/badge-rules.ts`.
- **Solo rounds are masked:** deals return `DealtEvent` + signed token, the year
  comes only from `app/actions/scoring.ts` reveals. Never send a year in a deal.
- **Round queue:** refill to `ROUND_QUEUE_TARGET` (3), server deals
  `ROUND_QUEUE_DEPTH` (2). Keep them different — equal values reintroduce a
  dead "Next round" button on question 2.
- **Advance buttons are never `disabled`**; a press with nothing queued is
  latched and played when a round arrives.
- Refill effects key on queue length and need an explicit `refillAttempt`
  retry. `randomEvents` returns timeline order — always shuffle before dealing.
- A `"use server"` module may export only async functions; shared constants go
  in `lib/game/rounds.ts`. `tsc` won't catch this, only the bundler.
- `components/timeline-stage.tsx` holds visuals shared by solo and versus —
  move shared visuals there rather than copying.

## Head-to-head (versus)

- **Postgres is the referee.** All match transitions happen in plpgsql under
  `select ... for update`; `versus_reconcile()` runs at every entry point.
- **`public.match` is the only client-readable table**, through a column grant
  (Realtime honours it): no invite `code`, names or ratings — those reach the
  two seats only in their server-built `MatchView`. Never grant a column that
  would help the opponent mid-round. `match_round.event_id` is the answer —
  clients only get a `MaskedEvent` (no description or real image key).
- The countdown is displayed, never kept. `serverNow` must come from
  `public.versus_db_now()` (Postgres clock), not `Date.now()`.
- Deadline prompts retry (`PROMPT_RETRY_MS`); never latch a request before it is
  known to have succeeded.
- A seat is a bearer token in `sessionStorage` (per tab). Presence is advisory,
  and off in online matches.
- **Online matches** (`is_public`): history mode only (`PUBLIC_VERSUS_MODE`),
  no rematch and no TP — only KP. Accounts need a username; guests store
  nothing and play the lower league.
- **A bot is a seat with no browser.** `versus_seat_bot` stores its whole plan
  (from `lib/game/versus-bot.ts`) on `match_round`; `versus_reconcile()`
  commits each guess at `bot_commit_at`. No worker, cron or socket server: the
  client heartbeat `app/api/versus/tick/route.ts` drives reconcile. It is a
  Route Handler because Server Actions run one at a time per client.
- **A bot must be indistinguishable from a person.** `match_player.bot_level` is
  the only place a bot is named; nothing a client sees may differ between the
  two. Bot guesses must sit on the timeline drag grid (`snapToRail`) and be
  graded by `gradeGuess`.
- The tick and `api/masked-image/` routes stay outside the middleware matcher;
  they are authorised by tokens, not the session.
- Invite URLs come from `window.location`; on localhost use
  `NEXT_PUBLIC_DEV_INVITE_ORIGIN` and add the LAN address to `allowedDevOrigins`.
  Recipe: `docs/VERSUS_IMPLEMENTATION_CHECKPOINT.md`.
- `lib/qr.ts` is a hand-written QR encoder; don't replace it with a hosted generator.

## Accounts

- Supabase Auth (email/password + Google). `public.profile` holds the username;
  its `chrono_rating` is written only by the match-settlement trigger.
- **Every auth write is a Server Action**, never a browser Supabase call. Call
  `redirect()` outside the try/catch.
- Failures are `AuthErrorCode`s translated via the dictionary, never Supabase's
  English messages.
- Gate: `PROTECTED_PREFIXES` in `lib/auth/paths.ts`, enforced by `middleware.ts`
  and `requireAccount()` in each page. `safeNextPath()` validates `next`.
- Profiles are created by the `handle_new_user()` trigger, not the sign-up code.
- `app/auth/callback/route.ts` must stay a Route Handler and outside the
  middleware matcher. Its origin comes from the request `Host`, not env.
- `hasPasswordIdentity()` decides the password form's shape and is re-checked
  server-side in `updatePassword`.
- Badges are one 6-rung ladder; `refreshBadges()` recomputes them and never
  clears `unlocked_at`. Worn badge: `profile.worn_badge`, else highest.

## UI invariants

- **`/guess` and `/compare` are exactly one viewport and must never scroll.**
  Re-check 0px overflow after any type, spacing or chrome change.
  `--site-bar-h` is the only way to change the bar height; `--compare-chrome` is
  a hand-maintained sum that must be updated with any chrome change.
- **`<body>` must stay transparent** — the page colour lives on `html`, or
  `-z-10` backdrops are hidden.
- **Font:** Inter only, via `next/font` with `latin-ext`. Keep the
  `--font-sans` token name and the `--font-display` token + `font-display`
  utilities (they mark titles; don't "clean them up"). Every `var()` in a font
  stack must resolve.
- **Palette:** tokens in `@theme` in `app/globals.css`, ordered by lightness
  (`page < card < card-raised < hairline`); greys are tuned for contrast ratio
  against pure black. Retune `public/event-placeholder.svg` alongside them.
  The five `--color-tier-*` tokens are the verdict ladder. Blue is only the
  focus ring and the `perfect` tier.
- **Intentional exceptions — don't remove:** the amber `#f5a623` (bento sun,
  contact block), metal badge swatches, coloured per-era washes in
  `components/timeline-backdrop.tsx`.
- **Crossfades:** only the incoming layer animates; the outgoing one stays opaque
  underneath (and is released after `FADE_MS`).
- Hidden-but-mounted UI (menu panel, inactive board view, closed pills) must be
  `inert`.
- Respect `prefers-reduced-motion` everywhere; infinite motion stops outright.
- `--board-w` sets the home board's scale and the below-the-fold column width;
  `CARD_HEIGHT` keeps both board views aligned. Write Tailwind class names out in
  full (no interpolation like `` md:grid-cols-${n} ``).
- Images use plain `<img>`; `next/image` is not used.
- `CONTACT_EMAIL` lives in `lib/contact.ts` and is a placeholder; it is not a
  dictionary entry.
- New dictionary keys must exist in all five languages (`Dict` derives from English).

## Known gaps

1. No custom domain yet (r2.dev unreachable; see above).
2. 236 of 497 events have no image and are hidden. Stray malformed objects in the
   bucket (old `ce/` copies, `bce/formation-ofthe-moon.jpeg`,
   `ce/ashoka-adopts-buddhism.jpeg`) are safe to delete — never attach them.
3. Only era categories exist; no topic tags.
4. Solo reveals are server actions, queued behind pending deals; latency is
   high in dev because the DB is in ap-southeast-2.
5. No admin UI. `eventChallengeStats()` is ready for its first screen.
6. Google sign-in needs the provider enabled in the Supabase dashboard; the
   Google-only "set a password" path is untested.
7. Sign-ups need custom SMTP before launch (built-in sender is rate-limited).
   Use `make-test-account.ts` for testing; `@example.com` is rejected.
8. `/contact` is a scaffold; the tip jar has no payment route.
9. `homepage/movies-1.jpg` and the coming-soon master are unlicensed film stills
   — settle rights before going public.
10. The service-role key and R2 secret were exposed in a chat; rotate both.
11. Solo deals still use `publicImageUrl()`, so the era folder shows in the
    image URL; versus and daily are masked.
12. `versus_sweep()` has no caller; ended matches pile up until it is run.

## Conventions

- Comments explain *why*, not what.
- Verify before claiming done: `npm run typecheck`; for schema work use
  `--dry-run` or a throwaway Postgres.
- `server-only` marks modules that must never reach the client
  (`lib/db/admin.ts`, `lib/storage/r2.ts`, `lib/auth/*`).
- **Inside `lib/`, imports are relative with an explicit `.ts` extension** (no
  `@/`), so `scripts/` can run them under plain node. App code uses `@/`.