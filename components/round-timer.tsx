"use client";

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
