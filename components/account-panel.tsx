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
import { removeAvatar, uploadAvatar } from "@/app/actions/avatar";
import { authErrorText } from "@/components/auth-message";
import { AVATAR_ACCEPT, AVATAR_MAX_BYTES, looksLikeAvatarFile } from "@/lib/avatar";
import type { Dict } from "@/lib/i18n/dictionary";

/**
 * The two things an account can change about itself, and the way out.
 *
 * Deliberately short. There are no game records to manage and no notification
 * settings to toggle — the site stores a username and a picture and nothing
 * else about a player (see `public.profile`). So this is a photo, a name, a
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
  avatarUrl,
  hasAvatar,
}: {
  t: Dict;
  /** What the player's picture currently is — theirs, or the default. */
  avatarUrl: string;
  /** Whether that is an upload of theirs, i.e. whether there is one to remove. */
  hasAvatar: boolean;
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
      <PhotoRow t={t} avatarUrl={avatarUrl} hasAvatar={hasAvatar} />

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
                /* **No `pattern`, `minLength` or `maxLength`.** They handed
                   the refusal to the browser, which answers a failed
                   `pattern` with "Please match the requested format" in its
                   own language — neither this site's language nor an
                   explanation — and `maxLength` silently ate everything past
                   the twentieth character. `validateUsername` decides in the
                   Server Action instead, and `Feedback` prints its sentence
                   under the field. Case is not part of it: "Ali" is accepted
                   and stored as "ali". */
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

/**
 * The picture, and the two things that can be done to it.
 *
 * **Picking a file is the submit.** There is nothing to fill in beside it, so
 * a separate Save would be a second click that can only ever mean yes. The
 * size and type are checked here first — the same limits the action enforces
 * — so an oversized phone photo is refused at once instead of after the whole
 * file has been sent.
 *
 * No local preview while it uploads: Chrome cannot draw a HEIC, and a preview
 * that works for three formats out of four is a broken image a quarter of the
 * time. The new picture arrives with the page's revalidation instead.
 */
function PhotoRow({
  t,
  avatarUrl,
  hasAvatar,
}: {
  t: Dict;
  avatarUrl: string;
  hasAvatar: boolean;
}) {
  const idle = { status: "idle" } as AuthState;
  const [uploadState, upload, uploading] = useActionState(uploadAvatar, idle);
  const [removeState, remove, removing] = useActionState(removeAvatar, idle);
  /* Which of the two forms spoke last, so a stale "Photo removed." does not
     sit under a fresh upload, and a refusal decided here before any request
     replaces both. */
  const [last, setLast] = useState<"upload" | "remove" | null>(null);
  const [refusal, setRefusal] = useState<AuthErrorCode | null>(null);
  const form = useRef<HTMLFormElement>(null);

  /* A removal that lands takes the Remove button away with the picture, and a
     keyboard user with it to <body>. The upload control is what is left, so
     focus goes there — only if it was actually dropped. */
  const picker = useRef<HTMLInputElement>(null);
  const hadAvatar = useRef(hasAvatar);
  useEffect(() => {
    const dropped =
      !document.activeElement || document.activeElement === document.body;
    if (hadAvatar.current && !hasAvatar && dropped) {
      picker.current?.focus({ preventScroll: true });
    }
    hadAvatar.current = hasAvatar;
  }, [hasAvatar]);

  function picked(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    setLast("upload");
    const problem: AuthErrorCode | null = !looksLikeAvatarFile(file)
      ? "photo-type"
      : file.size > AVATAR_MAX_BYTES
        ? "photo-too-large"
        : null;
    setRefusal(problem);
    if (problem) {
      // Cleared so choosing the same file again still fires `change`.
      input.value = "";
      return;
    }
    form.current?.requestSubmit();
  }

  const busy = uploading || removing;

  return (
    <Row title={t.accountPhotoTitle} blurb={t.accountPhotoBlurb}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <img
          src={avatarUrl}
          alt=""
          aria-hidden="true"
          className="h-16 w-16 shrink-0 rounded-full border border-hairline object-cover"
        />

        <div className="flex flex-wrap items-center gap-2">
          <form ref={form} action={upload}>
            {/* The input is the control and the label is what it looks like:
                a native file button cannot be styled, and hiding it with
                `sr-only` keeps it focusable — the ring is drawn on the label
                while the input inside it has focus. */}
            {/* `border-transparent` so it is the same height as Remove beside
                it, which has a hairline border. */}
            <label
              aria-busy={uploading}
              className={`inline-block cursor-pointer rounded-full border border-transparent bg-ink px-5 py-2.5 text-[14px] font-semibold text-page transition-opacity hover:opacity-90 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                busy ? "pointer-events-none opacity-60" : ""
              }`}
            >
              {uploading
                ? t.accountPhotoUploading
                : hasAvatar
                  ? t.accountPhotoChange
                  : t.accountPhotoUpload}
              <input
                ref={picker}
                type="file"
                name="photo"
                accept={AVATAR_ACCEPT}
                disabled={busy}
                onChange={picked}
                className="sr-only"
              />
            </label>
          </form>

          {hasAvatar ? (
            <form
              action={remove}
              onSubmit={() => {
                setLast("remove");
                setRefusal(null);
              }}
            >
              <button
                type="submit"
                disabled={busy}
                aria-busy={removing}
                className="rounded-full border border-hairline bg-card-raised/70 px-5 py-2.5 text-[14px] font-semibold text-ink transition-colors hover:bg-card-raised disabled:cursor-progress disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {removing ? t.authWorking : t.accountPhotoRemove}
              </button>
            </form>
          ) : null}
        </div>
      </div>

      <p className="mt-3 text-[12px] text-ink-dim">{t.accountPhotoHint}</p>

      {refusal ? (
        <Note tone="bad">{authErrorText(t, refusal)}</Note>
      ) : last === "upload" ? (
        <Feedback t={t} state={uploadState} success={t.accountPhotoSaved} />
      ) : last === "remove" ? (
        <Feedback t={t} state={removeState} success={t.accountPhotoRemoved} />
      ) : null}
    </Row>
  );
}

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

  /* Closing — Cancel, or a save — unmounts whatever had focus, which drops a
     keyboard user to <body>. The button that opened the editor is back in its
     place, so focus goes back to it. Only on a close, and only when focus was
     actually dropped: the first render, an open (where the field's `autoFocus`
     takes it) and a save that lands after focus has moved on are left alone. */
  const opener = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    const dropped =
      !document.activeElement || document.activeElement === document.body;
    if (wasEditing.current && !editing && dropped) {
      opener.current?.focus({ preventScroll: true });
    }
    wasEditing.current = editing;
  }, [editing]);

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
            ref={opener}
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
    return <Note tone="bad">{authErrorText(t, state.code, state.detail)}</Note>;
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
