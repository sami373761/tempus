# Tempus

Foundation for a historical date-guessing game. ~1,000 historical events, each
with multilingual text, tags, and one primary image stored in Cloudflare R2.

    
**Scope of this commit:** schema, data access, storage and auth layers only. No
game, no admin UI.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind CSS v4 · Supabase Postgres ·
Cloudflare R2 · deployed on Vercel.

## Getting started

```bash
npm install
cp .env.example .env.local        # fill in Supabase + R2 values
npm run dev
```

Apply the schema. `scripts/migrate.ts` needs no CLI install — just
`SUPABASE_DB_URL` in `.env.local`:

```bash
npm run db:migrate -- --dry-run   # list pending migrations
npm run db:migrate                # apply them, tracked in schema_migrations
```

Each file runs in a transaction and is recorded with its checksum in
`internal.schema_migrations`, so re-running applies only what is new and warns if
an already-applied file has been edited. The ledger lives in `internal` rather
than `public` because PostgREST exposes `public`, and Supabase grants `anon` all
privileges on new tables there by default.

The Supabase CLI path works too, and is what you want for local development
(`supabase start`, then `supabase db reset` applies migrations plus
`supabase/seed.sql`):

```bash
supabase link --project-ref <your-project-ref>
supabase db push
npm run db:types                  # regenerate lib/db/database.types.ts
```

## Importing the dataset

`data/events.txt` holds one event per line, six colon-separated fields:

```
TR Name : EN Name : DE Name : FR Name : ES Name : Date
```

`scripts/__fixtures__/events.sample.txt` is a working example of every accepted
date form. Recognised dates:

| Input | Stored `year` | `precision` |
| --- | --- | --- |
| `MÖ 4.540.000.000` | `-4539999999` | `year` |
| `MÖ 1754` | `-1753` | `year` |
| `MÖ 5. yüzyıl` | `-449` (450 BCE, century midpoint) | `century` |
| `14. yüzyıl` | `1350` | `century` |
| `MÖ 3. binyıl` | `-2499` | `millennium` |
| `4 Eylül 476` | `476`, month `9`, day `4` | `day` |
| `Temmuz 1914` | `1914`, month `7` | `month` |
| `1969-07-20` | `1969`, month `7`, day `20` | `day` |
| `1453` | `1453` | `year` |

`MÖ`/`MS` set the era (`BCE`/`CE`/`BC`/`AD` also work); a bare year is CE. Dots
are digit-group separators, *except* in `5. yüzyıl` where the dot is an ordinal
marker — the century and millennium forms are matched first for that reason.
`yaklaşık`/`circa` qualifiers are dropped, since `precision` already records
how exact a value is.

Anything that does not match is **reported and skipped, never guessed at** — a
silently mis-dated event is worse than a missing one, because the game would
teach it as fact.

```bash
npm run events:check              # parse report only, no database access
npm run db:seed:events -- --dry-run
npm run db:seed:events            # upsert as published, keyed on slug
npm run db:seed:events -- --status draft
```

Seeding is idempotent: it upserts on `event.slug`, so re-running updates rows in
place. Era categories are assigned by trigger as rows land, so seeding never has
to think about them.

Images are attached separately, once the file is in R2:

```bash
npm run image:attach -- --event <slug> --key ce/<filename>.webp \
  --source-url https://… --license CC-BY-4.0 [--author …] [--primary] [--dry-run]
```

Byte size, MIME type, SHA-256 and pixel dimensions are read from the object in
R2, never from flags, so they cannot drift from the stored file.
`--source-url` and `--license` are mandatory: `image.source_page_url` and
`image.license_code` are `NOT NULL`, so every image records its provenance.

## Layout

```
app/
  layout.tsx            root shell
  (public)/             public routes — URL-neutral route group
    page.tsx            placeholder homepage / connection check
  admin/
    layout.tsx          requireAdmin() gate for future admin routes
lib/
  env.ts                the only module that reads process.env
  historical-date.ts    BCE/CE conversion, formatting, sorting, scoring math
  db/
    database.types.ts   generated (npm run db:types) — mirrors the schema
    types.ts            stable domain types the app imports
    client.ts           browser client (anon key, RLS enforced)
    server.ts           RSC / route handler client (anon key + auth cookies)
    admin.ts            service-role client — bypasses RLS, server-only
    queries.ts          read queries against the event_localized view
  storage/
    images.ts           object-key and public-URL helpers (client-safe)
    r2.ts               R2 writes + presigned uploads, server-only
  auth/
    server.ts           getCurrentUser / requireUser
    admin.ts            isAdmin / requireAdmin
middleware.ts           refreshes the Supabase auth cookie
scripts/
  db.ts                 connection helper + .env.local loader
  migrate.ts            applies supabase/migrations, tracked by checksum
  parse-events.ts       dataset parser (dates, slugs, 5 locales)
  check-events.ts       parse report, no database access
  seed-events.ts        upserts parsed events + translations
  image-probe.ts        pixel dimensions from image header bytes
  attach-image.ts       links an R2 object to an event, with provenance
  __fixtures__/         sample dataset covering every accepted date form
supabase/
  migrations/           ordered, idempotent-where-safe SQL
  seed.sql              local dev sample data only
```

## Environment variables

See `.env.example`. `NEXT_PUBLIC_*` values ship to the browser and are safe
because reads are constrained by RLS. `SUPABASE_SERVICE_ROLE_KEY` and the
`R2_*` credentials are server-only — `lib/env.ts` throws if they are read in a
browser context, and `lib/db/admin.ts` / `lib/storage/r2.ts` are marked
`server-only` so bundling them into client code is a build error.

## Schema

Eight tables, one view. `supabase/migrations/20261002120000_init_schema.sql`.

```
locale ──┬── event_translation ──── event ──┬── event_category ──── category ──── category_translation
         └── category_translation           └── image ──── license
```

### Dates: astronomical year numbering

`event.year` is a signed **bigint** in astronomical year numbering, which has a
year zero:

| historical | stored `year` |
| ---------- | ------------- |
| 4.54 billion BCE | `-4539999999` |
| 1000 BCE   | `-999`        |
| 500 BCE    | `-499`        |
| 1 BCE      | `0`           |
| 1 CE       | `1`           |
| 1000 CE    | `1000`        |

The range is constrained to `-15000000000 .. 3000`, so the dataset reaches the
formation of the Earth without losing the typo protection a bounded column
gives. The derived `sort_key` peaks around 1.5e14 — four orders of magnitude
inside bigint, and still exact as a JS number (`Number.MAX_SAFE_INTEGER` is
~9.0e15), so no BigInt handling leaks into the application code.

Because there is no gap at the BCE/CE boundary, ordering, range filters and
"how far off was the guess" are all plain integer arithmetic — no branch on era
anywhere in the game logic. `1 BCE` to `1 CE` is `|0 - 1| = 1` year, which is
historically correct.

`event.sort_key` is a stored generated column, `year * 10000 + month * 100 +
day` with unknown parts collapsing to January 1. It is monotonic across the
whole timeline, indexed, and mirrored exactly by `sortKey()` in
`lib/historical-date.ts` so client-side sorting matches the database.
`formatYear()` switches to natural scale past a million — "4.54 billion BCE",
not "4540000000 BCE".

`event.precision` (`day` | `month` | `year` | `decade` | `century` |
`millennium`) records how exact the date actually is. A check constraint keeps
the stored parts consistent with it, so a year-only event can never claim a
day, and the UI never renders false precision.

### Translations: rows, not columns

`event_translation` is keyed `(event_id, locale_code)` with `name` and
`description`. Adding a sixth language is one `INSERT` into `public.locale`
plus translation rows — no migration. Adding a new translatable field is one
column here. `locale.fallback_code` records the fallback chain;
`lib/db/queries.ts` fetches the requested locale and the default together and
prefers the requested one per event. Categories are translated the same way via
`category_translation`.

### Images: R2 object keys, never bytes

`image` stores `r2_bucket` + `r2_object_key` and nothing binary. Keys are
`events/<event-slug>/<image-id>.<ext>`, built by `buildImageObjectKey()`, so a
re-upload never collides and the key is stable. Public URLs are
`${NEXT_PUBLIC_R2_PUBLIC_BASE_URL}/${r2_object_key}` — images are served
straight from Cloudflare and never proxied through Next.js.

Provenance travels with the row: `source_name`, `source_page_url` (required),
`author`, `license_code` (FK to a normalized `license` table) and
`attribution_text`. An event may have several images; a partial unique index
guarantees at most one `is_primary` per event.

### Era categories

Every event carries exactly one `kind = 'era'` category, derived from its year:

| year | slug |
| --- | --- |
| `<= 0` | `bce` |
| `1 .. 2026` | `ce` |
| `> 2026` | `future` |

The boundary is `<= 0`, not `< 0`: astronomical year 0 is historically 1 BCE.
The numbering carries a year zero so arithmetic crosses the era boundary without
a gap, but the era of that year is still BCE.

Slugs are ASCII because they double as R2 folder prefixes. The rule is
`public.era_slug_for_year(bigint)` in SQL and `eraForYear()` in
`lib/historical-date.ts` — mirrored deliberately, change both together. An AFTER
trigger on `insert or update of year` keeps the `event_category` link correct, so
era is never written by hand; it only touches `kind = 'era'` links, leaving
topical categories alone.

Image object keys follow the same split: `<era>/<filename>.<ext>`, for example
`bce/code-of-hammurabi.webp` or `ce/beginning-of-world-war-ii.webp`.
`buildImageObjectKey()` derives the folder from the event's year, and
`scripts/attach-image.ts` refuses any key whose folder contradicts it.

`npm run era:check` asserts the SQL and TypeScript rules agree across every
boundary, and that no stored link contradicts them. Run it after changing either.

The bucket holds three zero-byte placeholder objects (`bce/`, `ce/`, `future/`) —
how R2 represents empty folders. `parseImageObjectKey()` rejects them, but any
script that lists the bucket must skip keys ending in `/`.

### Read model

The `event_localized` view flattens event + one locale's text + the primary
image into one row, so the game's main query is a single indexed, ordered
select. It uses `security_invoker`, so the caller's RLS still applies.

### Security

RLS is on for every table. `anon` and `authenticated` may read reference data
and `status = 'published'` content only; drafts and all writes are reachable
only through the service-role client. Table privileges are narrowed to `SELECT`
as well (`20261002120300_harden_grants.sql`), so a write needs *both* a grant and
a policy to be opened deliberately — Supabase's default privileges otherwise
hand `anon` full DML on every new table in `public`. Admin authorization is a Supabase
`app_metadata.role = 'admin'` claim, which cannot be self-assigned.

## Intentionally not built yet

No game-session, score or leaderboard tables; no admin UI; no i18n routing.
`event.status` and `category.kind` exist because they are cheap now and
awkward to retrofit.
