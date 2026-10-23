"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { resetPassword } from "@/app/actions/auth";
import { authErrorText } from "@/components/auth-message";
import type { Dict } from "@/lib/i18n/dictionary";

/** The two password fields of `/reset-password`. A success redirects, so the
 *  only state this ever shows is a refusal. */
export function ResetPasswordForm({ t }: { t: Dict }) {
  const [state, action] = useActionState(resetPassword, { status: "idle" });

  return (
    <>
      <p className="mt-2 text-[15px] leading-relaxed text-ink-dim">{t.resetBlurb}</p>
      <form action={action} className="auth-fields mt-6 flex flex-col gap-4">
        <PasswordField label={t.accountNewPassword} hint={t.authPasswordHint} name="password" />
        <PasswordField label={t.accountRepeatPassword} name="confirm" />
        {state.status === "error" ? (
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
        ) : null}
        <Submit label={t.resetSubmit} working={t.authWorking} />
      </form>
    </>
  );
}

function PasswordField({ label, hint, name }: { label: string; hint?: string; name: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-ink">{label}</span>
      <input
        name={name}
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        className="w-full rounded-2xl border border-hairline bg-card-raised/70 px-4 py-3 text-[15px] text-ink transition-colors focus:border-ink/25 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent"
      />
      {hint ? <span className="text-[12px] leading-relaxed text-ink-dim">{hint}</span> : null}
    </label>
  );
}

function Submit({ label, working }: { label: string; working: string }) {
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
