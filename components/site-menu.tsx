"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { signOut } from "@/app/actions/auth";
import { setLocale } from "@/app/actions/locale";
import { isTransparentRoute } from "@/components/site-header";
import { ACCOUNT_PATH, signInHref, SIGN_IN_PATH } from "@/lib/auth/paths";
import { contactHref } from "@/lib/contact";
import type { Account, SupportedLocale } from "@/lib/db/types";
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
 * **Every row is live.** Home, leaderboard, achievements, account, contact and
 * the tip jar are routes; FAQ is a *section* of the home page (`/#faq`) rather
 * than a route of its own, so it works from anywhere on the site. All of them
 * close the panel on the way out, or it would be left sitting over the thing
 * it just scrolled to.
 *
 * The Home row is first because it is the one destination that is not a page
 * *about* the player or the site but the way back to playing, and because this
 * button is the only chrome on a game screen — `/guess` and `/compare` are one
 * viewport with no header to click a wordmark in, so without this row the only
 * way out of a game is the browser's own back button.
 *
 * **Pressing a row arms the button's progress ring.** The panel closes on the
 * way out, so between the press and the next page there was nothing on screen
 * saying anything was happening — on a route that has to fetch a round's worth
 * of events that is a visible, silent wait. The rows navigate through
 * `router.push` inside a transition rather than letting the `Link` do it, which
 * is what makes "has it arrived" a value this component holds; the `href` stays
 * on the anchor, so a middle-click, a modified click and a copied link address
 * all still behave like links. The language chips and the sign-out share the
 * ring, because from the reader's side they are the same press.
 *
 * **Contact and the tip jar are two doors into one page.** Both go to
 * `/contact`, which holds the two errands in whichever order the row that was
 * pressed implies — see `lib/contact.ts`. That is also why the tip jar's label
 * is `supportTitle`, its own section's heading, rather than a `menu*` key: it
 * joins the three rows that are named from where they land, so a row and its
 * heading cannot drift apart in five languages. Contact keeps `menuContact`,
 * since the page it lands on has two names and neither is the row's.
 *
 * **Two rows change with the session, and the fourth changes identity.**
 * Achievements and account need an account, so while signed out they point at
 * the sign-in form carrying a `next` rather than at a page the middleware would
 * bounce; and the "sign in" row becomes a "sign out" form once there is a
 * session, because one slot holds the door in and the door out. The session is
 * read on the server and handed down as `account` — see the prop.
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
  account,
  inline,
}: {
  locale: SupportedLocale;
  t: Dict;
  /**
   * Whoever is signed in, or null. Resolved on the server and handed down as
   * three strings rather than read here: the menu is a Client Component, and a
   * browser read of the session would leave the panel saying "sign in" on the
   * very page the player just signed in from until the next navigation.
   */
  account: Account | null;
  /** Render as a flex item rather than on the fixed viewport track. */
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [opening, setOpening] = useState(0);
  /* One transition for every press in the panel. A locale change and a
     navigation are two different writes, but from the reader's side they are
     the same gesture — the panel shuts and something is being waited for — so
     they drive one indicator rather than two. */
  const [pending, startTransition] = useTransition();
  /* The sign-out is a `<form action={...}>`, whose pending state only exists
     inside the form. `SignOutRow` reports it up so the ring can show it too. */
  const [signingOut, setSigningOut] = useState(false);
  const busy = pending || signingOut;
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

  /* The rows navigate through here rather than letting the `Link` do it, so the
     wait has an owner: `pending` stays true until the destination's payload has
     been fetched and rendered, which is exactly as long as the ring should
     turn. The anchor keeps its `href`, and `MenuRow` only diverts the plain
     left click — every other way of following a link is left alone. */
  function go(href: string) {
    setOpen(false);
    startTransition(() => {
      router.push(href);
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
        aria-busy={busy || undefined}
        /* `relative` is what the ring hangs off: it is `inset: -3px` on this
           box, so it tracks `--menu-btn` rather than carrying a size of its
           own. The box itself reads that token too, because the fixed track
           below solves this button's `top` from it. */
        className={`relative flex h-[var(--menu-btn)] w-[var(--menu-btn)] items-center justify-center rounded-full text-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
          onPhoto
            ? "border border-white/15 bg-white/10 backdrop-blur-xl hover:bg-white/20"
            : "border border-hairline bg-card/80 backdrop-blur hover:bg-card-raised"
        }`}
      >
        {/* Always mounted, faded by `data-busy`: a ring that mounted on the
            press would have to animate in from its first frame, and a
            navigation that resolves in under the fade never shows at all —
            which is the right answer for one that fast. */}
        <span className="pending-ring" data-busy={busy} aria-hidden="true" />

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
            {/* Every row but the tip jar is a real destination now. The three
                labels that name a page are taken from that page's own title
                rather than from a `menu*` key, so a row and the heading it
                lands on cannot drift apart in five languages. */}
            {/* First, and the only row on a game screen that leads back out of
                it: `/guess` and `/compare` are exactly one viewport with no
                wordmark to press. */}
            <MenuRow
              index={0}
              href="/"
              onNavigate={go}
              label={t.menuHome}
              icon={<HomeIcon />}
            />
            <MenuRow
              index={1}
              href="/leaderboard"
              onNavigate={go}
              label={t.leaderboardTitle}
              icon={<TrophyIcon />}
            />
            {/* Both gated rows point at the sign-in form while signed out
                rather than at the page itself. The middleware would redirect
                either way — this is so the URL in the status bar is the truth
                before the click, and so the form knows where to return to. */}
            <MenuRow
              index={2}
              href={
                account ? "/achievements" : signInHref("/achievements")
              }
              onNavigate={go}
              label={t.achievementsTitle}
              icon={<MedalIcon />}
            />
            <MenuRow
              index={3}
              href={account ? ACCOUNT_PATH : signInHref(ACCOUNT_PATH)}
              onNavigate={go}
              label={t.menuAccount}
              /* The name under the row is the whole of the panel's "you are
                 signed in" state. A banner above the list would be a second
                 thing to translate and a second thing to lay out, and the row
                 it would be announcing is right here. */
              detail={account?.displayName}
              icon={<PersonIcon />}
            />
            {/* One slot, two controls: the door in and the door out. They are
                never both on screen, and the second is a form rather than a
                link because signing out is a write — it clears the session
                cookie, which a GET must not do. */}
            {account ? (
              <SignOutRow
                index={4}
                label={t.menuSignOut}
                onPending={setSigningOut}
              />
            ) : (
              <MenuRow
                index={4}
                href={SIGN_IN_PATH}
                onNavigate={go}
                label={t.menuSignIn}
                icon={<KeyIcon />}
              />
            )}
            {/* Closing on the way is what makes the jump visible: left open,
                the panel would be sitting over the top of the section it just
                scrolled to. The FAQ lands on a section of the home page rather
                than a route, so it works from anywhere on the site. */}
            <MenuRow
              index={5}
              href="/#faq"
              onNavigate={go}
              label={t.menuFaq}
              icon={<QuestionIcon />}
            />
            {/* The last two rows are the same page, entered from its two ends:
                the order the sections are dealt in is the whole of what the
                href decides. */}
            <MenuRow
              index={6}
              href={contactHref("contact")}
              onNavigate={go}
              label={t.menuContact}
              icon={<EnvelopeIcon />}
            />
            <MenuRow
              index={7}
              href={contactHref("support")}
              onNavigate={go}
              label={t.supportTitle}
              icon={<CupIcon />}
            />
          </nav>

          {/* The language picker is a control rather than a destination, so it
                  is separated by a rule rather than sitting in the list of rows
                  that navigate. */}
          <div
            className="menu-item-in mt-2 border-t border-hairline/70 px-3 pb-1 pt-3"
            style={{ "--menu-i": 8 } as React.CSSProperties}
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
     the two agree to the pixel.

     **The `top` is solved, not chosen.** The button is `fixed`, so nothing in
     the bar can centre it against the wordmark beside it; this is the
     arithmetic the bar's own `items-center` does, written out — half of what
     the bar has left over once the button is in it. It was a flat `top-7` and
     the two were 12px apart on every page off home, which is exactly what a
     second independent number buys. Both halves read tokens, so neither the
     bar's height nor the button's size can move without this following. */
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc((var(--site-bar-h)-var(--menu-btn))/2)] z-50">
      <div className="mx-auto flex max-w-7xl justify-end px-6">{button}</div>
    </div>
  );
}

/**
 * One row of the menu.
 *
 * Every row has an `href` today, so every row is a `Link`. The other branch
 * stays rather than being deleted: without one it is an `aria-disabled`
 * `button`, which is what a row whose destination does not exist yet should be
 * — a link to a route that 404s is worse than a control that says so, and
 * `aria-disabled` rather than `disabled` keeps such a row in the tab order and
 * in the menu's shape. The tip jar was the last of them until it gained a page
 * on 2026-10-07.
 */
const ROW_SHAPE =
  "menu-item-in flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-[15px] font-semibold text-ink/85 transition-colors hover:bg-card-raised hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent";

function MenuRow({
  index,
  label,
  icon,
  href,
  detail,
  onNavigate,
}: {
  index: number;
  label: string;
  icon: React.ReactNode;
  /** A real destination. Without it the row only announces itself. */
  href?: string;
  /** A second, quieter line — the signed-in player's name on the account row. */
  detail?: string;
  /** Closes the panel and drives the button's ring for as long as the
   *  destination takes to arrive. Given the `href` because it does the pushing
   *  itself — see `go` in `SiteMenu`. */
  onNavigate?: (href: string) => void;
}) {
  const order = { "--menu-i": index } as React.CSSProperties;

  /* Two lines when there is a detail, one when there is not, and the icon is
     centred against the pair either way. `truncate` on the detail rather than
     on the label: a long username must not push the row wider than the panel,
     and the label is a dictionary string that was chosen to fit. */
  const body = (
    <>
      <span className="text-ink-dim">{icon}</span>
      <span className="min-w-0 flex-1">
        {label}
        {detail ? (
          <span className="block truncate text-[12px] font-normal text-ink-dim">
            {detail}
          </span>
        ) : null}
      </span>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        /* Only the plain left click is diverted. A modified or middle click is
           the reader asking the browser for a tab or a window, and preventing
           it to run our own `router.push` would turn every one of those into a
           navigation in this tab. `defaultPrevented` is checked first so this
           can never fight something upstream that has already handled the
           press. */
        onClick={(event) => {
          if (!onNavigate || event.defaultPrevented) return;
          if (event.button !== 0) return;
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
            return;
          }
          event.preventDefault();
          onNavigate(href);
        }}
        style={order}
        className={ROW_SHAPE}
      >
        {body}
      </Link>
    );
  }

  return (
    <button type="button" aria-disabled="true" style={order} className={ROW_SHAPE}>
      {body}
    </button>
  );
}

/**
 * The way out, in the row the way in occupies while signed out.
 *
 * A form rather than a `Link`: signing out clears the session cookie, and the
 * action that does it redirects home afterwards — so the panel is never left
 * open over a page that has changed underneath it, and no `setOpen(false)` is
 * needed here. It carries the same shape as every other row, so the list does
 * not visibly gain a button.
 */
function SignOutRow({
  index,
  label,
  onPending,
}: {
  index: number;
  label: string;
  /** Lifts this form's pending state to the button's ring. `useFormStatus`
   *  only reads the form a component is *inside*, so the report has to start
   *  here rather than being asked for from above. */
  onPending: (pending: boolean) => void;
}) {
  return (
    <form action={signOut} className="contents">
      <SignOutButton index={index} label={label} onPending={onPending} />
    </form>
  );
}

function SignOutButton({
  index,
  label,
  onPending,
}: {
  index: number;
  label: string;
  onPending: (pending: boolean) => void;
}) {
  const { pending } = useFormStatus();

  useEffect(() => {
    onPending(pending);
    /* The action redirects, so this component is unmounted rather than being
       told the request finished — the cleanup is what actually clears the ring
       on the far side of a sign-out. */
    return () => onPending(false);
  }, [pending, onPending]);

  return (
    <button
      type="submit"
      style={{ "--menu-i": index } as React.CSSProperties}
      className={ROW_SHAPE}
    >
      <span className="text-ink-dim">
        <ExitIcon />
      </span>
      <span className="min-w-0 flex-1">{label}</span>
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

function HomeIcon() {
  return (
    <svg {...ICON}>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M6 9.8V19a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9.8" />
      <path d="M10 20v-5h4v5" />
    </svg>
  );
}

function TrophyIcon() {
  return (
    <svg {...ICON}>
      <path d="M7 4h10v5a5 5 0 0 1-10 0V4Z" />
      <path d="M7 6H4.5v1A3.5 3.5 0 0 0 8 10.5M17 6h2.5v1a3.5 3.5 0 0 1-3.5 3.5" />
      <path d="M12 14v3M9 20h6M10 17h4l.5 3h-5l.5-3Z" />
    </svg>
  );
}

function MedalIcon() {
  return (
    <svg {...ICON}>
      <circle cx="12" cy="14" r="6" />
      <path d="M12 11.6l1 2 2.2.3-1.6 1.5.4 2.2-2-1-2 1 .4-2.2L8.8 14l2.2-.3 1-2.1Z" />
      <path d="M8.5 8.6 6 3.5h12l-2.5 5.1" />
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

function ExitIcon() {
  return (
    <svg {...ICON}>
      <path d="M15 4.5h2.5A2.5 2.5 0 0 1 20 7v10a2.5 2.5 0 0 1-2.5 2.5H15" />
      <path d="M11 8l-4 4 4 4M7 12h9" />
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
