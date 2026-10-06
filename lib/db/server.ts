import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "./database.types.ts";
import { publicEnv } from "../env.ts";

/**
 * Supabase client for Server Components, Route Handlers and Server Actions.
 * Still the anon key — RLS applies — but the auth session is read from and
 * refreshed through cookies.
 */
export async function createServerDbClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Components cannot mutate cookies. Session refresh happens
            // in middleware or Route Handlers instead; ignoring is correct here.
          }
        },
      },
    },
  );
}
