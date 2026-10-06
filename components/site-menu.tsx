"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { setLocale } from "@/app/actions/locale";
import { isTransparentRoute } from "@/components/site-header";
import type { SupportedLocale } from "@/lib/db/types";
import type { Dict } from "@/lib/i18n/dictionary";
import { UI_LOCALES } from "@/lib/i18n/locales";

/**
 * The top-right menu: three bars that fold into an X, and a panel that grows
 * out of the corner the button sits in.
 *
 * It replaced the bare language pill, which is why the language picker is
 * inside it rather than beside it. The picker was a dropdown of its own and is
 * now a row of five chips: a menu that opened a second menu would have had two
 * layers of overlay on top of a game, and the five options are short enough to
 * sit side by side with the current one simply marked.
 *
 * Everything else in here is named but not wired — leaderboard, accounts,
 * contact, the tip jar. They are rendered as buttons that announce themselves as
 * unavailable rather than as links to a 404, the same holding pattern the home
 * page's coming-soon tiles use. FAQ is the exception and is a real link: the
 * answers are a section at the foot of the home page rather than a route of
 * their own, so the row goes to `/#faq` from anywhere on the site.
 *
 * The animation itself is CSS (see the menu block in app/globals.css); this
 * component owns only the `open` flag the stylesheet keys off. The one piece of
 * state that is not just `open` is `opening`, a counter bumped on every open so
 * the item stagger can be restarted by remounting the list — a CSS animation
 * that has already finished does not run again merely because its element
 * became visible.
 *
 * **Off home it is pinned to the viewport, not to the bar**, and that is why it
 * is a sibling of `SiteHeader` rather than a child of it. It stays put while
 * the page scrolls — the only control the site has must not be something you
 * have to scroll back up for, and the bar itself deliberately hides on a
 * downward scroll. It also cannot live inside the header for a concrete reason
 * rather than a tidy one: that element is translated out of view to hide, and a
 * transformed ancestor becomes the containing block for its `fixed`
 * descendants, so the button would have slid away with the bar.
 *
 * **On home it is `inline` instead**, a flex item at the right-hand end of the
 * hero's masthead row. There is no bar on that page and nothing to scroll out
 * from under: the masthead is centred with the board against the whole first
 * screen, so a button pinned to the top of the viewport would float free of the
 * row it belongs to. Inline, it rides the board's own column and lands over the
 * top-right corner of the card below it. The home page renders that copy
 * itself; the floating one in the layout stands down there, which is the
 * `home` check below — two instances in the tree, never two on screen.
 */
export function SiteMenu({
  locale,
  t,
  inline,
}: {
  locale: SupportedLocale;
  t: Dict;
  /** Render as a flex item rather than on the fixed viewport track. */
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState(0);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const container = useRef<HTMLDivElement>(null);
  const panelId = useId();
  // Over a full-bleed photograph the button borrows the game's glass pill
  // rather than the card surface, so the only control on those screens does not
  // read as a panel left behind from another page.
  const pathname = usePathname();
  const onPhoto = isTransparentRoute(pathname);
  const home = pathname === "/";

  // Click-away and Escape, so the panel never strands itself open over a game.
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function toggle() {
    setOpen((wasOpen) => {
      if (!wasOpen) setOpening((n) => n + 1);
      return !wasOpen;
    });
  }

  function choose(next: SupportedLocale) {
    setOpen(false);
    if (next === locale) return;

    // Event names come from `event_localized`, so the language has to be
    // re-queried on the server rather than swapped on the client.
    startTransition(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  // After the hooks, never before them: the home page renders its own inline
  // copy inside the masthead row, so the layout's floating one would be a
  // second button over the first.
  if (!inline && home) return null;

  const button = (
    <div ref={container} className="pointer-events-auto relative">
      <button
        type="button"
        onClick={toggle}
        aria-label={open ? t.menuClose : t.menuOpen}
        aria-expanded={open}
        aria-controls={panelId}
        className={`flex h-[42px] w-[42px] items-center justify-center rounded-full text-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          onPhoto
            ? "border border-white/15 bg-white/10 backdrop-blur-xl hover:bg-white/20"
            : "border border-hairline bg-card/80 backdrop-blur hover:bg-card-raised"
        }`}
      >
        <span className="menu-bars" data-open={open} aria-hidden="true">
          <span className="menu-bar">
            <i />
          </span>
          <span className="menu-bar">
            <i />
          </span>
          <span className="menu-bar">
            <i />
          </span>
        </span>
      </button>

      {/* Always mounted, never conditionally rendered: the clip has to animate
              in both directions, and an element that unmounts on close has no
              closing frame to show. `inert` is what keeps the hidden panel out of
              the tab order and away from the pointer — `pointer-events-none` alone
              would still leave six focusable rows behind the page.

              The 24px radius is repeated in the `round` of the clip path; the two
              have to agree or the corners read as chipped at full size. */}
      <div
        id={panelId}
        data-open={open}
        inert={!open || undefined}
        className={`menu-panel absolute right-0 top-[calc(100%+12px)] z-50 w-[min(19rem,calc(100vw-3rem))] rounded-[24px] p-2 shadow-2xl shadow-black/70 ${
          onPhoto
            ? "border border-white/15 bg-black/55 backdrop-blur-2xl"
            : "border border-hairline bg-card/95 backdrop-blur-2xl"
        }`}
      >
        {/* Keyed on the open count so the stagger replays every time, and faded
                as a block on the way out — see `.menu-items-out`. */}
        <div key={opening} className={open ? undefined : "menu-items-out"}>
          <nav className="flex flex-col">
            <MenuRow
              index={0}
              label={t.menuLeaderboard}
              icon={<TrophyIcon />}
            />
            <MenuRow index={1} label={t.menuAccount} icon={<PersonIcon />} />
            <MenuRow index={2} label={t.menuSignIn} icon={<KeyIcon />} />
            {/* The one row that goes somewhere. Closing on the way is what
                makes the jump visible: left open, the panel would be sitting
                over the top of the section it just scrolled to. */}
            <MenuRow
              index={3}
              href="/#faq"
              onNavigate={() => setOpen(false)}
              label={t.menuFaq}
              icon={<QuestionIcon />}
            />
            <MenuRow index={4} label={t.menuContact} icon={<EnvelopeIcon />} />
            <MenuRow index={5} label={t.menuCoffee} icon={<CupIcon />} />
          </nav>

          {/* The language picker is the one live control in here, so it is
                  separated by a rule rather than sitting in the same list as five
                  placeholders. */}
          <div
            className="menu-item-in mt-2 border-t border-hairline/70 px-3 pb-1 pt-3"
            style={{ "--menu-i": 6 } as React.CSSProperties}
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-dim">
              {t.language}
            </p>
            {/* A row of chips rather than the dropdown this control used to be:
                    a menu that opens a menu would stack two overlays over a game,
                    and five two-letter codes fit on one line at every width the
                    panel has. */}
            <div
              role="group"
              aria-label={t.language}
              className="mt-2 flex flex-wrap gap-1.5"
            >
              {UI_LOCALES.map((option) => {
                const selected = option.code === locale;
                return (
                  <button
                    key={option.code}
                    type="button"
                    lang={option.code}
                    aria-pressed={selected}
                    disabled={pending}
                    onClick={() => choose(option.code)}
                    title={option.native}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                      selected
                        ? "bg-ink text-page"
                        : "bg-card-raised/70 text-ink-dim hover:bg-card-raised hover:text-ink"
                    }`}
                  >
                    {option.short}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  if (inline) return button;

  /* The track is viewport-wide and transparent to the pointer: it exists only
     to put the button on the same centred `max-w-7xl` column the cards below it
     use, and a full-width fixed bar that swallowed clicks would make the top of
     every page dead. `inset-x-0` measures the initial containing block, which
     excludes the scrollbar — the same width the in-flow rows are centred in, so
     the two agree to the pixel. */
  return (
    <div className="pointer-events-none fixed inset-x-0 top-7 z-50">
      <div className="mx-auto flex max-w-7xl justify-end px-6">{button}</div>
    </div>
  );
}

/**
 * One row of the menu.
 *
 * Without `href` it is a `button` rather than a `Link`, because most of these
 * destinations do not exist yet: a link to a route that 404s is worse than a
 * control that says so. It stays focusable and keeps its hover so the panel
 * reads as finished rather than as half-built, and `aria-disabled` is what
 * tells a screen reader the difference — `disabled` would drop the row out of
 * the tab order and out of the menu's shape entirely.
 *
 * With one, it is an ordinary `Link` in the same clothes. Only FAQ has one
 * today.
 */
function MenuRow({
  index,
  label,
  icon,
  href,
  onNavigate,
}: {
  index: number;
  label: string;
  icon: React.ReactNode;
  /** A real destination. Without it the row only announces itself. */
  href?: string;
  onNavigate?: () => void;
}) {
  const shape =
    "menu-item-in flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-[15px] font-semibold text-ink/85 transition-colors hover:bg-card-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent";
  const order = { "--menu-i": index } as React.CSSProperties;

  if (href) {
    return (
      <Link href={href} onClick={onNavigate} style={order} className={shape}>
        <span className="text-ink-dim">{icon}</span>
        {label}
      </Link>
    );
  }

  return (
    <button type="button" aria-disabled="true" style={order} className={shape}>
      <span className="text-ink-dim">{icon}</span>
      {label}
    </button>
  );
}

/* Line icons at one weight, matching the globe and chevron the language pill
   used to carry. 18px rather than 16 because they sit beside 15px text here
   instead of 14px. */
const ICON = {
  viewBox: "0 0 24 24",
  "aria-hidden": true,
  className: "h-[18px] w-[18px]",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function TrophyIcon() {
  return (
    <svg {...ICON}>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4.5v1A3.5 3.5 0 0 0 8 10.5M17 6h2.5v1a3.5 3.5 0 0 1-3.5 3.5" />
      <path d="M12 14v3M9 20h6M10 17h4l.5 3h-5l.5-3Z" />
    </svg>
  );
}

function KeyIcon() {
  return (
    <svg {...ICON}>
      <circle cx="8" cy="9" r="4" />
      <path d="M11 11.5 20 20M17.5 17.5 19 16M15 15l1.5-1.5" />
    </svg>
  );
}

function PersonIcon() {
  return (
    <svg {...ICON}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

function QuestionIcon() {
  return (
    <svg {...ICON}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.3a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.8-.9 1.4v.4" />
      <path d="M12 16.8h.01" />
    </svg>
  );
}

function EnvelopeIcon() {
  return (
    <svg {...ICON}>
      <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
      <path d="m3.8 7 7.1 5.3a2 2 0 0 0 2.2 0L20.2 7" />
    </svg>
  );
}

function CupIcon() {
  return (
    <svg {...ICON}>
      <path d="M4 9h12v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9Z" />
      <path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M7.5 3.5v2M11 3.5v2" />
    </svg>
  );
}
