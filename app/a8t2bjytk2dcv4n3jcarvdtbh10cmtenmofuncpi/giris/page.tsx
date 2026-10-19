import { AuthShell } from "@/components/admin/auth-shell";
import { SignInForm } from "@/components/admin/auth-forms";

export const dynamic = "force-dynamic";

/** Step one: username + password (§4.3). No hint of what exists. */
export default async function AdminSignInPage({ searchParams }: { searchParams: Promise<{ sure?: string }> }) {
  const { sure } = await searchParams;
  return (
    <AuthShell title="Yönetim girişi">
      {sure === "doldu" ? (
        <p className="mb-4 text-sm text-ink-dim">30 dakika işlem yapılmadığı için oturum kapandı. Tekrar giriş yapın.</p>
      ) : null}
      <SignInForm />
    </AuthShell>
  );
}
