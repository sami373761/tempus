"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { parseYearInput } from "@/lib/admin/year-input";
import type { ActionResult } from "@/lib/admin/result";
import { formatYear } from "@/lib/historical-date";
import { DICTIONARIES, dateLabels } from "@/lib/i18n/dictionary";

import { BUTTON, BUTTON_DANGER, INPUT } from "./ui";

const TR_LABELS = dateLabels(DICTIONARIES.tr);

export type FieldSpec =
  | { name: string; label: string; kind: "text" | "textarea" | "number" | "url"; required?: boolean; initial?: string; placeholder?: string }
  | { name: string; label: string; kind: "year"; required?: boolean; initial?: string }
  | { name: string; label: string; kind: "select"; options: readonly (readonly [string, string])[]; initial?: string }
  | { name: string; label: string; kind: "checkbox"; initial?: boolean }
  | { name: string; label: string; kind: "hidden"; initial: string };

type Value = string | boolean | number | null;

/**
 * One admin write: a form whose fields become the action's positional
 * arguments, in order. Pending state, a success line and a fixed Turkish
 * error come back from the action (ActionResult); after a success the page's
 * server data is refreshed.
 *
 * `confirmText`: an irreversible action asks the operator to type it exactly
 * (an event's TR name, a category slug, a username) before the button works;
 * what was typed is passed to `run` as its last argument.
 * `preview`: a read run before the write, whose result must be shown and
 * acknowledged first (the year change's impact preview, delete dumps).
 */
export function ActionForm({
  run,
  fields,
  submitLabel,
  danger = false,
  confirmText,
  confirmHint,
  preview,
  renderPreview,
  compact = false,
  successMessage = "Kaydedildi.",
}: {
  run: (...args: Value[]) => Promise<ActionResult<unknown>>;
  fields: FieldSpec[];
  submitLabel: string;
  danger?: boolean;
  confirmText?: string;
  confirmHint?: string;
  preview?: (...args: Value[]) => Promise<ActionResult<unknown>>;
  renderPreview?: (data: unknown) => React.ReactNode;
  compact?: boolean;
  successMessage?: string;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, Value>>(() =>
    Object.fromEntries(fields.map((f) => [f.name, f.kind === "checkbox" ? Boolean(f.initial) : (f.initial ?? "")])),
  );
  const [typed, setTyped] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [previewData, setPreviewData] = useState<{ key: string; data: unknown } | null>(null);
  const [pending, start] = useTransition();

  const args = (): Value[] | string => {
    const out: Value[] = [];
    for (const f of fields) {
      const v = values[f.name];
      if (f.kind === "year") {
        const text = String(v ?? "").trim();
        if (!text && !f.required) {
          out.push(null);
          continue;
        }
        const year = parseYearInput(text);
        if (year === null) return `${f.label}: "MÖ 500", "500" veya "MS 500" biçiminde girin.`;
        out.push(year);
        continue;
      }
      if ((f.kind === "text" || f.kind === "textarea" || f.kind === "url") && f.required && !String(v ?? "").trim()) {
        return `${f.label} zorunlu.`;
      }
      out.push(v ?? null);
    }
    return out;
  };

  const key = JSON.stringify(values);
  const needsPreview = Boolean(preview) && previewData?.key !== key;
  const confirmed = !confirmText || typed.trim() === confirmText.trim();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const a = args();
    if (typeof a === "string") {
      setStatus({ ok: false, text: a });
      return;
    }
    setStatus(null);
    start(async () => {
      if (needsPreview && preview) {
        const p = await preview(...a);
        if (!p.ok) setStatus({ ok: false, text: p.error });
        else setPreviewData({ key, data: p.data });
        return;
      }
      // The typed confirmation travels as the last argument, so the server
      // checks what the operator typed, not what the page expected.
      const result = await run(...a, ...(confirmText ? [typed] : []));
      if (result.ok) {
        setStatus({ ok: true, text: result.message ?? successMessage });
        setTyped("");
        setPreviewData(null);
        router.refresh();
      } else {
        setStatus({ ok: false, text: result.error });
      }
    });
  }

  return (
    <form onSubmit={submit} className={compact ? "flex flex-wrap items-end gap-2" : "space-y-3"}>
      {fields.map((f) => (
        <FieldInput
          key={f.name}
          spec={f}
          value={values[f.name] ?? null}
          onChange={(v) => setValues((old) => ({ ...old, [f.name]: v }))}
        />
      ))}

      {previewData && renderPreview ? (
        <div className="rounded-lg border border-hairline bg-page p-3 text-sm">{renderPreview(previewData.data)}</div>
      ) : null}

      {confirmText && (!preview || previewData) ? (
        <label className="block text-xs text-ink-dim">
          {confirmHint ?? "Onaylamak için tam olarak şunu yazın:"} <strong className="text-ink">{confirmText}</strong>
          <input className={`${INPUT} mt-1`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </label>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          className={danger ? BUTTON_DANGER : BUTTON}
          disabled={pending || (!needsPreview && !confirmed)}
        >
          {pending ? "Bekleyin…" : needsPreview ? "Önizle" : submitLabel}
        </button>
        {status ? (
          <span role="status" className={`text-sm ${status.ok ? "text-good" : "text-bad"}`}>
            {status.text}
          </span>
        ) : null}
      </div>
    </form>
  );
}

function FieldInput({ spec, value, onChange }: { spec: FieldSpec; value: Value; onChange: (v: Value) => void }) {
  if (spec.kind === "hidden") return null;
  if (spec.kind === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" checked={Boolean(value)} onChange={(e) => onChange(e.target.checked)} />
        {spec.label}
      </label>
    );
  }
  const label = (
    <span className="text-xs text-ink-dim">
      {spec.label}
      {"required" in spec && spec.required ? " *" : ""}
    </span>
  );
  if (spec.kind === "select") {
    return (
      <label className="flex min-w-[10rem] flex-col gap-1">
        {label}
        <select className={INPUT} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)}>
          {spec.options.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
    );
  }
  if (spec.kind === "textarea") {
    return (
      <label className="flex w-full flex-col gap-1">
        {label}
        <textarea className={`${INPUT} min-h-20`} value={String(value ?? "")} onChange={(e) => onChange(e.target.value)} />
      </label>
    );
  }
  if (spec.kind === "year") {
    const parsed = parseYearInput(String(value ?? ""));
    return (
      <label className="flex min-w-[10rem] flex-col gap-1">
        {label}
        <input
          className={INPUT}
          value={String(value ?? "")}
          placeholder="MÖ 500 / 500 / MS 500"
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="text-xs text-ink-dim">
          {String(value ?? "").trim() === ""
            ? " "
            : parsed === null
              ? "Anlaşılmadı"
              : `${formatYear(parsed, TR_LABELS)} (astronomik ${parsed})`}
        </span>
      </label>
    );
  }
  return (
    <label className="flex min-w-[10rem] flex-1 flex-col gap-1">
      {label}
      <input
        className={INPUT}
        type={spec.kind === "number" ? "number" : spec.kind === "url" ? "url" : "text"}
        value={String(value ?? "")}
        placeholder={spec.placeholder}
        onChange={(e) => onChange(spec.kind === "number" ? e.target.value : e.target.value)}
      />
    </label>
  );
}
