import { redirect } from "next/navigation";

import { AuthShell } from "@/components/admin/auth-shell";
import { EnrollForm } from "@/components/admin/auth-forms";
import { ADMIN_MFA, ADMIN_SIGN_IN } from "@/lib/admin/path";
import { isAdmin } from "@/lib/auth/admin";
import { getVerifiedUser } from "@/lib/auth/server";
import { createServerDbClient } from "@/lib/db/server";

export const dynamic = "force-dynamic";

/** First sign-in: set up the second factor (QR + first verification). */
export default async function AdminMfaSetupPage() {
  const user = await getVerifiedUser();
  if (!user || !isAdmin(user)) redirect(ADMIN_SIGN_IN);
  const supabase = await createServerDbClient();
  const { data } = await supabase.auth.mfa.listFactors();
  if ((data?.totp ?? []).some((f) => f.status === "verified")) redirect(ADMIN_MFA);
  return (
    <AuthShell title="İki adımlı doğrulamayı kurun">
      <EnrollForm />
    </AuthShell>
  );
}
