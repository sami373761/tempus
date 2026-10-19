/**
 * The admin account, from the command line. There is no admin UI for roles
 * (§4.2): an admin is made, reset and revoked only here, with the service
 * role key from .env.local.
 *
 *   node --experimental-strip-types scripts/make-admin.ts --create
 *   node --experimental-strip-types scripts/make-admin.ts --reset-mfa <username>
 *   node --experimental-strip-types scripts/make-admin.ts --reset-password <username>
 *   node --experimental-strip-types scripts/make-admin.ts --revoke <username>
 *
 * --create makes a 16-character random username and a 32-character random
 * password, creates `<username>@admin.tempus.invalid` (a domain that can never
 * receive mail) confirmed and with app_metadata.role = 'admin', clears the
 * profile's username and hides it from the boards, prints both values and
 * writes them into docs/admin/LOKAL_KURULUM.md §2. --reset-password does the
 * same for a new password.
 *
 * Never run in the cloud session: there is no .env.local there.
 */

import { randomInt } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

import { createClient, type User } from "@supabase/supabase-js";

import { loadEnvFile } from "./db.ts";
import { adminEmailFor } from "../lib/admin/path.ts";

loadEnvFile();

const LOCAL_DOC = "docs/admin/LOKAL_KURULUM.md";
const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_.!";

function random(alphabet: string, length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) out += alphabet[randomInt(alphabet.length)];
  return out;
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (.env.local).");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

async function findAdmin(username: string): Promise<User> {
  const email = adminEmailFor(username);
  for (let page = 1; page < 50; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const found = data.users.find((u) => u.email === email);
    if (found) return found;
    if (data.users.length < 200) break;
  }
  throw new Error(`No admin account "${username}" (${email}).`);
}

function writeCredentials(username: string, password: string): void {
  let doc: string;
  try {
    doc = readFileSync(LOCAL_DOC, "utf8");
  } catch {
    console.warn(`${LOCAL_DOC} not found; credentials printed above only.`);
    return;
  }
  const next = doc
    .replace(/^- Kullanıcı adı:.*$/m, `- Kullanıcı adı: ${username}`)
    .replace(/^- Şifre:.*$/m, `- Şifre: ${password}`);
  writeFileSync(LOCAL_DOC, next);
  console.log(`written to ${LOCAL_DOC} §2 (do not commit it with the password in it)`);
}

async function hideProfile(id: string): Promise<void> {
  // handle_new_user() names the profile after the address's local part; the
  // admin account is not a player, so it gets no name and no board row.
  const { error } = await supabase.from("profile").update({ username: null, is_hidden_from_boards: true }).eq("id", id);
  if (error) console.warn(`profile not updated: ${error.message}`);
}

const [command, arg] = process.argv.slice(2);

switch (command) {
  case "--create": {
    const username = random(ALPHABET, 16);
    const password = random(PASSWORD_ALPHABET, 32);
    const { data, error } = await supabase.auth.admin.createUser({
      email: adminEmailFor(username),
      password,
      email_confirm: true,
      app_metadata: { role: "admin" },
    });
    if (error || !data.user) throw error ?? new Error("createUser returned no user");
    await hideProfile(data.user.id);
    console.log(`admin created: ${data.user.id}`);
    console.log(`  Kullanıcı adı: ${username}`);
    console.log(`  Şifre        : ${password}`);
    writeCredentials(username, password);
    break;
  }
  case "--reset-mfa": {
    if (!arg) throw new Error("--reset-mfa <username>");
    const user = await findAdmin(arg);
    const { data, error } = await supabase.auth.admin.mfa.listFactors({ userId: user.id });
    if (error) throw error;
    for (const factor of data.factors) {
      const { error: e } = await supabase.auth.admin.mfa.deleteFactor({ id: factor.id, userId: user.id });
      if (e) throw e;
    }
    console.log(`${data.factors.length} factor(s) removed; the next sign-in shows a new QR code.`);
    break;
  }
  case "--reset-password": {
    if (!arg) throw new Error("--reset-password <username>");
    const user = await findAdmin(arg);
    const password = random(PASSWORD_ALPHABET, 32);
    const { error } = await supabase.auth.admin.updateUserById(user.id, { password });
    if (error) throw error;
    console.log(`  Şifre: ${password}`);
    writeCredentials(arg, password);
    break;
  }
  case "--revoke": {
    if (!arg) throw new Error("--revoke <username>");
    const user = await findAdmin(arg);
    const meta = { ...(user.app_metadata ?? {}) } as Record<string, unknown>;
    delete meta.role;
    const { error } = await supabase.auth.admin.updateUserById(user.id, { app_metadata: { ...meta, role: null } });
    if (error) throw error;
    console.log(`admin role removed from ${arg}.`);
    break;
  }
  default:
    console.error("Usage: make-admin.ts --create | --reset-mfa <u> | --reset-password <u> | --revoke <u>");
    process.exitCode = 1;
}

