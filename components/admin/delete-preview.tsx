"use client";

/** Renders a delete preview's counts as a list (event or user). */
export function CountList({ data, labels }: { data: unknown; labels: Record<string, string> }) {
  const d = data as Record<string, unknown>;
  return (
    <ul className="space-y-1">
      {Object.entries(labels).map(([k, label]) => {
        const v = d[k];
        return (
          <li key={k}>
            {label}: <strong>{Array.isArray(v) ? (v.length ? v.join(", ") : "yok") : String(v ?? "—")}</strong>
          </li>
        );
      })}
    </ul>
  );
}
