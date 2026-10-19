"use client";

import { useActionState, useState, useTransition } from "react";

import {
  adminSignIn,
  adminStartEnrollment,
  adminVerifyEnrollment,
  adminVerifyTotp,
  type AuthStepState,
  type Enrollment,
} from "@/app/actions/admin-auth";

import { BUTTON, INPUT } from "./ui";

const INITIAL: AuthStepState = { error: null };

export function SignInForm() {
  const [state, action, pending] = useActionState(adminSignIn, INITIAL);
  return (
    <form action={action} className="space-y-3">
      <label className="block space-y-1 text-sm">
        <span className="text-ink-dim">Kullanıcı adı</span>
        <input name="username" className={INPUT} autoComplete="username" autoCapitalize="none" spellCheck={false} required />
      </label>
      <label className="block space-y-1 text-sm">
        <span className="text-ink-dim">Şifre</span>
        <input name="password" type="password" className={INPUT} autoComplete="current-password" required />
      </label>
      <button className={`${BUTTON} w-full`} disabled={pending}>
        {pending ? "Bekleyin…" : "Giriş"}
      </button>
      {state.error ? <p role="alert" className="text-sm text-bad">{state.error}</p> : null}
    </form>
  );
}

export function TotpForm() {
  const [state, action, pending] = useActionState(adminVerifyTotp, INITIAL);
  return (
    <form action={action} className="space-y-3">
      <CodeInput />
      <button className={`${BUTTON} w-full`} disabled={pending}>
        {pending ? "Bekleyin…" : "Doğrula"}
      </button>
      {state.error ? <p role="alert" className="text-sm text-bad">{state.error}</p> : null}
    </form>
  );
}

function CodeInput() {
  return (
    <label className="block space-y-1 text-sm">
      <span className="text-ink-dim">Doğrulama kodu (6 hane)</span>
      <input
        name="code"
        inputMode="numeric"
        pattern="[0-9 ]{6,7}"
        maxLength={7}
        autoComplete="one-time-code"
        className={`${INPUT} text-center text-lg tracking-[0.4em]`}
        required
      />
    </label>
  );
}

export function EnrollForm() {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [starting, start] = useTransition();
  const [state, action, pending] = useActionState(adminVerifyEnrollment, INITIAL);

  if (!enrollment || !enrollment.ok) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-ink-dim">
          Telefonunuzda Google Authenticator (veya benzeri) açık olsun. Aşağıdaki düğme bir QR kod oluşturur.
        </p>
        <button className={`${BUTTON} w-full`} disabled={starting} onClick={() => start(async () => setEnrollment(await adminStartEnrollment()))}>
          {starting ? "Bekleyin…" : "QR kodu oluştur"}
        </button>
        {enrollment && !enrollment.ok ? <p role="alert" className="text-sm text-bad">{enrollment.error}</p> : null}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-dim">
        <li>Authenticator'da “+” → “QR kodu tara”.</li>
        <li>Aşağıdaki kodu okutun; “TEMPUS Admin” satırı belirir.</li>
        <li>Uygulamadaki 6 haneli kodu yazıp “Doğrula”ya basın.</li>
      </ol>
      {/* Supabase returns the QR as an SVG data URI. */}
      <div className="mx-auto w-56 rounded-xl bg-white p-3">
        <img src={enrollment.qrSvg} alt="TOTP kurulum QR kodu" className="h-auto w-full" />
      </div>
      <div className="space-y-1 text-sm">
        <div className="text-ink-dim">Metin anahtarı (kâğıda yazıp saklayın):</div>
        <code className="block break-all rounded-lg bg-card-raised p-2 text-center text-ink">{enrollment.secret}</code>
      </div>
      <input type="hidden" name="factorId" value={enrollment.factorId} />
      <CodeInput />
      <button className={`${BUTTON} w-full`} disabled={pending}>
        {pending ? "Bekleyin…" : "Doğrula"}
      </button>
      {state.error ? <p role="alert" className="text-sm text-bad">{state.error}</p> : null}
    </form>
  );
}
