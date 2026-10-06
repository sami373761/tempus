"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createVersusMatch } from "@/app/actions/versus";
import { TimelineBackdrop } from "@/components/timeline-backdrop";
import { DEFAULT_PANE } from "@/lib/game/timeline";
import type { Dict } from "@/lib/i18n/dictionary";

/**
 * "Play a friend", and what happens when it is pressed.
 *
 * The match is created here rather than on the server render, so visiting the
 * page costs nothing and only a real intent to play deals a hand of ten
 * rounds. The seat token is written to `sessionStorage` *before* navigating —
 * if the order were the other way round the match page would arrive with no
 * seat, fail to find one, and try to join the match this player had just
 * created, taking seat two in their own game.
 */
export function VersusStart({ t }: { t: Dict }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (busy) return;
    setBusy(true);
    setError(null);

    const result = await createVersusMatch();
    if (!result.ok) {
      setError(t.versusCreateFailed);
      setBusy(false);
      return;
    }

    try {
      window.sessionStorage.setItem(
        `tempus:versus:${result.code}`,
        JSON.stringify({
          matchId: result.matchId,
          token: result.token,
          seat: result.seat,
        }),
      );
    } catch {
      // Storage can be unavailable in private browsing. The match still
      // exists and the push below still works; the cost is that a reload
      // would come back as a new player rather than as the host.
    }

    router.push(`/versus/${result.code}`);
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-4">
      <TimelineBackdrop pane={DEFAULT_PANE} />

      <div className="w-full max-w-md rounded-3xl border border-white/12 bg-black/45 px-7 py-8 text-center shadow-2xl shadow-black/70 backdrop-blur-2xl">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/55">
          {t.timelineTitle}
        </p>
        <h2 className="mt-1 font-display text-2xl font-semibold text-ink">
          {t.versusTitle}
        </h2>
        <p className="mx-auto mt-2 max-w-xs text-sm text-white/70">
          {t.versusBlurb}
        </p>

        <button
          type="button"
          onClick={start}
          disabled={busy}
          aria-busy={busy}
          className={`mt-6 w-full rounded-full border border-transparent bg-ink px-6 py-2.5 text-sm font-semibold text-page transition hover:opacity-85 ${
            busy ? "cursor-progress opacity-60" : ""
          }`}
        >
          {busy ? t.versusStarting : t.versusPlayFriend}
        </button>

        {error && <p className="mt-3 text-xs text-bad">{error}</p>}

        <Link
          href="/guess"
          className="mt-5 inline-block text-xs text-white/55 underline-offset-4 transition hover:text-ink hover:underline"
        >
          {t.tryTimeline}
        </Link>
      </div>
    </div>
  );
}
