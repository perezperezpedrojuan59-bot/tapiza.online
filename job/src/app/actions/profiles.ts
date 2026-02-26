"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { JOB_CATEGORIES } from "@/lib/constants";
import { validateImageFile } from "@/lib/validation/files";
import {
  companyProfileSchema,
  workerProfileSchema
} from "@/lib/validation/schemas";

async function uploadProfileAsset(userId: string, file: File, kind: "photo" | "logo") {
  validateImageFile(file);
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
  const filePath = `${userId}/${kind}-${Date.now()}.${ext}`;

  const supabase = createSupabaseServerClient();
  const { error } = await supabase.storage
    .from("profile-media")
    .upload(filePath, file, { upsert: true, contentType: file.type });

  if (error) {
    throw new Error(error.message);
  }

  const {
    data: { publicUrl }
  } = supabase.storage.from("profile-media").getPublicUrl(filePath);

  return publicUrl;
}

export async function updateWorkerProfileAction(formData: FormData) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const selectedCategories = formData
    .getAll("categories")
    .filter((value): value is string => typeof value === "string")
    .filter((value): value is (typeof JOB_CATEGORIES)[number] =>
      JOB_CATEGORIES.includes(value as (typeof JOB_CATEGORIES)[number])
    );

  const parsed = workerProfileSchema.safeParse({
    name: formData.get("name"),
    city: formData.get("city"),
    phone: formData.get("phone"),
    experience: formData.get("experience"),
    radius_km: formData.get("radius_km"),
    categories: selectedCategories,
    available_today: formData.get("available_today") === "on"
  });

  if (!parsed.success) {
    redirect("/panel?error=Datos+de+perfil+worker+invalidos");
  }

  let photoUrl: string | undefined;
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    photoUrl = await uploadProfileAsset(user.id, photo, "photo");
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      name: parsed.data.name,
      city: parsed.data.city,
      phone: parsed.data.phone || null,
      experience: parsed.data.experience || null,
      radius_km: parsed.data.radius_km,
      categories: parsed.data.categories,
      available_today: parsed.data.available_today,
      ...(photoUrl ? { photo_url: photoUrl } : {})
    })
    .eq("id", user.id)
    .eq("role", "worker");

  if (error) {
    redirect(`/panel?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/");
  revalidatePath("/panel");
  redirect("/panel?ok=Perfil+worker+actualizado");
}

export async function updateCompanyProfileAction(formData: FormData) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const parsed = companyProfileSchema.safeParse({
    name: formData.get("name"),
    city: formData.get("city"),
    company_name: formData.get("company_name"),
    contact_name: formData.get("contact_name"),
    cif: formData.get("cif")
  });

  if (!parsed.success) {
    redirect("/panel?error=Datos+de+perfil+empresa+invalidos");
  }

  let logoUrl: string | undefined;
  const logo = formData.get("logo");
  if (logo instanceof File && logo.size > 0) {
    logoUrl = await uploadProfileAsset(user.id, logo, "logo");
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      name: parsed.data.name,
      city: parsed.data.city,
      company_name: parsed.data.company_name,
      contact_name: parsed.data.contact_name,
      cif: parsed.data.cif || null,
      ...(logoUrl ? { logo_url: logoUrl } : {})
    })
    .eq("id", user.id)
    .eq("role", "company");

  if (error) {
    redirect(`/panel?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/");
  revalidatePath("/panel");
  redirect("/panel?ok=Perfil+empresa+actualizado");
}

export async function toggleAvailableTodayAction() {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/auth/login");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("available_today, role")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    redirect("/?error=Perfil+no+disponible");
  }
  if (profile.role !== "worker") {
    redirect("/?error=Solo+trabajadores+pueden+usar+este+toggle");
  }

  const { error } = await supabase
    .from("profiles")
    .update({ available_today: !profile.available_today })
    .eq("id", user.id);

  if (error) {
    redirect(`/?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/");
  revalidatePath("/panel");
  redirect("/");
}
