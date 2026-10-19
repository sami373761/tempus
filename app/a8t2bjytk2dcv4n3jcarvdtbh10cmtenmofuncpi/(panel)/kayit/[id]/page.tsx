import { notFound } from "next/navigation";

import { undoAudit } from "@/app/actions/admin/system";
import { ActionForm } from "@/components/admin/action-form";
import { Card, Json, PageTitle } from "@/components/admin/ui";
import { fmtDate } from "@/lib/admin/labels";
import { requireAdminPage } from "@/lib/auth/admin";
import { adminRpc } from "@/lib/db/admin/rpc";

export const dynamic = "force-dynamic";

const UNDOABLE = new Set([
  "event.update_year",
  "event.update_translations",
  "event.set_status",
  "event.set_sensitive",
  "event.set_category",
  "user.rename",
  "user.hide_from_boards",
]);

type Entry = { id: number; actorId: string; action: string; targetTable: string; targetId: string; before: unknown; after: unknown; note: string | null; createdAt: string; undoneBy: number | null };

/** §6.11 entry: before / after side by side, and undo where allowed. */
export default async function AuditEntryPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const e = (await adminRpc("admin_audit_entry", { p_id: Number(id) })) as unknown as Entry | null;
  if (!e) notFound();
  return (
    <>
      <PageTitle sub={`${fmtDate(e.createdAt)} · ${e.targetTable}/${e.targetId} · yapan ${e.actorId}`}>
        #{e.id} {e.action}
      </PageTitle>
      {e.note ? <p className="mb-4 text-sm">Not: {e.note}</p> : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Önce">
          <Json value={e.before} />
        </Card>
        <Card title="Sonra">
          <Json value={e.after} />
        </Card>
      </div>
      {UNDOABLE.has(e.action) ? (
        <Card title="Geri al" className="mt-4">
          {e.undoneBy ? (
            <p className="text-sm text-ink-dim">Bu işlem #{e.undoneBy} ile geri alındı.</p>
          ) : (
            <ActionForm run={undoAudit.bind(null, e.id)} fields={[]} submitLabel="Bu işlemi geri al" danger />
          )}
        </Card>
      ) : null}
    </>
  );
}
