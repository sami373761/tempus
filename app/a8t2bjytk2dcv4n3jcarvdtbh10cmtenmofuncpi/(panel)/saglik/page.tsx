import { pruneLoginAttempts, revalidateAll } from "@/app/actions/admin/system";
import { ActionForm } from "@/components/admin/action-form";
import { Badge, Card, Json, PageTitle } from "@/components/admin/ui";
import { HEALTH_LABEL } from "@/lib/admin/labels";
import { requireAdminPage } from "@/lib/auth/admin";
import { adminRpc } from "@/lib/db/admin/rpc";

export const dynamic = "force-dynamic";

type Check = { key: string; warning: boolean; count: number; sample: unknown[] };

/** §6.10. */
export default async function HealthPage() {
  await requireAdminPage();
  const checks = (await adminRpc("admin_health_checks", {} as Record<PropertyKey, never>)) as unknown as Check[];
  return (
    <>
      <PageTitle sub="Migration defterindeki son dosyayı repodaki son dosyayla karşılaştırın (supabase/migrations/).">Sağlık</PageTitle>
      <div className="mb-6 grid gap-4 md:grid-cols-2">
        <Card title="Önbellekleri temizle">
          <ActionForm run={revalidateAll} fields={[]} submitLabel="Tüm önbellekleri temizle" />
        </Card>
        <Card title="Eski giriş denemelerini sil">
          <ActionForm run={pruneLoginAttempts} fields={[]} submitLabel="30 günden eskileri sil" />
        </Card>
      </div>
      <div className="space-y-3">
        {checks.map((c) => (
          <Card key={c.key}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">{HEALTH_LABEL[c.key] ?? c.key}</span>
              {c.warning && c.count > 0 ? <Badge tone="bad">{c.count}</Badge> : <Badge tone={c.warning ? "good" : "dim"}>{c.count}</Badge>}
            </div>
            {c.sample.length > 0 ? (
              <div className="mt-2">
                <Json value={c.sample} />
              </div>
            ) : null}
          </Card>
        ))}
      </div>
    </>
  );
}
