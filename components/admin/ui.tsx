import Link from "next/link";

/**
 * Admin panel building blocks. Turkish-only, scrollable, desktop first and
 * usable at 375px. Only the site's existing tokens (app/globals.css) — the
 * panel brings no colour of its own.
 */

export function PageTitle({ children, sub }: { children: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <header className="mb-6 space-y-1">
      <h1 className="font-display text-2xl font-semibold text-ink">{children}</h1>
      {sub ? <p className="text-sm text-ink-dim">{sub}</p> : null}
    </header>
  );
}

export function Card({ title, children, className = "" }: { title?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-hairline bg-card p-4 ${className}`}>
      {title ? <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-dim">{title}</h2> : null}
      {children}
    </section>
  );
}

export function Stat({ label, value, alert = false }: { label: string; value: React.ReactNode; alert?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${alert ? "border-bad" : "border-hairline"} bg-card-raised`}>
      <div className="text-xs text-ink-dim">{label}</div>
      <div className={`text-xl font-semibold ${alert ? "text-bad" : "text-ink"}`}>{value}</div>
    </div>
  );
}

export function Table({ head, children, empty }: { head: React.ReactNode[]; children: React.ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-hairline">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead className="bg-card-raised text-left text-xs text-ink-dim">
          <tr>
            {head.map((h, i) => (
              <th key={i} className="px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&>tr]:border-t [&>tr]:border-hairline">
          {empty ? (
            <tr>
              <td colSpan={head.length} className="px-3 py-6 text-center text-ink-dim">
                Kayıt yok.
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`px-3 py-2 align-top text-ink ${className}`}>{children}</td>;
}

/** Server-side paging; the query string is the state (§5.3). */
export function Pager({
  base,
  params,
  page,
  total,
  pageSize = 50,
}: {
  base: string;
  params: Record<string, string | undefined>;
  page: number;
  total: number;
  pageSize?: number;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    q.set("sayfa", String(p));
    return `${base}?${q.toString()}`;
  };
  return (
    <nav className="mt-3 flex items-center justify-between text-sm text-ink-dim">
      <span>
        {total} kayıt · sayfa {page}/{pages}
      </span>
      <span className="flex gap-2">
        {page > 1 ? (
          <Link className={LINK} href={href(page - 1)}>
            ← Önceki
          </Link>
        ) : null}
        {page < pages ? (
          <Link className={LINK} href={href(page + 1)}>
            Sonraki →
          </Link>
        ) : null}
      </span>
    </nav>
  );
}

export const LINK = "text-accent underline-offset-2 hover:underline";
export const INPUT =
  "w-full rounded-lg border border-hairline bg-page px-3 py-2 text-sm text-ink placeholder:text-ink-dim focus-visible:outline-2 focus-visible:outline-accent";
export const BUTTON =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-hairline bg-card-raised px-3 py-2 text-sm font-medium text-ink transition hover:border-ink/40 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
export const BUTTON_DANGER =
  "inline-flex items-center justify-center gap-2 rounded-lg border border-bad px-3 py-2 text-sm font-medium text-bad transition hover:bg-bad/10 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";

/** External links never carry the panel's address (§4.1). */
export function External({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a className={LINK} href={href} target="_blank" rel="noreferrer noopener">
      {children}
    </a>
  );
}

/** A GET filter form: the URL is the state, so filters survive a reload. */
export function FilterForm({ action, children }: { action: string; children: React.ReactNode }) {
  return (
    <form action={action} method="get" className="mb-4 flex flex-wrap items-end gap-2 text-sm">
      {children}
      <button className={BUTTON} type="submit">
        Uygula
      </button>
    </form>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-[8rem] flex-col gap-1 text-xs text-ink-dim">
      {label}
      {children}
    </label>
  );
}

export function Select({
  name,
  value,
  options,
  className = "",
}: {
  name: string;
  value?: string;
  options: readonly (readonly [string, string])[];
  className?: string;
}) {
  return (
    <select name={name} defaultValue={value ?? ""} className={`${INPUT} ${className}`}>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );
}

export function Badge({ children, tone = "dim" }: { children: React.ReactNode; tone?: "dim" | "good" | "bad" | "accent" }) {
  const cls = {
    dim: "border-hairline text-ink-dim",
    good: "border-good text-good",
    bad: "border-bad text-bad",
    accent: "border-accent text-accent",
  }[tone];
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] ${cls}`}>{children}</span>;
}

export function Json({ value }: { value: unknown }) {
  return (
    <pre className="max-h-96 overflow-auto rounded-lg bg-page p-3 text-xs text-ink-dim">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
