"use client";

import { useEffect, useRef, useState } from "react";

import { QrCode } from "@/components/qr-code";
import { copyText } from "@/lib/clipboard";
import { SITE_ORIGIN } from "@/lib/site";
import { format, type Dict } from "@/lib/i18n/dictionary";
import type { MatchView, Seat } from "@/lib/game/versus";
import { otherSeat, versusModeSpec } from "@/lib/game/versus";

/**
 * The invitation screen: everything between creating a match and the first
 * question.
 *
 * Three ways to get the second player in, because the three cover different
 * situations and none of them covers all of it: the link for someone in
 * another chat app, the WhatsApp button for the case this was built around,
 * and the QR code for the person sitting across the table — who should not
 * have to be sent anything at all.
 *
 * **The URL is always the live site's** (`SITE_ORIGIN`), never the page's own:
 * an invite is for someone somewhere else, and a room opened on the dev server
 * used to hand out a `localhost` or LAN address nobody outside the house could
 * open. Rooms live in the database the live site reads, so the code is
 * joinable there wherever it was minted.
 *
 * **Both players ready is a gate, not a countdown.** The match cannot start
 * until each has pressed, because the alternative — starting on a timer when
 * the second player joins — means question one begins while someone is still
 * reading what the game is.
 */
export function VersusLobby({
  view,
  onReady,
  busy,
  t,
}: {
  view: MatchView;
  onReady: () => void;
  busy: boolean;
  t: Dict;
}) {
  const inviteUrl = inviteUrlFor(view.code);
  const them = otherSeat(view.seat);

  const youReady = view.seats[view.seat].ready;
  const theyJoined = view.seats[them].joined;
  const theyReady = view.seats[them].ready;

  return (
    <div className="flex min-h-0 w-full flex-1 items-center justify-center py-2">
      {/* **The head is outside the scroll container, not the first thing in
          it.** The whole panel used to scroll, so on a short window — a phone
          in landscape, a laptop at 520px of usable height — the first flick
          carried "Karşı karşıya · Tarih tahmini" and "Arkadaşını davet et" up
          under the panel's own rounded edge and cut them in half. The heading
          is what tells the second player, arriving cold off a link, which game
          they have been invited to; it is the one thing on this screen that
          must still be on it when the QR code is. So the panel is a column
          with a fixed head and a scrolling body, and the padding is split
          between them accordingly: `pt-7` on the head, `pb-7` on the body, and
          the horizontal padding on both so the two edges line up. */}
      <div className="set-summary-in flex max-h-full w-full max-w-md flex-col overflow-hidden rounded-3xl border border-white/12 bg-black/45 text-center shadow-2xl shadow-black/70 backdrop-blur-2xl">
        <div className="shrink-0 px-7 pb-5 pt-7 [@media(max-height:820px)]:pt-5">
          {/* The kicker names the game as well as the mode. A match is ten
              questions from one pool and the second player arrives here off a
              link, so this is the first and only place they are told which of
              the date-guessing games they have been invited to. The dot and
              the game's name are one unbreakable run, so a narrow phone breaks
              the line before the dot rather than inside the name. The `wbr`
              is that break: with no space before the run, the last word of
              the title was glued to it and the line broke inside the title
              instead. */}
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
            {t.versusTitle}
            <wbr />
            <span className="whitespace-nowrap">
              <span className="px-1.5 text-white/30">·</span>
              {t[versusModeSpec(view.mode).titleKey]}
            </span>
          </p>
          {/* The invitation is over once the opponent is in, and the heading
              says so rather than still asking the player to send a link the
              screen no longer shows. */}
          <h2 className="mt-1 font-display text-xl font-semibold text-ink">
            {theyJoined ? t.versusOpponentJoined : t.versusInviteTitle}
          </h2>
          {!theyJoined && (
            <p className="mx-auto mt-2 max-w-xs text-sm text-white/70">
              {t.versusInviteBlurb}
            </p>
          )}
        </div>

        {/* A shorter step below 820px of window: on a 768px laptop the
            148px QR code, the share buttons and the match code pushed the
            seat rows and the status — what the host is actually waiting on —
            into the panel's scroll. The step takes 36px off the QR, 8px off
            the four gaps and 8px off the foot (`pb-5`, matching the head's
            `pt-5`), which is what a 1366x768 window was short by; the scroll
            stays for anything shorter still. */}
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-7 pb-7 [scrollbar-width:thin] [@media(max-height:820px)]:gap-3 [@media(max-height:820px)]:pb-5">
          {/* Only while there is still somebody to invite. Once they are in,
              the link is clutter standing between the player and the button
              they are waiting to press. */}
          {!theyJoined && (
            <>
              <div className="flex flex-col items-center gap-3">
                <div className="rounded-2xl bg-white p-2 shadow-lg shadow-black/40">
                  {/* The CSS size wins over the SVG's own width and height
                      attributes, so the short-window step needs no second
                      render. 112px still scans from across a table. */}
                  <QrCode
                    value={inviteUrl}
                    size={148}
                    className="[@media(max-height:820px)]:h-[112px] [@media(max-height:820px)]:w-[112px]"
                  />
                </div>
                <p className="text-xs text-white/50">{t.versusScanHint}</p>
              </div>

              <div className="flex flex-col gap-2.5">
                <WhatsAppButton
                  url={inviteUrl}
                  label={t.versusShareWhatsApp}
                  template={t.versusInviteMessage}
                />
                <CopyLinkButton
                  url={inviteUrl}
                  label={t.versusCopyLink}
                  copiedLabel={t.versusLinkCopied}
                />
              </div>

              <div className="border-t border-white/10 pt-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-white/40">
                  {t.versusMatchCode}
                </p>
                {/* `pl` matches the tracking, which is also added after the
                    last letter: without it the code sat ~3px left of centre. */}
                <p className="mt-1 pl-[0.24em] font-display text-2xl font-semibold tracking-[0.24em] text-ink">
                  {view.code}
                </p>
              </div>
            </>
          )}

          <div className="flex flex-col gap-3">
            <SeatRow
              label={t.versusYou}
              joined
              ready={youReady}
              t={t}
            />
            <SeatRow
              label={t.versusOpponent}
              joined={theyJoined}
              ready={theyReady}
              t={t}
            />
          </div>

          {theyJoined ? (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                // `aria-disabled` and a guarded handler rather than `disabled`:
                // a button disabled by its own press drops keyboard focus to
                // the document.
                onClick={() => {
                  if (!youReady && !busy) onReady();
                }}
                aria-disabled={youReady || busy || undefined}
                aria-busy={busy}
                className={`relative w-full rounded-full border px-6 py-2.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  youReady
                    ? "cursor-default border-white/20 bg-transparent text-white/50"
                    : "border-transparent bg-ink text-page hover:opacity-85"
                } ${busy ? "cursor-progress" : ""}`}
              >
                {youReady ? t.versusYouAreReady : t.versusReady}
                {/* The board's loading trace, as on the start page's buttons:
                    the press is a round trip, and a button that looked
                    unpressed for it reads as one that did nothing. */}
                {busy && (
                  <span aria-hidden="true" className="round-trace">
                    <i />
                    <i />
                    <i />
                  </span>
                )}
              </button>
              {youReady && !theyReady && (
                <Waiting label={t.versusReadyWaiting} />
              )}
              {youReady && theyReady && (
                <p className="text-xs text-white/55">{t.versusStarting}</p>
              )}
            </div>
          ) : (
            <Waiting label={t.versusWaitingToJoin} />
          )}
        </div>
      </div>
    </div>
  );
}

/** Where each seat has got to. Two rows, so "who are we waiting for" is one glance. */
function SeatRow({
  label,
  joined,
  ready,
  t,
}: {
  label: string;
  joined: boolean;
  ready: boolean;
  t: Dict;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-2.5">
      <span className="text-sm font-semibold text-ink">{label}</span>
      <span
        className="flex items-center gap-2 text-xs"
        style={{
          color: ready ? "var(--color-good)" : "rgb(255 255 255 / 0.5)",
        }}
      >
        <span
          className="h-2 w-2 rounded-full"
          style={{
            backgroundColor: ready
              ? "var(--color-good)"
              : joined
                ? "rgb(255 255 255 / 0.45)"
                : "transparent",
            boxShadow: joined ? undefined : "inset 0 0 0 1px rgb(255 255 255 / 0.3)",
          }}
        />
        {/* Neutral words: this row is rendered for both seats, so anything
            phrased about "your opponent" is wrong half the time. */}
        {ready ? t.versusStatusReady : joined ? t.versusStatusHere : t.versusStatusAway}
      </span>
    </div>
  );
}

/**
 * "Still going, still not your turn."
 *
 * The dots are the whole point — a line of static text in the place where a
 * button used to be reads as a screen that has stopped working. `aria-live`
 * carries the same thing to a screen reader once, which the animation cannot.
 *
 * `live={false}` is for a second copy of a wait that is already announced
 * elsewhere on screen — the round's button cell repeats the badge on the
 * picture, and two live regions would read the one sentence twice.
 */
export function Waiting({
  label,
  live = true,
}: {
  label: string;
  live?: boolean;
}) {
  return (
    <p
      role={live ? "status" : undefined}
      aria-live={live ? "polite" : undefined}
      className="flex items-center justify-center gap-2 text-xs text-white/60"
    >
      {label}
      <span aria-hidden="true" className="flex items-center gap-1">
        {[0, 1, 2].map((dot) => (
          <span
            key={dot}
            className="versus-dot h-1 w-1 rounded-full bg-current"
            style={{ animationDelay: `${dot * 160}ms` }}
          />
        ))}
      </span>
    </p>
  );
}

const SHARE_FEEDBACK_MS = 2000;

function CopyLinkButton({
  url,
  label,
  copiedLabel,
}: {
  url: string;
  label: string;
  copiedLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    // On failure there is nothing useful to say: the code and the QR are
    // both still on screen, and the URL is in the address bar.
    if (!(await copyText(url))) return;
    setCopied(true);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCopied(false), SHARE_FEEDBACK_MS);
  }

  return (
    <button
      type="button"
      onClick={copy}
      // Announced, so the "Copied" relabel reaches a screen reader too.
      aria-live="polite"
      className="w-full rounded-full border border-white/45 bg-black/45 px-6 py-2.5 text-sm font-semibold text-ink backdrop-blur-md transition hover:bg-black/65 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {copied ? copiedLabel : label}
    </button>
  );
}

/**
 * WhatsApp, through its documented share URL.
 *
 * `wa.me` hands off to the installed app on a phone and to WhatsApp Web on a
 * desktop, which is why it is this rather than a deep link. `noopener` because
 * it opens a new tab, and the message is encoded rather than concatenated —
 * an invite URL contains characters that would otherwise end the query early.
 */
function WhatsAppButton({
  url,
  label,
  template,
}: {
  url: string;
  label: string;
  template: string;
}) {
  const message = format(template, { url });
  const href = `https://wa.me/?text=${encodeURIComponent(message)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex w-full items-center justify-center gap-2 rounded-full border border-transparent bg-ink px-6 py-2.5 text-sm font-semibold text-page transition hover:opacity-85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="currentColor">
        <path d="M12.04 2c-5.46 0-9.9 4.44-9.9 9.9 0 1.75.46 3.45 1.32 4.95L2 22l5.3-1.39a9.86 9.86 0 0 0 4.74 1.21h.01c5.46 0 9.9-4.44 9.9-9.9 0-2.64-1.03-5.13-2.9-7A9.82 9.82 0 0 0 12.04 2Zm0 1.67c2.2 0 4.27.86 5.82 2.42a8.19 8.19 0 0 1 2.41 5.82c0 4.54-3.69 8.23-8.24 8.23a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.05-.2-.31a8.17 8.17 0 0 1-1.26-4.37c0-4.54 3.7-8.23 8.25-8.23Zm-2.4 4.3c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2s.86 2.32.98 2.48c.12.16 1.7 2.6 4.12 3.64.58.25 1.03.4 1.38.51.58.19 1.1.16 1.52.1.46-.07 1.43-.59 1.63-1.15.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28-.24-.12-1.43-.71-1.65-.79-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1.02-.38-1.94-1.2-.72-.64-1.2-1.43-1.34-1.67-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.19-.47-.39-.4-.54-.41h-.46Z" />
      </svg>
      {label}
    </a>
  );
}

/**
 * The invite URL for this match.
 *
 * Built in an effect rather than during render because `window` does not
 * exist on the server, and this screen is reached through a Server Component.
 * Returning null for the first paint is deliberate: the QR code and the share
 * buttons would otherwise render once against the wrong origin.
 */
function inviteUrlFor(code: string): string {
  return `${SITE_ORIGIN}/versus/${code}`;
}

/** Seat labels for the result screens, so "You" is always this client. */
export function seatName(seat: Seat, you: Seat, t: Dict): string {
  return seat === you ? t.versusYouLabel : t.versusThemLabel;
}
