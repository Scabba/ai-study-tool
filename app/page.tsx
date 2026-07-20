import HomeClient, { type InitialAuth } from "./HomeClient";
import { signedInUser } from "@/lib/authUser";
import { isUserPro } from "@/lib/subscription";
import { createClient } from "@/lib/supabase/server";

// The home page is a thin server shell: it reads the session cookie so the
// first paint already knows who you are. Without this the page rendered
// signed-out and the profile button and "Athenia Pro" title popped in after
// hydration. Reading cookies opts this route into dynamic rendering, which is
// what we want — the page is per-user anyway.

export default async function Page() {
  const user = await signedInUser();

  let initialAuth: InitialAuth = null;
  let initialIsPro = false;

  if (user) {
    // getUser() again for the avatar — signedInUser only carries id + email,
    // and the photo lives in the provider metadata.
    let avatar: string | null = null;
    try {
      const supabase = await createClient();
      const { data } = await supabase.auth.getUser();
      const meta = data.user?.user_metadata ?? {};
      avatar =
        (meta.avatar_url as string) ?? (meta.picture as string) ?? null;
    } catch {
      // No avatar is fine — the button falls back to the email initial.
    }
    initialAuth = { id: user.id, email: user.email, avatar };
    initialIsPro = await isUserPro(user.id);
  }

  return <HomeClient initialAuth={initialAuth} initialIsPro={initialIsPro} />;
}
