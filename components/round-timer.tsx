"use client";

import { useEffect, useRef, useState } from "react";

import { SOLO_ROUND_SECONDS } from "@/lib/game/rounds";
import { format, type Dict } from "@/lib/i18n/dictionary";

/**
 * The round countdown.
 *
 * **It displays time; it does not keep it.** The number it shows is derived
 * from the server's deadline every frame it repaints — `remainingMs` is handed
 * in by the caller, which computes it as `deadline - (now + offset)` against a
 * clock offset measured on a real request. Nothing here counts down on its
 * own, so a tab that was suspended for ten seconds comes back showing the
 * right number instead of the number it had when it went away, and two players
 * on two devices with two wrong clocks still see the same seconds. The server
 * decides when the round is over regardless of what this says.
 *
 * It is a ring rather than a bar because it has to live in the corner of the
 * photograph: the date-guessing screen is one viewport with no spare rows (see
 * `TimelineGame`), so everything the head-to-head mode adds is an overlay on
 * the picture. The ring is the same glass pill vocabulary as `SetProgress`
 * directly opposite it.
 */

/** Below this many seconds the ring turns red and the number starts to pulse. */
const URGENT_SECONDS = 5;

export function RoundTimer({
  remainingMs,
  totalMs,
  label,
}: {
  remainingMs: number;
  totalMs: number;
  /** Accessible name — the digits alone do not say what is counting. */
  label: string;
}) {
  const clamped = Math.max(0, remainingMs);
  // Ceil, so the last whole second is shown as "1" and not as "0" for its
  // entire duration — a timer that sits on zero while play continues reads as
  // broken.
  const seconds = Math.ceil(clamped / 1000);
  const fraction = totalMs > 0 ? Math.min(1, Math.max(0, clamped / totalMs)) : 0;
  const urgent = seconds <= URGENT_SECONDS;

  const radius = 15;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      role="timer"
      aria-label={label}
      // Announcing every second would make a screen reader unusable; the
      // visual ring is the live channel and this is read on demand.
      aria-live="off"
      className="relative h-10 w-10"
    >
      <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="rgb(0 0 0 / 0.55)"
          stroke="rgb(255 255 255 / 0.2)"
          strokeWidth="2.5"
        />
        <circle
          cx="18"
          cy="18"
          r={radius}
          fill="none"
          stroke={urgent ? "var(--color-bad)" : "var(--color-ink)"}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          // No CSS transition: the value already updates every animation
          // frame, and easing it would make the ring lag the digits beside it.
          style={{ transition: "stroke 300ms linear" }}
        />
      </svg>

      <span
        className={`absolute inset-0 flex items-center justify-center text-[13px] font-semibold tabular-nums ${
          urgent ? "round-timer-urgent text-bad" : "text-ink"
        }`}
      >
        {seconds}
      </span>
    </div>
  );
}

/* -------------------------------------------------------------------------
   The solo clock
   ------------------------------------------------------------------------- */

/** How often the solo ring repaints. The head-to-head's own cadence. */
const SOLO_TICK_MS = 100;

/**
 * How long a round's clock waits for its picture before starting without it.
 *
 * The clock starts once the photograph is in, because thirty seconds spent
 * looking at a blank card are not thirty seconds of question. From question
 * two on the picture was pulled during the previous round and this is
 * instant; on question one it is the page's own load. Capped, so a picture
 * that never arrives cannot hold the clock open forever.
 */
const PICTURE_GRACE_MS = 2500;

/**
 * How soon a time-up lock-in that failed is tried again. The round is still
 * live after a failure (an ungraded answer is handed back), and the clock has
 * already run out, so nothing else would ever close it.
 */
const EXPIRE_RETRY_MS = 1500;

/**
 * The one slot a persisted clock is kept in. Only one round is ever live, so
 * one record — the round it belongs to and its deadline — is all there is to
 * keep, and a new round simply overwrites it: nothing to prune.
 */
const CLOCK_STORE_KEY = "tempus:round-clock";

export interface SoloRoundClock {
  remainingMs: number;
  totalMs: number;
}

/**
 * Thirty seconds per solo round (`SOLO_ROUND_SECONDS`), and what happens when
 * they run out.
 *
 * **A wall clock, not a stopwatch.** The deadline is stamped once per round
 * and the ring is `deadline - now`, so a tab that was hidden — the tab the
 * player went to look the date up in — comes back showing the time that is
 * really left, and an expired round is locked in the moment the page next
 * gets a tick. Pausing while hidden would be the exact loophole the clock is
 * for.
 *
 * `round` is the round's identity; a new one gets a new clock. `live` is
 * whether that round can still be answered — on screen, not yet locked in,
 * nothing (a set summary) covering it — and the clock starts the first time
 * it is, once the picture is in. It is never restarted for the same round, so
 * a lock-in that fails and hands the round back does not hand back time too.
 *
 * `onExpire` is called when time is up while the round is still live, and
 * again every `EXPIRE_RETRY_MS` for as long as it stays live — which is only
 * the case when the time-up lock-in itself failed.
 *
 * `persistKey` keeps the deadline across reloads. Only the daily needs it: its
 * questions are the same on every load, so a reload that restarted the clock
 * would be thirty more seconds to look the answer up. The other games deal a
 * new question on every load, so there is nothing to carry over.
 */
export function useSoloRoundClock({
  round,
  picture,
  live,
  onExpire,
  persistKey,
}: {
  round: string | null;
  picture: string | null;
  live: boolean;
  onExpire: () => void;
  persistKey?: string;
}): SoloRoundClock {
  const totalMs = SOLO_ROUND_SECONDS * 1000;
  const [clock, setClock] = useState<{ round: string; deadline: number } | null>(
    null,
  );
  const [now, setNow] = useState(() => Date.now());

  // The latest render's handler, so the expiry below locks in what is on the
  // board *now* rather than what was there when the clock started.
  const expire = useRef(onExpire);
  expire.current = onExpire;
  const fired = useRef<{ round: string; at: number } | null>(null);

  const deadline = clock !== null && clock.round === round ? clock.deadline : null;

  useEffect(() => {
    if (!live || round === null || deadline !== null) return;

    let done = false;
    const begin = () => {
      if (done) return;
      done = true;
      const at = Date.now();
      const kept = readKeptDeadline(persistKey);
      const next = kept ?? at + totalMs;
      if (kept === null) keepDeadline(persistKey, next);
      setNow(at);
      setClock({ round, deadline: next });
    };

    // A deadline already kept for this round is already running: waiting for
    // the picture again would only add the reload to it.
    if (!picture || readKeptDeadline(persistKey) !== null) {
      begin();
      return;
    }

    const image = new window.Image();
    image.src = picture;
    image.decode().then(begin, begin);
    const grace = window.setTimeout(begin, PICTURE_GRACE_MS);

    return () => {
      done = true;
      window.clearTimeout(grace);
    };
  }, [live, round, picture, deadline, persistKey, totalMs]);

  const ticking = live && deadline !== null;

  useEffect(() => {
    if (!ticking) return;
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), SOLO_TICK_MS);
    return () => window.clearInterval(id);
  }, [ticking]);

  useEffect(() => {
    if (!live || round === null || deadline === null || now < deadline) return;
    const last = fired.current;
    if (last && last.round === round && now - last.at < EXPIRE_RETRY_MS) return;
    fired.current = { round, at: now };
    expire.current();
  }, [live, round, deadline, now]);

  return {
    remainingMs: deadline === null ? totalMs : Math.max(0, deadline - now),
    totalMs,
  };
}

/** The ring for a solo round, labelled. */
export function SoloRoundTimer({
  clock,
  t,
}: {
  clock: SoloRoundClock;
  t: Dict;
}) {
  return (
    <RoundTimer
      remainingMs={clock.remainingMs}
      totalMs={clock.totalMs}
      label={format(t.versusSecondsLeft, {
        n: Math.ceil(clock.remainingMs / 1000),
      })}
    />
  );
}

// Storage can be unavailable outright (private mode, a blocked origin). The
// clock then simply restarts on a reload, which is the most it can lose.
function readKeptDeadline(key: string | undefined): number | null {
  if (!key) return null;
  try {
    const raw = window.localStorage.getItem(CLOCK_STORE_KEY);
    if (!raw) return null;
    const kept = JSON.parse(raw) as { key?: unknown; deadline?: unknown };
    return kept.key === key && typeof kept.deadline === "number"
      ? kept.deadline
      : null;
  } catch {
    return null;
  }
}

function keepDeadline(key: string | undefined, deadline: number): void {
  if (!key) return;
  try {
    window.localStorage.setItem(CLOCK_STORE_KEY, JSON.stringify({ key, deadline }));
  } catch {
    // See above.
  }
}
