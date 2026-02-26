"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  applicationStatusSchema,
  jobSchema
} from "@/lib/validation/schemas";

export async function createJobAction(formData: FormData) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (!profile || profile.role !== "company") redirect("/");

  const parsed = jobSchema.safeParse({
    title: formData.get("title"),
    category: formData.get("category"),
    city: formData.get("city"),
    description: formData.get("description"),
    schedule: formData.get("schedule"),
    salary_text: formData.get("salary_text"),
    start_date: formData.get("start_date"),
    urgent: formData.get("urgent") === "on"
  });

  if (!parsed.success) {
    redirect("/offers/new?error=Datos+de+oferta+invalidos");
  }

  const { error } = await supabase.from("jobs").insert({
    company_id: user.id,
    title: parsed.data.title,
    category: parsed.data.category,
    city: parsed.data.city,
    description: parsed.data.description,
    schedule: parsed.data.schedule,
    salary_text: parsed.data.salary_text,
    start_date: parsed.data.start_date || null,
    urgent: parsed.data.urgent
  });

  if (error) {
    redirect(`/offers/new?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/offers");
  revalidatePath("/panel");
  redirect("/offers?ok=Oferta+creada");
}

export async function updateJobAction(jobId: string, formData: FormData) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const parsed = jobSchema.safeParse({
    title: formData.get("title"),
    category: formData.get("category"),
    city: formData.get("city"),
    description: formData.get("description"),
    schedule: formData.get("schedule"),
    salary_text: formData.get("salary_text"),
    start_date: formData.get("start_date"),
    urgent: formData.get("urgent") === "on"
  });

  if (!parsed.success) {
    redirect(`/offers/${jobId}/edit?error=Datos+de+oferta+invalidos`);
  }

  const { error } = await supabase
    .from("jobs")
    .update({
      title: parsed.data.title,
      category: parsed.data.category,
      city: parsed.data.city,
      description: parsed.data.description,
      schedule: parsed.data.schedule,
      salary_text: parsed.data.salary_text,
      start_date: parsed.data.start_date || null,
      urgent: parsed.data.urgent
    })
    .eq("id", jobId)
    .eq("company_id", user.id);

  if (error) {
    redirect(`/offers/${jobId}/edit?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath(`/offers/${jobId}`);
  revalidatePath("/offers");
  revalidatePath("/panel");
  redirect(`/offers/${jobId}?ok=Oferta+actualizada`);
}

export async function deleteJobAction(formData: FormData) {
  const jobId = String(formData.get("job_id") ?? "");
  if (!jobId) redirect("/panel?error=Oferta+invalida");

  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase
    .from("jobs")
    .delete()
    .eq("id", jobId)
    .eq("company_id", user.id);

  if (error) {
    redirect(`/panel?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/offers");
  revalidatePath("/panel");
  redirect("/panel?ok=Oferta+eliminada");
}

export async function applyToJobAction(jobId: string) {
  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { data: workerProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!workerProfile || workerProfile.role !== "worker") {
    redirect(`/offers/${jobId}?error=Solo+workers+pueden+postular`);
  }

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, company_id")
    .eq("id", jobId)
    .single();

  if (jobError || !job) {
    redirect("/offers?error=Oferta+no+encontrada");
  }

  const { data: existingApplication } = await supabase
    .from("applications")
    .select("id")
    .eq("job_id", jobId)
    .eq("worker_id", user.id)
    .maybeSingle();

  let applicationId = existingApplication?.id;
  if (!applicationId) {
    const { data: inserted, error: insertError } = await supabase
      .from("applications")
      .insert({ job_id: jobId, worker_id: user.id, status: "applied" })
      .select("id")
      .single();
    if (insertError || !inserted) {
      redirect(`/offers/${jobId}?error=${encodeURIComponent(insertError?.message ?? "No+se+pudo+postular")}`);
    }
    applicationId = inserted.id;
  }

  const { data: existingChat } = await supabase
    .from("chats")
    .select("id")
    .eq("application_id", applicationId)
    .maybeSingle();

  let chatId = existingChat?.id;
  if (!chatId) {
    const { data: insertedChat, error: chatError } = await supabase
      .from("chats")
      .insert({
        job_id: jobId,
        company_id: job.company_id,
        worker_id: user.id,
        application_id: applicationId
      })
      .select("id")
      .single();
    if (chatError || !insertedChat) {
      redirect(`/offers/${jobId}?error=${encodeURIComponent(chatError?.message ?? "No+se+pudo+crear+chat")}`);
    }
    chatId = insertedChat.id;
  }

  revalidatePath(`/offers/${jobId}`);
  revalidatePath("/panel");
  redirect(`/chats/${chatId}`);
}

export async function updateApplicationStatusAction(
  applicationId: string,
  formData: FormData
) {
  const parsed = applicationStatusSchema.safeParse({
    status: formData.get("status")
  });
  if (!parsed.success) {
    redirect("/panel?error=Estado+invalido");
  }

  const supabase = createSupabaseServerClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect("/auth/login");

  const { error } = await supabase
    .from("applications")
    .update({ status: parsed.data.status })
    .eq("id", applicationId);

  if (error) {
    redirect(`/panel?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/panel");
  redirect("/panel?ok=Estado+de+candidatura+actualizado");
}
