import { notFound } from "next/navigation";

import { isAdmin } from "@/lib/auth/admin";
import { getVerifiedUser } from "@/lib/auth/server";

/**
 * Gate for every future /admin route. There are no admin pages yet, so /admin
 * 404s either way — but the guard is already the single place authorization is
 * enforced for the content tooling that will live here.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getVerifiedUser();
  if (!isAdmin(user)) notFound();

  return <section className="mx-auto max-w-5xl px-6 py-10">{children}</section>;
}
