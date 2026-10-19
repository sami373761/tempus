import { redirect } from "next/navigation";

import { AuthShell } from "@/components/admin/auth-shell";
import { TotpForm } from "@/components/admin/auth-forms";
import { ADMIN_SIGN_IN } from "@/lib/admin/path";
import { isAdmin } from "@/lib/auth/admin";
import { getVerifiedUser } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

/** Step two: the 6-digit code from the authenticator app. */
export default async function AdminMfaPage() {
  const user = await getVerifiedUser();
  if (!user || !isAdmin(user)) redirect(ADMIN_SIGN_IN);
  return (
    <AuthShell title="Doğrulama kodu">
      <p className="mb-4 text-sm text-ink-dim">
        Telefonunuzda Authenticator'ı açın ve “TEMPUS Admin” satırındaki 6 haneli kodu yazın. Kodun yanındaki
        daire bitmek üzereyse yenisini bekleyin.
      </p>
      <TotpForm />
    </AuthShell>
  );
}
