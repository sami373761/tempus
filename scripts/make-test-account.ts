/**
 * Creates (or resets) a confirmed test account for walking the auth flow.
 *
 *   node --experimental-strip-types scripts/make-test-account.ts
 *
 * Uses the Admin API with `email_confirm: true`, so the account is usable
 * immediately and no mailbox is needed. Sign-ups through the form go through
 * Supabase's own confirmation flow instead — this is only for testing.
 *
 * Credentials are written to `.env.test.local` (gitignored by `.env*.local`),
 * never printed.
 */
import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

import { loadEnvFile } from "./db.ts";

loadEnvFile();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const admin = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const email = "tempus.qa@example.com";
const password = `Qa-${randomBytes(9).toString("base64url")}`;
const username = "tempus_qa";

const existing = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
const found = existing.data?.users.find((u) => u.email === email);

if (found) {
  const { error } = await admin.auth.admin.updateUserById(found.id, {
    password,
    email_confirm: true,
  });
  if (error) throw error;
  console.log("reset existing test user", found.id);
} else {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { username },
  });
  if (error) throw error;
  console.log("created test user", data.user?.id);
}

writeFileSync(
  ".env.test.local",
  `# Throwaway QA account for the auth flow. Gitignored. Delete when done.\nTEMPUS_QA_EMAIL=${email}\nTEMPUS_QA_PASSWORD=${password}\n`,
  { mode: 0o600 },
);
console.log("credentials written to .env.test.local");
