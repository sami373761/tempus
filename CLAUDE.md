# TEMPUS

A historical date-guessing game. Playable: `/guess` (date guessing), `/compare`
(comparison), `/versus` (head-to-head: friend rooms and online matchmaking).
Accounts, TP scoring, badges, the leaderboard and Chrono Rating (KP, online
only) are live. An admin panel lives at a secret path (`ADMIN_SEGMENT` in
`lib/admin/path.ts`); the path itself is never written into this file.

Stack: Next.js 15 (App Router) · TypeScript · Tailwind v4 · Supabase Postgres 17
· Cloudflare R2 · one Oracle Cloud VM behind Caddy (runbook: `docs/SERVER.md`).

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
npm run backdrops:derive -- --prefix <folder>/          # rebuild -1440/-2560 widths (.jpg + .webp)
npm run backdrops:derive -- --key <key> --widths 800,1600
npm run art:webp            # .webp twin of every decorative art key (from its .jpg, no resample)
npm run images:shrink       # event images -> WebP, 1600px cap, from the master; run LAST, after any attach
npm run images:shrink -- --dry-run --prefix film-dizi/

npm run admin:check         # admin SQL functions/contract against the DB; run after any migration
npm run admin:parity        # built-in game_category rows == the code's constants (read-only)
npm run admin:test          # admin functions on a throwaway Postgres (scripts/admin-test-db/, localhost only)
npm run versus:sweep        # clear ended matches (versus_sweep())

# Confirmed QA account (no mailbox needed). Writes creds to .env.test.local, never prints them.
node --experimental-strip-types scripts/make-test-account.ts
# Admin account: --create | --reset-mfa <u> | --reset-password <u> | --revoke <u>.
# --create writes the credentials into docs/admin/LOKAL_KURULUM.md §2 — never commit that file with them.
node --experimental-strip-types scripts/make-admin.ts --create
```

- `npm run db:types` needs the Supabase CLI, which is **not installed**. Hand-edit
  `lib/db/database.types.ts` to match any migration.
- **`npm run build` while `npm run dev` is running breaks the dev server** (every
  route 500s with "Cannot find module"). Not a code error. Recover with
  `pkill -f "next-server|next dev"`, `rm -rf .next`, restart dev. Production
  builds are made in a separate copy of the repo for this reason.
- `SUPABASE_DB_URL`'s direct host is IPv6-only; `scripts/db.ts` falls back to the
  ap-southeast-2 session pooler on its own.

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
NEXT_PUBLIC_R2_PUBLIC_BASE_URL     # dev: /api/r2 proxy; production: the real R2 public origin
NEXT_PUBLIC_DEV_INVITE_ORIGIN      # optional, LAN origin for versus invites in dev
RESEND_API_KEY, MAIL_FROM          # account mail (lib/mail/send.ts); optional, see Accounts
```

`NEXT_PUBLIC_*` values are baked in at build time, so the production build needs
the production values (see `docs/SERVER.md`): `/api/r2` answers 404 when
`NODE_ENV=production`.

The Google provider (Google Cloud project `tempus-oauth-512512`, published) and
Site/Redirect URLs are configured in the Supabase dashboard, not the repo.

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
  - the pool/draw rules in `random_events()` (every draw, one round trip) ↔
    `poolRestriction()` and `RandomEventsOptions` in `lib/db/queries.ts`
  - `assert_game_name()` ↔ `CORE_GAMES` / `isCategoryGameName()` in `lib/game/points.ts`
  - `panes_year_bounds()` / `panes_problem()` ↔ `paneYearRange()` / `panesProblem()`
    in `lib/game/auto-bands.ts`
  - built-in `game_category` rows ↔ `lib/game/builtin-categories.ts`
    (`npm run admin:check` and `npm run admin:parity` verify)
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
  - `event_date_challenge` → service role only. Voting needs an account: one vote
    per account per event per year (`year_at_vote` is stamped by a trigger, so
    a corrected year opens voting again). Older anonymous rows are `is_legacy`.
  - `user_badge_progress`, `score_entry`, `solo_set`, `solo_answer`,
    `chrono_rating_entry` → service role only (players must not award
    themselves points, rating or badges).
  - `reserved_username` (names bots have worn), `match_player`, `match_round`
    → service role only.
  - `admin_audit`, `admin_login_attempt`, `event_challenge_review` → service
    role only. `game_category*` → published rows readable; writes only through
    the `admin_*` functions.
- **Admin auth:** `app_metadata.role = 'admin'` **and** an `aal2` session (TOTP)
  **and** 30 minutes idle at most — `requireAdmin()` / `requireAdminPage()` in
  `lib/auth/admin.ts`. Every export in `app/actions/admin/` starts with
  `await requireAdmin()`; `admin_*` SQL is reached only through
  `lib/db/admin/rpc.ts` (service role). Every admin write is logged to
  `admin_audit`. `/admin` is a 404.
- Seed scripts skip rows with `event.admin_edited_at` (`scripts/seed-guard.ts`):
  the panel's edits survive a re-seed.
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
  which is the user's call. It encodes WebP from the **master** (never from an
  earlier derivative) and re-points the primary row at `<base>-<edge>.webp`;
  rows already WebP/AVIF inside the cap are skipped. The master is never
  touched, and backdrops are out of reach by construction — they have no
  `public.image` row.
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
- **Decorative art is served as `.webp`** (`ART_EXTENSION`). The `.jpg`
  derivative of the same name stays in the bucket as the source
  `art:webp` encodes from — format change only, same pixels. Every art key the
  site loads must be reachable from `decorativeArtKeys()`, or it gets no WebP.
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
  Tune the date game's difficulty only via `BANDS`; subject categories carry
  their own bands in `game_category.bands` (auto-derived, `lib/game/auto-bands.ts`). Tiers: `wayOff → bad → good → great → perfect`
  (`perfect` = exact year only). `roundPoints()` derives points from the same grade.
- Tier labels and colours live only in `lib/game/verdict-style.ts`.
- `versus_seat_result()` in SQL names `'wayOff'`; renaming a tier needs a migration.
- **Sets of ten:** rules in `lib/game/set.ts`. Never inline 10 — use
  `QUESTIONS_PER_SET`.
- **TP:** tier → TP in `lib/game/points.ts`; the ledger is `score_entry`
  (idempotent on `source`). Badge rules only in `lib/game/badge-rules.ts`.
- **Solo rounds are masked:** deals return `DealtEvent` + signed token, the year
  comes only from `app/actions/scoring.ts` reveals. Never send a year in a deal.
- **Round clocks:** solo games (and the daily) use `SOLO_ROUND_SECONDS` in
  `lib/game/rounds.ts`; versus uses `ROUND_SECONDS` in `lib/game/versus.ts`,
  stamped per match. Bot think windows must close inside `ROUND_SECONDS`
  (`versus:bot:check` asserts it).
- **Round queue:** refill to `ROUND_QUEUE_TARGET` (3), server deals
  `ROUND_QUEUE_DEPTH` (2). Keep them different — equal values reintroduce a
  dead "Next round" button on question 2.
- **Shared reads are cached** in `lib/db/cached.ts` (`unstable_cache`: public
  boards 60s, daily questions 1h); per-player reads (ranks, attempts) stay
  live. Reference data (badge catalogue, `kind = 'other'` category links,
  settled daily challenges) is memoised per process. `next/cache` never goes
  in modules `scripts/` imports.
- Solo refills go through `POST /api/deal` (`lib/game/deal.ts`), never a Server
  Action: actions run one at a time, and a reveal must not queue behind a deal.
- **Advance buttons are never `disabled`**; a press with nothing queued is
  latched and played when a round arrives.
- Refill effects key on queue length and need an explicit `refillAttempt`
  retry. `randomEvents` returns timeline order — always shuffle before dealing.
- A `"use server"` module may export only async functions; shared constants go
  in `lib/game/rounds.ts`. `tsc` won't catch this, only the bundler.
- `components/timeline-stage.tsx` holds visuals shared by solo and versus —
  move shared visuals there rather than copying.

## Daily play limit

- **The subject games are three a day, one for a guest**; date guessing,
  comparison and survival are unlimited. Limited = the built-in `LIMITED_GAMES`
  plus every panel-made subject category (`isLimitedGame`, `limitedGamePath`).
  The rules and both numbers live only in `lib/game/play-limit.ts` — SQL takes
  the limit as a parameter, so there is no second copy to keep in step.
- **A game is spent by its first graded round, not by the deal.** Enforced in
  `revealDateRound`, which a client cannot skip: opening the page and leaving
  costs nothing, quitting mid-set costs the game.
- **A member's games are `solo_set` rows**, read by `game_play_standing()`;
  there is no table of the limit's own. A set id is the client's, so counting
  claims by it is unlimited play — what bounds it is the set closing at
  `QUESTIONS_PER_SET`. A round already in `solo_answer` is always replayable:
  a retried reveal is a lost reply, not a second game.
- **A guest's games are the `tempus_plays` cookie** (`lib/game/play-ledger.ts`)
  and therefore soft; the sign-up notice is the answer to that, not a stricter
  store. Reads never write it — `readAllowance` runs during a render.
- The day is the daily's day (midnight UTC, `playDay`). Two gates: the page
  refuses to deal, and `usePlayLimit` replaces the game when a reveal comes
  back `play-limit`. Both draw `PlayLimitPanel`.

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
  no rematch and no TP — only KP. **Signed-in accounts only**, with a
  username: `findVersusOpponent` refuses a guest (`needs-account`) and the
  online card links to sign-in instead. Friend rooms stay open to guests.
  Bots therefore never sit down as "Guest".
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
- **Identity is read locally.** `getCurrentUser()` (and the middleware) use
  `getClaims()` — ES256 signature checked against the project's JWKS, no round
  trip — and are `cache()`d per render. `getVerifiedUser()` (`getUser()`, a
  network call) only where a revoked session must not pass or `identities` is
  needed: password changes, the account page's password form, the admin gate.
- Profiles are created by the `handle_new_user()` trigger, not the sign-up code.
- **Account mail is ours, not Supabase's.** `auth.admin.generateLink` mints the
  token (sends nothing); `lib/mail/` sends a localized mail via Resend. Links
  land on `/verify`, where a button POST spends the token (mail scanners must
  not). Resets continue on `/reset-password`, gated by the signed
  `tempus_recovery` cookie (`lib/auth/mail-guard.ts`) — a recovery session is
  `amr: otp` like any other, so the session alone must never allow a
  password change without the current one. Sends are throttled in process
  memory (one Node process). Without `RESEND_API_KEY`: production falls back
  to Supabase's sender (team addresses only); dev auto-confirms sign-ups and
  logs reset links to the console.
- `providerRefuses()` probes Google with GET: Supabase's authorize endpoint
  answers every HEAD with 405.
- **`/privacy` (`lib/privacy.ts`) describes what the code does** — cookies,
  processors, what is public, that a deleted account's photo is deleted. A new
  cookie, tracker or provider means updating it and `PRIVACY_UPDATED`. Google's
  consent screen links to it.
- `app/auth/callback/route.ts` must stay a Route Handler and outside the
  middleware matcher. Its origin comes from the request `Host`, not env.
- `hasPasswordIdentity()` decides the password form's shape and is re-checked
  server-side in `updatePassword`.
- Badges are one 6-rung ladder; `refreshBadges()` recomputes them and never
  clears `unlocked_at`. Worn badge: `profile.worn_badge`, else highest.
- Badge pages call `measureBadges()` before render and `saveBadges()` in
  `after()`. A set's last reveal does not refresh badges: it returns
  `badgesPending`, and the summary fetches `POST /api/set-badges`.

## UI invariants

- **`/guess` and `/compare` are exactly one viewport and must never scroll.**
  Re-check 0px overflow after any type, spacing or chrome change.
  `--site-bar-h` is the only way to change the bar height; `--compare-chrome` is
  a hand-maintained sum that must be updated with any chrome change.
- Each solo game route's `loading.tsx` repeats its `page.tsx` frame class
  verbatim (`GameLoading`); change the two together.
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
- **The home explorer never loads the 3D coin under `md`.** Phones open on
  the date-guessing pill and closing folds the stage away; the coin is
  desktop-only (`components/home-explorer.tsx`).
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
2. Many events have no primary image and are hidden. Stray malformed objects in the
   bucket (old `ce/` copies, `bce/formation-ofthe-moon.jpeg`,
   `ce/ashoka-adopts-buddhism.jpeg`) are safe to delete — never attach them.
3. Only era categories exist; no topic tags.
4. The DB is in ap-southeast-2, far from the players: every round trip shows.
   Moving regions is deferred.
5. The admin panel's code is on the `admin-panel-web` branch, not yet merged into
   `main`, while the live database already has its migrations — `main`'s guest
   date-challenge votes are refused by the new schema. Test list and open items:
   `docs/admin/LOKAL_KURULUM.md` §7 and §10.
6. The Google-only "set a password" path is untested. The consent screen names
   the supabase.co domain; that stays (fixing it is paid — everything stays on
   free tiers).
7. Email sign-ups are not confirmed, by decision: "Confirm email" is off in the
   Supabase dashboard, so `signUp` returns a session. No mail sender is set up
   (Resend would need `RESEND_API_KEY`/`MAIL_FROM`), so password reset is
   hidden in production (`canReset`). Accepted trade-off: anyone can register
   someone else's address, and Supabase links a later Google sign-in with that
   email to the same account. `@example.com` is rejected.
8. `/contact` is a scaffold; the tip jar has no payment route.
9. `homepage/movies-1.jpg` and the coming-soon master are unlicensed film stills
   — settle rights before going public.
10. The service-role key and R2 secret were exposed in a chat; rotate both.
11. Solo deals still use `publicImageUrl()`, so the era folder shows in the
    image URL; versus and daily are masked.
12. `versus_sweep()` has no scheduled caller (`npm run versus:sweep` exists; no
    cron on the server yet); ended matches pile up until it is run.
13. Production is plain HTTP on the server's IP until a domain is connected;
    don't sign in to the admin panel over it. Open steps: `docs/SERVER.md`.

## Conventions

- Comments explain *why*, not what.
- Verify before claiming done: `npm run typecheck`; for schema work use
  `--dry-run` or a throwaway Postgres.
- `server-only` marks modules that must never reach the client
  (`lib/db/admin.ts`, `lib/storage/r2.ts`, `lib/auth/*`).
- **Inside `lib/`, imports are relative with an explicit `.ts` extension** (no
  `@/`), so `scripts/` can run them under plain node. App code uses `@/`.