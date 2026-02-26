"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loginSchema, registerSchema } from "@/lib/validation/schemas";

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Operacion no completada.";
}

export async function signInAction(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password")
  });

  if (!parsed.success) {
    redirect("/auth/login?error=Credenciales+no+validas");
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    redirect(`/auth/login?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/");
  redirect("/");
}

export async function signUpAction(formData: FormData) {
  const parsed = registerSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    role: formData.get("role"),
    name: formData.get("name"),
    city: formData.get("city")
  });

  if (!parsed.success) {
    redirect("/auth/register?error=Revisa+los+campos+obligatorios");
  }

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        role: parsed.data.role,
        name: parsed.data.name,
        city: parsed.data.city
      }
    }
  });

  if (error) {
    redirect(`/auth/register?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/");
  redirect("/auth/login?message=Cuenta+creada.+Ya+puedes+entrar.");
}

export async function signOutAction() {
  const supabase = createSupabaseServerClient();
  try {
    await supabase.auth.signOut();
  } catch (error) {
    redirect(`/auth/login?error=${encodeURIComponent(toErrorMessage(error))}`);
  }

  revalidatePath("/");
  redirect("/auth/login");
}
