"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  requestPasswordReset,
  signInWithEmail,
  signInWithGoogle,
  signUpWithEmail,
  type AuthErrorCode,
  type AuthState,
} from "@/app/actions/auth";
import { authErrorText, usernameRefusal } from "@/components/auth-message";
import { format, type Dict } from "@/lib/i18n/dictionary";

/**
 * The one form for both doors: sign in and sign up, switched by a segmented
 * control rather than split across two routes.
 *
 * One route because the two forms differ by a single field, and because a
 * player who guesses wrong about which they need should not have to navigate to
 * find out. `middleware.ts` sends a signed-in visitor away from here entirely.
 *
 * **Every submit is a Server Action, not a browser call to Supabase.** The
 * session has to arrive as an HTTP cookie that Server Components can read on
 * the very next render, or the menu would still say "sign in" on the page you
 * just signed in from. That is also why there is no success state in here: a
 * successful action redirects, so this component never sees one.
 *
 * **The two modes keep separate state**, which is why there are two
 * `useActionState` hooks rather than one with a swapped action. A failed sign-in
 * must not leave its error sitting over the sign-up form when the player
 * switches across to try the other door.
 *
 * Errors arrive as codes and are looked up here — see `AuthErrorCode`. The UI
 * ships in five languages and Supabase's messages are English only.
 */

/** `forgot` is the reset-link request: reached from the sign-in form, not a
 *  tab of its own, because it is a detour from signing in rather than a door. */
type Mode = "signin" | "signup" | "forgot";

export function AuthForm({
  t,
  next,
  initialError,
  canReset,
}: {
  t: Dict;
  /** Where to go once there is a session. Validated server-side as well. */
  next: string | null;
  /** A code carried back by `/auth/callback` when the OAuth round trip failed. */
  initialError: AuthErrorCode | null;
  /** Whether a reset link can actually be mailed. Without a mail sender the
   *  link would promise an email that never leaves, so it is not offered. */
  canReset: boolean;
}) {
  const [mode, setMode] = useState<Mode>("signin");

  /* The typed username, held here rather than left to the DOM, because the
     field has to be able to answer before it is submitted — see `Field`'s
     `error` and `usernameRefusal`. `settled` is "the player has left the
     field at least once", which is what gates the one refusal that would
     otherwise fire on the second keystroke. */
  const [username, setUsername] = useState("");
  const [settled, setSettled] = useState(false);

  /** Switching doors clears the name along with the inputs — the form is keyed
   *  on the mode, so the DOM resets and this would otherwise be left holding a
   *  refusal for a field that is no longer on screen. */
  function switchTo(next: Mode) {
    setMode(next);
    setUsername("");
    setSettled(false);
  }

  const idle: AuthState = initialError
    ? { status: "error", code: initialError }
    : { status: "idle" };

  const [signInState, signIn] = useActionState(signInWithEmail, idle);
  const [signUpState, signUp] = useActionState(signUpWithEmail, { status: "idle" });
  const [googleState, google] = useActionState(signInWithGoogle, { status: "idle" });
  const [forgotState, forgot] = useActionState(requestPasswordReset, { status: "idle" });

  const state = mode === "signin" ? signInState : signUpState;

  /* The field's own answer, suppressed once the round trip has given the same
     one: the action re-runs the identical check, so leaving both on screen
     would print the same sentence twice, once under the input and once over
     the button. */
  const answered =
    signUpState.status === "error" &&
    signUpState.code.startsWith("username-");
  const usernameError = answered
    ? null
    : usernameRefusal(t, username, { settled });

  /* The inbox notice replaces the whole form rather than sitting above it.
     There is nothing left to fill in at that point, and a form still on screen
     invites a second sign-up with the same address. */
  if (forgotState.status === "sent") {
    return (
      <Panel>
        <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">
          {t.authConfirmTitle}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-dim">
          {format(t.authForgotSentBody, { email: forgotState.email })}
        </p>
      </Panel>
    );
  }

  if (mode === "forgot") {
    return (
      <Panel>
        <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
          {t.authForgotTitle}
        </h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-dim">
          {t.authForgotBlurb}
        </p>
        <form action={forgot} className="auth-fields mt-6 flex flex-col gap-4">
          <Field
            label={t.authEmail}
            name="email"
            type="email"
            autoComplete="email"
            required
          />
          {forgotState.status === "error" ? <ErrorNote t={t} state={forgotState} /> : null}
          <SubmitButton label={t.authForgotSubmit} working={t.authWorking} />
        </form>
        <button
          type="button"
          onClick={() => switchTo("signin")}
          className="mt-4 w-full text-center text-[13px] font-semibold text-ink-dim hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {t.authBackToSignIn}
        </button>
      </Panel>
    );
  }

  if (signUpState.status === "confirm") {
    return (
      <Panel>
        <h1 className="font-display text-2xl font-semibold tracking-[-0.02em]">
          {t.authConfirmTitle}
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-ink-dim">
          {format(t.authConfirmBody, { email: signUpState.email })}
        </p>
      </Panel>
    );
  }

  return (
    <Panel>
      <h1 className="font-display text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
        {mode === "signin" ? t.authSignInTitle : t.authSignUpTitle}
      </h1>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-dim">
        {mode === "signin" ? t.authSignInBlurb : t.authSignUpBlurb}
      </p>

      {/* A segmented control rather than a link to the other mode: both labels
          are visible at once, so there is never a moment where the player has
          to read a sentence to find out the other door exists. */}
      <div
        role="group"
        className="auth-step mt-6 grid grid-cols-2 gap-1 rounded-full border border-hairline bg-card-raised/60 p-1"
      >
        {(
          [
            ["signin", t.authTabSignIn],
            ["signup", t.authTabSignUp],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => switchTo(value)}
            className={`rounded-full px-4 py-2 text-[14px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
              mode === value
                ? "bg-ink text-page"
                : "text-ink-dim hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Google first, because an account that has one is one field instead of
          three. Its own form, so its failure (the provider not being enabled)
          does not read as a rejected password. */}
      <form action={google} className="auth-step mt-6">
        <input type="hidden" name="next" value={next ?? ""} />
        <GoogleButton label={t.authGoogle} working={t.authWorking} />
      </form>

      {googleState.status === "error" ? (
        <ErrorNote t={t} state={googleState} />
      ) : null}

      <div className="auth-rule my-6 flex items-center gap-3">
        <span className="h-px flex-1 bg-hairline" />
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-dim">
          {t.authOr}
        </span>
        <span className="h-px flex-1 bg-hairline" />
      </div>

      {/* Keyed on the mode so switching across clears the inputs. Leaving a
          typed password in a form that now means something else is the kind of
          thing a password manager fills in twice. */}
      <form
        key={mode}
        action={mode === "signin" ? signIn : signUp}
        className="auth-fields flex flex-col gap-4"
      >
        <input type="hidden" name="next" value={next ?? ""} />

        {mode === "signup" ? (
          <Field
            label={t.authUsername}
            /* The rules before the first keystroke, the specific refusal
               after it. The hint is what the field is *for* — a player should
               not have to make a mistake to learn that a space is not allowed
               — and the error replaces it only while there is something
               wrong, so the two never stack up under one input. */
            hint={t.authUsernameHint}
            error={usernameError}
            name="username"
            type="text"
            autoComplete="username"
            required
            /* **No `pattern`, `minLength` or `maxLength`.** All three were
               here, and all three hand the refusal to the browser: Chrome
               answers a failed `pattern` with "Please match the requested
               format" in the browser's own language, which is neither the
               site's language nor an explanation, and it blocks the submit
               before anything of ours is reached. `maxLength` is worse than
               a refusal — it silently eats the characters past the twentieth.
               The check is `validateUsername` in both places instead: live in
               this field, and again in the Server Action, which is the one
               that decides. */
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            onBlur={() => setSettled(true)}
          />
        ) : null}

        <Field
          label={t.authEmail}
          name="email"
          type="email"
          autoComplete="email"
          required
        />

        <Field
          label={t.authPassword}
          hint={mode === "signup" ? t.authPasswordHint : undefined}
          name="password"
          type="password"
          autoComplete={mode === "signin" ? "current-password" : "new-password"}
          required
          minLength={mode === "signup" ? 8 : undefined}
        />

        {mode === "signin" && canReset ? (
          /* A button, not a link: the detour is a mode of this form, so the
             typed email is the only thing it has to ask for again. */
          <button
            type="button"
            onClick={() => switchTo("forgot")}
            className="-mt-2 self-end text-[12px] font-semibold text-ink-dim hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            {t.authForgotLink}
          </button>
        ) : null}

        {state.status === "error" ? <ErrorNote t={t} state={state} /> : null}

        <SubmitButton
          label={mode === "signin" ? t.authSubmitSignIn : t.authSubmitSignUp}
          working={t.authWorking}
        />
      </form>
    </Panel>
  );
}

/* -------------------------------------------------------------------------- */

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-card w-full max-w-[27rem] rounded-card border border-hairline bg-card p-7 sm:p-9">
      {children}
    </div>
  );
}

/**
 * One labelled input, with one line under it.
 *
 * **The hint and the error share that line**, which is the whole arrangement:
 * the hint states the rules so they can be followed, and the error replaces it
 * with the one that was broken. Stacking them would put the rule the player
 * has just failed directly under the complaint about failing it, and it would
 * move the field every time a refusal arrived or left.
 *
 * `aria-invalid` and `aria-describedby` are what carry that to a screen
 * reader; the line is `role="status"` rather than `role="alert"` because it
 * changes while the player is typing, and an assertive live region would
 * interrupt them on every keystroke. The submit's own failure is the alert —
 * see `ErrorNote`.
 */
function Field({
  label,
  hint,
  error,
  name,
  ...input
}: {
  label: string;
  hint?: string;
  /** The refusal this field has already decided on, if any. Replaces `hint`. */
  error?: string | null;
  name: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const note = error ?? hint;

  /* The refused field borrows the `bad` tier's colour, which is the one place
     on the site an input is not a neutral. Written as `color-mix` inline
     rather than as a token, for the reason the verdict ladder has only five:
     this is the same red at two strengths, not a sixth step in the palette. */
  const bad = (strength: number) =>
    `color-mix(in srgb, var(--color-bad) ${strength}%, transparent)`;

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-ink">{label}</span>
      <input
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={note ? `${name}-note` : undefined}
        {...input}
        className={`w-full rounded-2xl border bg-card-raised/70 px-4 py-3 text-[15px] text-ink transition-colors placeholder:text-ink-dim focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent ${
          error ? "" : "border-hairline focus:border-ink/25"
        }`}
        style={error ? { borderColor: bad(45) } : undefined}
      />
      {note ? (
        <span
          id={`${name}-note`}
          role="status"
          className={`text-[12px] leading-relaxed ${error ? "" : "text-ink-dim"}`}
          style={
            error
              ? {
                  color:
                    "color-mix(in srgb, var(--color-bad) 60%, var(--color-ink))",
                }
              : undefined
          }
        >
          {note}
        </span>
      ) : null}
    </label>
  );
}

/**
 * `useFormStatus` rather than the action state's own pending flag, because it
 * reads the status of the form this button is *inside* — which is what keeps
 * the Google button and the email button from both saying "one moment" when one
 * of them is pressed.
 */
function SubmitButton({ label, working }: { label: string; working: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="mt-1 w-full rounded-full bg-ink px-5 py-3 text-[15px] font-semibold text-page transition-opacity hover:opacity-90 disabled:cursor-progress disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      {pending ? working : label}
    </button>
  );
}

function GoogleButton({ label, working }: { label: string; working: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="flex w-full items-center justify-center gap-3 rounded-full border border-hairline bg-card-raised/70 px-5 py-3 text-[15px] font-semibold text-ink transition-colors hover:bg-card-raised disabled:cursor-progress disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <GoogleMark />
      {pending ? working : label}
    </button>
  );
}

/** Google's mark, inline. Four paths and four brand colours — a remote image
 *  would be a request to a third party on a page about signing in. */
function GoogleMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 18 18" className="h-[18px] w-[18px]">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.71-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72A5.41 5.41 0 0 1 3.68 9c0-.6.1-1.18.29-1.72V4.95H.96A8.99 8.99 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

/** One failure, said once. The codes come from `app/actions/auth.ts`, and the
 *  sentences from `authErrorText` — the table the account panel reads too. */
function ErrorNote({
  t,
  state,
}: {
  t: Dict;
  state: Extract<AuthState, { status: "error" }>;
}) {
  return (
    /* `role="alert"` so it is announced when it arrives — it is the answer to
       the press that just happened, and a player using a screen reader would
       otherwise have to go looking for it. */
    <p
      role="alert"
      className="rounded-2xl border px-4 py-3 text-[13px] leading-relaxed"
      style={{
        borderColor: "color-mix(in srgb, var(--color-bad) 35%, transparent)",
        backgroundColor: "color-mix(in srgb, var(--color-bad) 10%, transparent)",
        color: "color-mix(in srgb, var(--color-bad) 60%, var(--color-ink))",
      }}
    >
      {authErrorText(t, state.code, state.detail)}
    </p>
  );
}
