-- ============================================================================
-- TEMPUS — head-to-head over any date-guessing pool
--
-- Until now a match was always the general date-guessing game: `dealRounds`
-- drew from the whole library and both clients drew the five-pane timeline.
-- A match now names the game it is a match *of* — the general library, the
-- football pool, or film & television — and that one fact decides three
-- things the application already knows how to vary per pool: which events are
-- dealt (`topicSlug` in `randomEvents`), which tolerance ladder grades a guess
-- (`BandSet` in lib/game/scoring.ts), and which rail and layout the round is
-- played on (lib/game/versus.ts's `VERSUS_MODE_SPEC`).
--
-- **Why one column and nothing else.** The match, seat, round and answer
-- structure was written to carry other modes (see the header of
-- 20261005120000_versus_matches.sql) and it does: a round is still one event
-- and an answer is still a year, whichever pool the event came from. Nothing
-- in the state machine reads this column — not `versus_submit`, not
-- `versus_reveal`, not `versus_reconcile` — because the pool changes *what* is
-- asked and never *when* or *whether*, which is the division of labour the
-- whole file is built on.
--
-- **Public by construction**, like every other column on this table: both
-- players are playing the same game and need to draw the same screen, so
-- naming it tells the opponent nothing they are not already looking at.
--
-- `text` rather than an enum, for the reason `match_answer.verdict` is text:
-- the list of modes is an application decision — a fourth pool is a category
-- row plus a slug in lib/game/topics.ts — and it must not need a migration.
-- The application validates it on the way in (`isVersusMode`) and reads it
-- tolerantly on the way out (`asVersusMode` falls back to the default), so a
-- row naming a mode this deploy does not have is a general match rather than a
-- broken screen.
--
-- The default is what every existing row is: matches created before this
-- migration were all the general game.
-- ============================================================================

alter table public.match
  add column mode text not null default 'history';

comment on column public.match.mode is
  'Which date-guessing pool this match is played over: history (the general '
  'library), football, or screen. Validated by the application, not by a '
  'constraint — see lib/game/versus.ts. Safe to show both players.';
