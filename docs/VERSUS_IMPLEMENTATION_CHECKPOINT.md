# Head-to-head (versus) — implementation checkpoint

Date: 2026-10-05 · Status: **feature complete and verified end to end in dev**;
not production-hardened (see checklist).

Scope as built: two-player real-time play for the **date-guessing game only**.
The comparison game is untouched, by design.

---

## What has been implemented

- Invitation flow at `/versus` → `/versus/<code>`: shareable link, WhatsApp
  share, QR code, 6-character match code.
- Lobby with per-seat join/ready state; the match starts only when **both**
  players press ready.
- 10 rounds × 20-second limit, with a server-stamped deadline.
- Round closes as soon as **both** players answer, or when the deadline passes.
- "Waiting for your opponent" state with animated dots; the player who has
  answered cannot answer again and still sees the remaining time.
- Synchronized round result: both guesses, both verdicts, both point totals,
  the true year, plus each player's elapsed time. Opponent's guess is drawn on
  the rail as a hollow grey ring; the answer stays green.
- Auto-advance after a 6-second reveal window (server-stamped, so both clients
  leave the result together).
- Final match screen: winner/draw, final score, per-round pips, rounds won,
  Play Again / Share Result / Back to Home.
- Rematch: request → opponent sees an accept/decline modal → accepted rematch
  restarts on the **same** match row and the same invite link.
- Full i18n across all five locales (en, tr, de, fr, es) — 54 new keys.

---

## Important files

**New**

| File | Role |
| --- | --- |
| `supabase/migrations/20261005120000_versus_matches.sql` | Tables, state machine, RLS, grants, realtime publication |
| `lib/game/versus.ts` | Pure shared rules, `MatchView`/`MaskedEvent` types, row→view merge, history parsing |
| `lib/db/matches.ts` | Service-role data access (create/join/submit/rematch/build view) |
| `app/actions/versus.ts` | Server Actions — the only public surface |
| `lib/realtime/match-channel.ts` | Supabase Realtime subscription + presence |
| `lib/qr.ts` | Self-contained QR encoder (byte mode, EC M, versions 1–10) |
| `components/timeline-stage.tsx` | Shared stage extracted from the solo game |
| `components/versus-game.tsx` | The orchestrator: state, clock, rounds, results |
| `components/versus-lobby.tsx`, `versus-start.tsx`, `round-timer.tsx`, `qr-code.tsx` | UI |
| `app/(public)/versus/page.tsx`, `app/(public)/versus/[code]/page.tsx` | Routes |

**Modified**

`lib/game/scoring.ts` (added `roundPoints`, `isVerdict`) ·
`lib/db/queries.ts` (added `eventsByIds`) ·
`lib/db/database.types.ts` (hand-edited — no Supabase CLI) ·
`lib/i18n/dictionary.ts` · `components/timeline-game.tsx` (slimmed to solo
rules only) · `components/event-visual.tsx` (widened prop type) ·
`components/site-header.tsx` + `language-selector.tsx` (prefix-matched
transparent routes) · `app/(public)/page.tsx` (entry link) ·
`app/globals.css` (versus animations) · `CLAUDE.md`.

---

## Database & realtime architecture

Migration applied to the live Supabase project (now 8 migrations).

**Tables**

- `public.match` — the one row both clients watch. Public-readable by design;
  every column is safe to show either player.
- `public.match_player` — seats 1/2, SHA-256 of the bearer token.
- `public.match_round` — `event_id` per round. **Private.**
- `public.match_answer` — raw guesses. **Private.** PK `(match_id, generation,
  idx, seat)` is the duplicate-submission guard.

**Security model**

- `anon`/`authenticated`: `SELECT` on `match` only. No grants at all on the
  other three; RLS enabled on all four; write grants revoked.
- All `versus_*` functions have `EXECUTE` revoked from `public`, `anon`,
  `authenticated` — they are reachable only via the service role, because
  PostgREST would otherwise expose them as RPC endpoints.

**Why secrets are split out:** Realtime pushes whole rows and RLS cannot hide a
column. `match_round.event_id` *is* the answer (`public.event` is world
readable), so it never reaches a client; the question crosses the wire as a
`MaskedEvent` with `year`/`month`/`day`/`sortKey`/`precision` removed **in the
type**, making a leak a compile error.

**Realtime:** `public.match` added to the `supabase_realtime` publication.
Clients subscribe to `postgres_changes` (UPDATE, filtered by id) plus Presence.
**No polling anywhere.** Division of labour: Realtime carries *state*; a Server
Action carries the *question* (fetched per round, during the reveal window).

**Clock:** the client measures a server/client offset NTP-style on each
`fetchMatchView` round trip and renders `deadline − (now + offset)`. When its
countdown hits zero it *prompts* the server to check its own clock; it never
decides. Both clients prompt, so one leaving cannot stall a match.

The offset is measured against `public.versus_db_now()` — the **Postgres**
clock, because that is what stamps every deadline. It reported the Node
process's `Date.now()` until 2026-10-05; see "Fixed after the first two-device
match" below.

---

## State machine

`match_phase`: `lobby → playing → revealed → (playing | complete)`, plus
`abandoned`; `complete → playing` on an accepted rematch (`generation + 1`).

Transitions, all in plpgsql under `select … for update` on the match row:

- `versus_set_ready` — both joined **and** both ready **and** rounds dealt → start.
- `versus_submit` — reconcile first, then insert; `accepted` / `duplicate` /
  `closed` (deadline already passed) / `stale` (wrong round). Second answer
  triggers the reveal immediately.
- `versus_reveal` — writes the public result into `match.history`, banks both
  scores, opens the reveal window.
- `versus_reconcile` — applies every deadline that has already passed. Runs at
  the head of every entry point. Uses `clock_timestamp()`; each transition
  stamps its next window from the current clock, so a long absence **resumes**
  a match rather than racing it to the end.
- `versus_request_rematch` / `versus_start_rematch` / `versus_decline_rematch`.
- `versus_sweep(interval)` — deletes stale matches. **Defined but never called.**

Scoring reuses the existing model: `roundPoints()` gives each verdict tier a
contiguous slice of 0–100 (`[100, 85, 60, 30, 0]`) and slides within it on the
same relative error that chose the tier. `BANDS` in `lib/game/scoring.ts`
remains the only difficulty knob.

---

## Tested successfully

**Against a throwaway local Postgres** (full migration chain):
ready gate · duplicate submission rejected · immediate close on second answer ·
timeout recorded as `bad`/0 points · late submit refused as `closed` ·
reveal→advance→complete · rematch refuses to start before the new generation is
dealt · generation isolation · `anon` denied on all three private tables and on
the RPCs.

**Against the live Supabase project** (server layer, scripted): create, join,
third join refused as `full`, token→seat resolution, lobby leaks zero events,
masked event has no `year` field, per-seat `youAnswered`, scores and history.

**Two live browser tabs:** invite → join (host updated by push, no reload) →
both ready → answer → waiting state → timeout path → synchronized result →
auto-advance → 10-round completion → rematch request/accept → fresh match on
the same link. Mid-match reload resumes the same seat with scores intact.

**QR:** every version 1–10 round-tripped through Apple's Vision framework, and
the code **as rendered in the browser** decoded to the exact invite URL.

**Regression:** solo `/guess` and `/compare` visually unchanged after the
shared-stage extraction. `npm run build` clean. `tsc --noEmit` clean. Browser
console free of errors and warnings.

---

## Fixed after the first two-device match

Date: 2026-10-05. Playing on a laptop and a phone stalled in round 3: both
players answered, the result rendered correctly, and the reveal countdown then
sat at "next round in 0" forever on both devices. Two defects, either of which
is sufficient on its own.

**1. `serverNow` came from the wrong clock.** `buildMatchView` returned
`Date.now()` — the Node process's clock — while every deadline is stamped by
Postgres `clock_timestamp()`. On Vercel plus hosted Supabase those are two
machines; measured 50–112 ms apart from a dev box, sign not guaranteed. With
Node ahead of Postgres, every client's countdown reaches zero before the
deadline has really passed, `versus_reconcile` correctly does nothing, and the
round stops.

Fix: `20261005140000_versus_db_clock.sql` adds `public.versus_db_now()`
(service-role only, same posture as the other `versus_*` functions) and
`databaseNow()` in `lib/db/matches.ts` reads it. It is sampled **in parallel
with the reconcile**, not after — a late sample biases the offset high, which is
the unsafe direction. A failed read falls back to `Date.now()`, since that is
the behaviour it replaces.

**2. The prompt was latched, not retried.** One prompt per
`(generation, round, phase)`, latched *before* the request was known to have
succeeded, with the result discarded. So any single lost prompt was permanent:
a dropped request on phone Wi-Fi, a dev server restarting mid-match (which
invalidates in-flight Server Actions — reload the page after editing code
during a match), or a prompt landing a few ms early. Nothing on screen said so,
and the only escape was a reload.

Fix: `PROMPT_RETRY_MS` in `components/versus-game.tsx` re-prompts every second
while a deadline stays passed. Deliberately uncapped — giving up is the failure
mode being fixed — and throttled on the browser's raw clock, since a wrong
offset is one of the things being recovered from. The sibling effect that
fetches the question already cleared its key on failure, as do `refillAttempt`
in both solo games; the prompt was the one place that did not.

**Verified after the fix**, scripted against the live Supabase project (31
checks): `versus_db_now()` agrees with `clock_timestamp()` to 0.01 ms and is
denied to `anon`/`authenticated`; one ready does not start a match and two do;
duplicate, stale, and post-reveal submits are refused; the second answer closes
the round immediately; a full ten rounds reach `complete` with ten history
entries, banked scores and no surviving deadline; the timeout path reveals and
advances; repeated reconcile is stable; rematch refuses to start before its
generation is dealt, then resets scores and history while leaving generation 1's
answers intact; the three private tables remain unreadable by
`anon`/`authenticated` and `match` stays read-only to them.

**Not verified:** the browser half. The Chrome extension was not connected, so
the retry and the corrected countdown have not been watched in a real client —
only the server state machine they talk to.

---

## Known limitations / unresolved

1. **A seat is per browser tab** (`sessionStorage`). Survives reload; **closing
   the tab gives the seat up** — there is no rejoin. This is why a missing
   opponent only shows a banner while the clock keeps running.
2. **`versus_sweep()` is never invoked.** Match rows accumulate indefinitely.
3. **`leaveVersusMatch` server action exists but no UI calls it**, so the
   `abandoned` phase is currently unreachable in practice.
4. **No rate limiting on `createVersusMatch`** — anyone can create matches in a
   loop, each dealing 10 rounds.
5. **No player names.** The result screen says "You" / "Them".
6. Anyone holding a match id can read the `match` row. Intentional (that is what
   the invite link grants), but worth knowing — it exposes scores and phase.
7. `/versus/[code]` is 78 kB route JS / 191 kB first load, mostly the Supabase
   realtime client. Acceptable, not optimised.
8. Invite URLs use `window.location.origin`; the site still has no domain
   (CLAUDE.md gap 1). **On a loopback host that origin is actively wrong**,
   because `localhost` names whatever device reads it — a phone scanning the
   lobby QR resolves the link to itself and the second player can never arrive.
   `NEXT_PUBLIC_DEV_INVITE_ORIGIN` now overrides the origin, and only when the
   page is on a loopback host, so it cannot follow a build to a real domain.
   See "Two-device testing" below.
9. Unused exports left in `lib/game/versus.ts`: `SEATS`, `currentEvent`,
   `upcomingEvent`, `MAX_ROUND_POINTS`.

---

## Two-device testing

Step 4 below needs the phone and the dev machine on one LAN:

1. `npm run dev` already binds every interface; Next prints the LAN URL
   (`http://<lan-ip>:3000`).
2. `allowedDevOrigins` in `next.config.ts` must cover that address, or the
   phone loads the HTML and then gets no JS or CSS — `next dev` refuses
   cross-origin `/_next/*` requests from an origin it was not told about, and
   the result looks like a broken app rather than a config problem.
3. Set `NEXT_PUBLIC_DEV_INVITE_ORIGIN=http://<lan-ip>:3000` in `.env.local`, so
   the link, the WhatsApp message and the QR code all point at the dev machine
   even while the host browses `localhost`. Re-check it after a DHCP lease
   change.
4. Images work on the phone without a VPN, because
   `NEXT_PUBLIC_R2_PUBLIC_BASE_URL=/api/r2` makes them same-origin and the
   proxy reads R2 over the S3 API (CLAUDE.md gap 1 does not apply).

The one thing plain HTTP costs: it is not a secure context, so `navigator.share`
is absent *and* `navigator.clipboard` is undefined, and both share buttons fall
through to their failure state. Use a tunnel if that is what is being tested.

---

## Production-hardening checklist

- [ ] Schedule `versus_sweep()` (pg_cron, or a Vercel cron hitting a protected route).
- [ ] Rate-limit `createVersusMatch` and `joinVersusMatch` per IP/session.
- [ ] Wire `leaveVersusMatch` to an explicit "leave match" control.
- [ ] Load-test Realtime concurrency against the Supabase plan's limits.
- [ ] Decide rejoin-after-tab-close (short-lived signed cookie, or accept it).
- [ ] Point `NEXT_PUBLIC_R2_PUBLIC_BASE_URL` at the custom domain so invite URLs
      and images work off-VPN (gap 1 — owner's call, do not re-raise).
- [ ] Re-run `npm run db:types` once the Supabase CLI is installed; the types
      for the four new tables and eight functions are currently hand-written.
- [ ] Consider an index on `match_answer (match_id, generation, idx)` if match
      volume grows (PK covers current access patterns).

---

## Architectural decisions worth keeping

1. **Postgres is the referee, not the application.** All transitions are
   plpgsql under a row lock. The app grades a guess (one copy of `gradeGuess`);
   the database decides whether it counts. This is what makes simultaneous
   submissions, deadline-edge submissions and retries deterministic.
2. **One public row is the state.** No second copy to drift; the thing pushed to
   clients *is* the authoritative row.
3. **Secrets never enter the published table.** Forced by Realtime's row-level
   granularity, and enforced at the type level via `MaskedEvent`.
4. **Supabase Realtime over a custom WebSocket server.** No new dependency and
   it works on Vercel, where a long-lived socket in the app process cannot.
5. **Scoring extends the existing bands** rather than introducing a parallel
   system — points can never contradict the verdict word on screen.
6. **Shared stage, separate rules.** `timeline-stage.tsx` holds what both modes
   *draw*; each mode keeps what it *decides*. Prefer moving shared visuals there
   over copying them.
7. **QR encoder written out, not installed** — a hosted generator would log the
   invite URL (a capability to join someone's game) and would be a runtime
   dependency of the lobby.
8. **Everything the mode adds is an overlay on the photograph**, because the
   screen is exactly one viewport and the height budget has nothing spare.

---

## Recommended next steps, in order

1. Schedule `versus_sweep()` — cheapest fix, prevents unbounded growth.
2. Add rate limiting to match creation.
3. Wire a "leave match" control to `leaveVersusMatch`.
4. Play a real two-device match over the network (everything so far was two
   tabs on one machine) and watch the countdown drift and the reveal sync.
5. Decide on player names — it is the biggest readability win on the result
   screen for a small amount of work.
6. Only then consider generalising the match tables to a second game mode; the
   vocabulary is already game-agnostic apart from `match_answer.guess` being a
   year.
