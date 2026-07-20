import { createClient } from "@/lib/supabase/server";

// Is this request from a signed-in account? Reads the Supabase session cookie
// and validates it with Supabase (getUser, not getSession — getSession trusts
// the cookie's contents, which the caller controls).
//
// Returns the user id so callers can key per-account limits off it later.
export async function signedInUserId(): Promise<string | null> {
  return (await signedInUser())?.id ?? null;
}

// Like signedInUserId, but also returns the email (needed to attach a Stripe
// customer to the right person).
export async function signedInUser(): Promise<{ id: string; email: string | null } | null> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? null };
  } catch {
    // Supabase not configured / no cookie store — treat as signed out.
    return null;
  }
}
