"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  signOut,
  updatePassword,
  updateUsername,
  type AuthErrorCode,
  type AuthState,
} from "@/app/actions/auth";
import type { Dict } from "@/lib/i18n/dictionary";

/**
 * The two things an account can change about itself, and the way out.
 *
 * Deliberately short. There are no game records to manage, no notification
 * settings to toggle and no profile to fill in — the site stores a username and
 * nothing else about a player (see `public.profile`). So this is a name, a
 * password and a sign-out, and everything else on the page is read-only
 * information rendered on the server.
 *
 * **Nothing here is editable until it is asked for.** Both settings read as
 * what they currently are — the name as text, the password as four dots — with
 * one button beside them that opens the editor. A page of live inputs with
 * permanent Save buttons invites a change on every visit and makes the two
 * destructive controls on it the loudest things on the screen; a page of
 * statements with a way to change each is what a settings page is. It also
 * removes the state this form used to be able to reach, where a half-typed name
 * sat in a field with a Save button beside it and nothing said whether it had
 * been saved.
 *
 * Each editor is its own `<Editor>`: one open/closed flag, one Cancel, and the
 * fields remounted on every open so an abandoned edit cannot be found still
 * typed-in later.
 *
 * Each form keeps its own action state, so saving a name cannot leave its
 * "saved" under the password form. `useFormStatus` reads the status of the form
 * a button is *inside*, which is what keeps one submit from putting both
 * buttons into their working state.
 *
 * **The password editor has two shapes and the session picks which.** An
 * account with an email identity is asked for its current password, because a
 * borrowed unlocked browser should not be able to lock its owner out. An
 * account that signed in with Google has no password to be asked for, so it is
 * offered a first one instead — Supabase adds the email identity beside the
 * Google one, so both doors work afterwards. `updatePassword` re-decides the
 * same question from the session rather than trusting this component.
 */
export function AccountPanel({
  t,
  username,
  email,
  hasPassword,
}: {
  t: Dict;
  /** The current name, or null when one has never been chosen. */
  username: string | null;
  /** The address the session is keyed on. Shown, never editable — see below. */
  email: string | null;
  /** Whether this account has an email/password identity at all. */
  hasPassword: boolean;
}) {
  const [nameState, rename, renaming] = useActionState(updateUsername, {
    status: "idle",
  } as AuthState);
  const [passwordState, changePassword, changing] = useActionState(
    updatePassword,
    { status: "idle" } as AuthState,
  );

  return (
    <div className="flex flex-col gap-4">
      <Row title={t.accountUsernameTitle} blurb={t.accountUsernameBlurb}>
        <Editor
          t={t}
          open={t.accountChangeUsername}
          /* The editor closes itself on a save, so the row goes back to
             stating the new name rather than leaving the field open over an
             answer it has already given. */
          pending={renaming}
          done={nameState.status === "saved"}
          summary={
            username ? (
              <span className="text-ink">{username}</span>
            ) : (
              <span className="text-ink-dim">{t.accountUsernameUnset}</span>
            )
          }
          feedback={
            <Feedback t={t} state={nameState} success={t.accountSaved} />
          }
        >
          <form action={rename} className="flex flex-col gap-3">
            <div className="min-w-0">
              <input
                name="username"
                type="text"
                defaultValue={username ?? ""}
                placeholder={t.accountUsernameUnset}
                autoComplete="username"
                autoFocus
                required
                minLength={3}
                maxLength={20}
                /* The column's own character set, so the browser refuses a
                   Turkish ş here rather than at the end of a round trip. It
                   is a courtesy and not the rule — `validateUsername` on the
                   server is — but it is the one that answers while the name
                   is still being typed. Case is not part of it: "Ali" is
                   accepted and stored as "ali". */
                pattern="[A-Za-z0-9_]+"
                title={t.authUsernameHint}
                aria-label={t.accountUsernameTitle}
                className={FIELD}
              />
              <p className="mt-1.5 text-[12px] text-ink-dim">
                {t.authUsernameHint}
              </p>
            </div>
            <SaveButton label={t.accountSave} working={t.authWorking} />
          </form>
        </Editor>
      </Row>

      {/* Read-only. Changing the address a session is keyed on means a
          confirmation round trip through both mailboxes, which is a flow rather
          than a field — and nothing on this site needs it yet. It is still
          *printed*: a card that names the address and does not show it is a
          card that answers no question. */}
      <Row title={t.accountEmailTitle} blurb={t.accountEmailBlurb}>
        <p className="break-all rounded-2xl border border-hairline bg-card-raised/40 px-4 py-3 text-[15px] text-ink">
          {email}
        </p>
      </Row>

      <Row title={t.accountPasswordTitle} blurb={t.accountPasswordBlurb}>
        {/* The Google-only account is told what setting a password buys it
            before it is offered the button, because "set a password" on an
            account that already signs in fine is otherwise a control with no
            reason attached. */}
        {hasPassword ? null : (
          <p className="mb-4 text-[14px] leading-relaxed text-ink-dim">
            {t.accountGoogleOnly}
          </p>
        )}

        <Editor
          t={t}
          open={hasPassword ? t.accountChangePassword : t.accountSetPassword}
          pending={changing}
          done={passwordState.status === "saved"}
          /* Four dots rather than the real length: a password's length is the
             one thing about it worth not printing. An account with none says
             so instead. */
          summary={
            hasPassword ? (
              <span className="tracking-[0.3em] text-ink">••••</span>
            ) : (
              <span className="text-ink-dim">{t.accountUsernameUnset}</span>
            )
          }
          feedback={
            <Feedback
              t={t}
              state={passwordState}
              success={
                hasPassword ? t.accountPasswordSaved : t.accountPasswordSet
              }
            />
          }
        >
          <form action={changePassword} className="flex flex-col gap-3">
            {/* Asked for only when there is one to ask for. The action checks
                the same thing against the session, so a browser that removed
                this field would still be refused. */}
            {hasPassword ? (
              <PasswordField
                label={t.accountCurrentPassword}
                name="current"
                autoComplete="current-password"
                autoFocus
              />
            ) : null}
            <div className="grid gap-3 sm:grid-cols-2">
              <PasswordField
                label={t.accountNewPassword}
                name="password"
                hint={t.authPasswordHint}
                autoFocus={!hasPassword}
              />
              <PasswordField label={t.accountRepeatPassword} name="confirm" />
            </div>
            <div className="flex justify-start">
              <SaveButton label={t.accountSave} working={t.authWorking} />
            </div>
          </form>
        </Editor>
      </Row>

      {/* The way out, in a row of its own at the foot — the same position it
          takes in the menu, so it is where it is looked for. */}
      <form action={signOut} className="pt-2">
        <button
          type="submit"
          className="w-full rounded-full border border-hairline bg-card px-5 py-3 text-[15px] font-semibold text-ink transition-colors hover:bg-card-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent sm:w-auto sm:px-7"
        >
          {t.accountSignOut}
        </button>
      </form>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

const FIELD =
  "w-full rounded-2xl border border-hairline bg-card-raised/70 px-4 py-3 text-[15px] text-ink transition-colors placeholder:text-ink-dim focus:border-ink/25 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent";

/**
 * One setting: its name, what it is for, and the control if there is one.
 *
 * A card rather than plain text, unlike the badges page — a form needs an edge
 * to sit in, and a column of inputs on the bare background reads as one long
 * form rather than as four separate things you can change.
 */
function Row({
  title,
  blurb,
  children,
}: {
  title: string;
  blurb: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-card border border-hairline bg-card p-6 sm:p-7">
      <h2 className="font-display text-lg font-semibold tracking-[-0.01em]">
        {title}
      </h2>
      <p className="mt-1 text-[14px] leading-relaxed text-ink-dim">{blurb}</p>
      {children ? <div className="mt-5">{children}</div> : null}
    </section>
  );
}

/**
 * A setting that states itself until you ask to change it.
 *
 * Closed, it is the current value and one button. Open, it is the form and a
 * Cancel. Two things about it are deliberate:
 *
 * **The fields are unmounted while it is shut**, not hidden. A hidden input is
 * still submitted, still focusable unless something says otherwise, and still
 * holds whatever was last typed into it — so an abandoned edit would be waiting
 * the next time the editor was opened, and a password field would sit filled on
 * a page the browser's manager may have autofilled. Unmounting is also what
 * makes `autoFocus` work on every open rather than only the first.
 *
 * **It closes itself on a save**, which is what makes the summary line the
 * answer to "did that work" rather than a stale value under an open form. The
 * action's confirmation is kept on screen underneath, because closing the form
 * is not by itself a sentence saying the change landed.
 *
 * What it closes on is the *submission finishing*, not the saved state being
 * true. `useActionState` holds `saved` until the next submit, so an editor keyed
 * on the value alone cannot be opened a second time — and one keyed on the value
 * *changing* would close on the first save and never again, because the second
 * save sets the same object. The edge of `pending` is the only thing that ticks
 * once per submission.
 */
function Editor({
  t,
  open,
  pending,
  done,
  summary,
  feedback,
  children,
}: {
  t: Dict;
  /** What the button that opens this editor says. */
  open: string;
  /** Whether a submission of this editor's form is in flight. */
  pending: boolean;
  /** Whether the last submission reported a save. */
  done: boolean;
  /** The setting's current value, shown while the editor is shut. */
  summary: React.ReactNode;
  /** Whatever the last submit had to say. Shown in both states. */
  feedback: React.ReactNode;
  children: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  /* Whether the note under the editor belongs to anything on screen. Reopening
     after a save would otherwise leave "Saved" sitting under a form that has
     not been submitted yet. */
  const [reported, setReported] = useState(false);
  const wasPending = useRef(false);

  useEffect(() => {
    if (pending) setReported(true);
    if (wasPending.current && !pending && done) setEditing(false);
    wasPending.current = pending;
  }, [pending, done]);

  function start() {
    setReported(false);
    setEditing(true);
  }

  return (
    <div className="flex flex-col">
      {editing ? (
        <>
          {children}
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="mt-3 self-start rounded-full px-3 py-1.5 text-[13px] font-semibold text-ink-dim transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {t.accountCancel}
          </button>
        </>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="min-w-0 flex-1 truncate rounded-2xl border border-hairline bg-card-raised/40 px-4 py-3 text-[15px]">
            {summary}
          </p>
          <button
            type="button"
            onClick={start}
            className="shrink-0 rounded-full border border-hairline bg-card-raised/70 px-5 py-2.5 text-[14px] font-semibold text-ink transition-colors hover:bg-card-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {open}
          </button>
        </div>
      )}

      {reported ? feedback : null}
    </div>
  );
}

function PasswordField({
  label,
  name,
  hint,
  autoComplete = "new-password",
  autoFocus,
}: {
  label: string;
  name: string;
  hint?: string;
  autoComplete?: string;
  autoFocus?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-ink">{label}</span>
      <input
        name={name}
        type="password"
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        required
        /* The current-password field has no minimum of its own: the rule is
           what the account was created under, and refusing a short *existing*
           password would lock out anyone who signed up before it. */
        minLength={autoComplete === "current-password" ? undefined : 8}
        className={FIELD}
      />
      {hint ? <span className="text-[12px] text-ink-dim">{hint}</span> : null}
    </label>
  );
}

function SaveButton({ label, working }: { label: string; working: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="shrink-0 self-start rounded-full bg-ink px-6 py-3 text-[15px] font-semibold text-page transition-opacity hover:opacity-90 disabled:cursor-progress disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {pending ? working : label}
    </button>
  );
}

/**
 * Whatever the last submit had to say — an error, or a confirmation.
 *
 * Nothing at all until something has actually been submitted, which is why the
 * actions return a `saved` state rather than falling back to `idle`: a form
 * that has just been loaded and a form that has just succeeded are otherwise
 * the same object, and the page would announce a save it never made.
 */
function Feedback({
  t,
  state,
  success,
}: {
  t: Dict;
  state: AuthState;
  /** What to say once the form has succeeded. */
  success: string;
}) {
  if (state.status === "error") {
    return <Note tone="bad">{errorText(t, state.code)}</Note>;
  }
  if (state.status === "saved") return <Note tone="good">{success}</Note>;
  return null;
}

function Note({
  tone,
  children,
}: {
  tone: "good" | "bad";
  children: React.ReactNode;
}) {
  const base = tone === "bad" ? "var(--color-bad)" : "var(--color-good)";
  return (
    <p
      role="status"
      className="mt-3 rounded-2xl border px-4 py-2.5 text-[13px] leading-relaxed"
      style={{
        borderColor: `color-mix(in srgb, ${base} 35%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${base} 10%, transparent)`,
        color: `color-mix(in srgb, ${base} 55%, var(--color-ink))`,
      }}
    >
      {children}
    </p>
  );
}

/** The same table the sign-in form uses, and for the same reason: codes on the
 *  wire, sentences in the dictionary. */
function errorText(t: Dict, code: AuthErrorCode): string {
  const MESSAGES: Record<AuthErrorCode, string> = {
    "invalid-credentials": t.authErrInvalidCredentials,
    "email-invalid": t.authErrEmailInvalid,
    "email-taken": t.authErrEmailTaken,
    "password-weak": t.authErrPasswordWeak,
    "password-mismatch": t.authErrPasswordMismatch,
    "username-invalid": t.authErrUsernameInvalid,
    "username-chars": t.authErrUsernameChars,
    "username-taken": t.authErrUsernameTaken,
    "rate-limited": t.authErrRateLimited,
    "provider-failed": t.authErrProviderFailed,
    "current-password-wrong": t.authErrCurrentPassword,
    generic: t.authErrGeneric,
  };
  return MESSAGES[code];
}
