import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type ProfileRow = Database["public"]["Tables"]["profiles"]["Row"];

export async function getCurrentSession() {
  try {
    const supabase = createSupabaseServerClient();
    const {
      data: { session }
    } = await supabase.auth.getSession();
    return session;
  } catch {
    return null;
  }
}

export async function getCurrentProfile() {
  const session = await getCurrentSession();
  if (!session) return { session: null, profile: null as ProfileRow | null };

  try {
    const supabase = createSupabaseServerClient();
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .single();

    return { session, profile };
  } catch {
    return { session, profile: null as ProfileRow | null };
  }
}

export async function requireUser() {
  const { session } = await getCurrentProfile();
  if (!session) {
    redirect("/auth/login");
  }
  return session;
}

export async function requireRole(role: ProfileRow["role"]) {
  const { session, profile } = await getCurrentProfile();
  if (!session || !profile || profile.role !== role) {
    redirect("/");
  }
  return { session, profile };
}
