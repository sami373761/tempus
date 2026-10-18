"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";

import { SUMMARY_BUTTON } from "@/components/set-summary";
import { signInHref } from "@/lib/auth/paths";
import { minutesUntilReset } from "@/lib/game/daily";
import {
  LIMITED_GAME_PATH,
  MEMBER_PLAYS_PER_DAY,
  playsLeft,
  type PlayAllowance,
} from "@/lib/game/play-limit";
import type { RevealResult } from "@/lib/game/solo";
import { format, type Dict } from "@/lib/i18n/dictionary";

/**
 * The client half of the subject modes' three-a-day limit: reading the count
 * back off a reveal, and the screen that says there are none left.
 *
 * **Nothing here decides anything.** The rules are lib/game/play-limit.ts and
 * the counting is lib/game/play-ledger.ts, enforced inside the reveal itself
 * (`revealDateRound`) — so this does not ask for permission, it is *told*. What
 * this file owns is what the player sees, which is the same in all four modes
 * and so is written once rather than three times (the subject games are three
 * components: the shared timeline game, the film one and the portrait one).
 *
 * **Two gates, and they are different gates.** The page refuses to deal at all
 * when the day is spent, which is the one a player meets by coming back. This
 * one is the other: a set begun while the day still had room, where the server
 * has since refused a round — a second tab, or a "Play again" that raced the
 * count. It replaces the game rather than nagging, because at that point the
 * player is playing a game they do not have.
 */

/* -------------------------------------------------------------------------
   Following the count
   ------------------------------------------------------------------------- */

export interface PlayLimit {
  /** The standing as last reported, or null in a game with no limit. */
  allowance: PlayAllowance | null;
  /** Games left today, or null where there is no limit to have left. */
  left: number | null;
  /** The server refused a round of this set: a game the day does not have. */
  blocked: boolean;
  /**
   * Hand every reveal to this. It picks up the standing the server attached
   * and notices a refusal; everything else about the reply is the caller's.
   */
  record: (result: RevealResult) => void;
}

/** A game with no limit: the general modes, whose reveals carry no standing. */
const UNLIMITED: PlayLimit = {
  allowance: null,
  left: null,
  blocked: false,
  record: () => {},
};

/**
 * Hold one game's standing across a session of sets.
 *
 * `allowance` starts as the page's own read and is then replaced by whatever
 * each reveal reports — so the summary's "one game left" is the database's
 * number rather than one counted in the browser, and it is right even when
 * another tab spent a game in between.
 *
 * A reveal that *failed* (a dropped request, a server error) is not a refusal
 * and does not block: only `play-limit` does, which is the server saying the
 * day is spent.
 */
export function usePlayLimit({
  setId,
  allowance,
}: {
  /** The set being played. A new one may clear a block the last one earned. */
  setId: string;
  /**
   * The page's own read, or null in a game with no limit. Which mode this is
   * does not need saying: an allowance names its own game, and a game with no
   * limit has no allowance to hand down.
   */
  allowance: PlayAllowance | null;
}): PlayLimit {
  const [current, setCurrent] = useState(allowance);
  const [blocked, setBlocked] = useState(false);

  // A new set is a new game, so a block the finished one was carrying is not
  // this one's. If the day really is spent the first reveal of this set says
  // so again, which is the only thing that should put the panel back up.
  useEffect(() => {
    setBlocked(false);
  }, [setId]);

  const record = useCallback((result: RevealResult) => {
    if (result.plays) setCurrent(result.plays);
    if (!result.ok && result.reason === "play-limit") setBlocked(true);
  }, []);

  if (!allowance) return UNLIMITED;

  return {
    allowance: current,
    left: current ? playsLeft(current) : null,
    blocked,
    record,
  };
}

/**
 * Whether a refused reveal was the daily limit rather than a failure.
 *
 * The games branch on this because the two need opposite handling: a failure
 * hands the guess back and shows "that did not reach the server", and a spent
 * day must not — there is nothing to try again.
 */
export function isPlayLimitRefusal(result: RevealResult): boolean {
  return !result.ok && result.reason === "play-limit";
}

/* -------------------------------------------------------------------------
   The screen with no game on it
   ------------------------------------------------------------------------- */

/**
 * What a spent day looks like: the one panel both gates show.
 *
 * Styled as the set summary and the daily's result are, for the same reason —
 * it stands on a photograph, so it is that dark glass rather than an opaque
 * card. It is deliberately not only a refusal: a guest is shown what an
 * account changes, and everybody is shown the three modes that have no limit,
 * because a player who wanted to play is still a player who wanted to play.
 */
export function PlayLimitPanel({
  allowance,
  title,
  t,
}: {
  allowance: PlayAllowance;
  /** The mode's own name, so the panel says which limit this is. */
  title: string;
  t: Dict;
}) {
  const panel = useRef<HTMLDivElement>(null);

  // The panel is the whole screen's content and nothing the player pressed is
  // still on the page, so it takes focus — the set summary's rule, and
  // `preventScroll` for its reason (focus lands mid-entrance).
  useEffect(() => {
    panel.current?.focus({ preventScroll: true });
  }, []);

  const member = allowance.member;

  return (
    <div className="flex w-full flex-1 justify-center py-2">
      <div
        ref={panel}
        tabIndex={-1}
        role="group"
        aria-label={`${member ? t.playLimitDone : t.playLimitGuestDone} — ${title}`}
        className="set-summary-in my-auto flex w-full max-w-md flex-col gap-5 rounded-3xl border border-white/12 bg-black/45 px-7 py-7 text-center shadow-2xl shadow-black/70 backdrop-blur-2xl focus:outline-none [@media(max-height:820px)]:gap-3 [@media(max-height:820px)]:py-5"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
            {member ? t.playLimitDone : t.playLimitGuestDone}
          </p>
          <h2 className="mt-1 font-display text-base font-semibold text-ink">
            {title}
          </h2>
        </div>

        {/* The count, as the headline. It is the whole of what this screen has
            to say, and a number is how the player checks it against what they
            remember playing. */}
        <p className="font-display text-5xl font-semibold leading-none tracking-tight tabular-nums text-ink">
          {allowance.used}
          <span className="px-1 text-white/35">/</span>
          <span className="text-white/55">{allowance.limit}</span>
        </p>

        <p className="text-sm leading-relaxed text-white/75">
          {member
            ? format(t.playLimitMemberBody, { total: allowance.limit })
            : format(t.playLimitGuestBody, {
                total: allowance.limit,
                member: MEMBER_PLAYS_PER_DAY,
              })}
        </p>

        <div className="flex flex-col gap-2.5">
          {/* A guest's one button is the account, because that is the thing
              that changes this screen today. A member's day cannot be changed,
              so theirs is the way out. */}
          {!member && (
            <Link
              href={signInHref(LIMITED_GAME_PATH[allowance.game])}
              className={`${SUMMARY_BUTTON} inline-flex items-center justify-center bg-ink text-page hover:opacity-85`}
            >
              {t.authTabSignUp}
            </Link>
          )}

          <Link
            href="/"
            className={`${SUMMARY_BUTTON} inline-flex items-center justify-center border-white/25 bg-transparent text-white/80 hover:border-white/45 hover:text-ink`}
          >
            {t.backHome}
          </Link>
        </div>

        <UnlimitedModes t={t} />
        <ResetLine day={allowance.day} t={t} />
      </div>
    </div>
  );
}

/**
 * The compact version, for the summary of the game that used the day up.
 *
 * It is a block inside a panel rather than a panel of its own: the player is
 * reading a result, and the thing to say is that there is no "Play again" and
 * why. The guest's is the one that asks for something, which is the whole
 * point of a guest's single game.
 */
export function PlayLimitNotice({
  allowance,
  t,
}: {
  allowance: PlayAllowance;
  t: Dict;
}) {
  const member = allowance.member;

  return (
    <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-4">
      <p className="text-xs leading-relaxed text-white/70">
        {member
          ? t.playLimitMemberSummary
          : format(t.playLimitGuestSummary, { member: MEMBER_PLAYS_PER_DAY })}
      </p>

      {!member && (
        <Link
          href={signInHref(LIMITED_GAME_PATH[allowance.game])}
          className="mt-3 inline-flex items-center justify-center rounded-full bg-ink px-5 py-2 text-xs font-semibold text-page transition hover:opacity-85"
        >
          {t.authTabSignUp}
        </Link>
      )}

      <div className="mt-3 flex flex-col gap-1">
        <UnlimitedModes t={t} />
        <ResetLine day={allowance.day} t={t} />
      </div>
    </div>
  );
}

/**
 * How many games are left, for a summary that is not the last one of the day.
 *
 * Only from the second-to-last game: at three of three it would be telling a
 * player about a ceiling they are nowhere near, and at zero the notice above
 * has already said everything.
 */
export function PlayLimitLeft({
  allowance,
  t,
}: {
  allowance: PlayAllowance;
  t: Dict;
}) {
  const left = playsLeft(allowance);
  if (left === 0 || left >= allowance.limit) return null;

  return (
    <p className="text-xs tabular-nums text-white/50">
      {format(t.playLimitLeftToday, { n: left, total: allowance.limit })}
    </p>
  );
}

/* -------------------------------------------------------------------------
   Shared lines
   ------------------------------------------------------------------------- */

/**
 * The three modes with no limit at all — the way on from every notice here.
 *
 * Inline links in a sentence rather than three buttons: this is a footnote
 * under whatever the panel's own actions are, and on the summary it sits in a
 * block that already has one.
 */
function UnlimitedModes({ t }: { t: Dict }) {
  return (
    <p className="text-xs leading-relaxed text-white/50">
      {t.playLimitUnlimited}{" "}
      {UNLIMITED_MODES.map((mode, at) => (
        <span key={mode.href}>
          {at > 0 && <span className="px-1 text-white/25">·</span>}
          <Link
            href={mode.href}
            className="rounded text-white/70 underline-offset-4 transition hover:text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {t[mode.titleKey]}
          </Link>
        </span>
      ))}
    </p>
  );
}

const UNLIMITED_MODES = [
  { href: "/guess", titleKey: "timelineTitle" },
  { href: "/compare", titleKey: "comparisonTitle" },
  { href: "/survival", titleKey: "survivalTitle" },
] as const satisfies readonly { href: string; titleKey: keyof Dict }[];

/**
 * When the next games arrive: midnight UTC, the daily's own boundary and so
 * the daily's own countdown (`minutesUntilReset`).
 *
 * Read after mount, never during render, for the reason the daily's result
 * screen does: a server render and the first client render would disagree
 * about the clock and React would call it a hydration error. Null until then,
 * which is why the line is conditional rather than a placeholder.
 */
function ResetLine({ day, t }: { day: string; t: Dict }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (now === null) return null;
  const minutes = minutesUntilReset(day, now);

  return (
    <p className="text-xs tabular-nums text-white/50">
      {minutes >= 60
        ? format(t.playLimitResetIn, {
            h: Math.floor(minutes / 60),
            m: minutes % 60,
          })
        : format(t.playLimitResetInSoon, { m: minutes })}
    </p>
  );
}
