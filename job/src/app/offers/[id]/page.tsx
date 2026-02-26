import Link from "next/link";
import { notFound } from "next/navigation";

import { ApplicationStatusForm } from "@/components/application-status-form";
import { ApplyButton } from "@/components/apply-button";
import { FlashMessage } from "@/components/flash-message";
import { getCurrentProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toCommaList } from "@/lib/utils";

type OfferDetailPageProps = {
  params: { id: string };
  searchParams?: {
    error?: string;
    ok?: string;
  };
};

type CandidateRow = {
  id: string;
  status: "applied" | "shortlisted" | "rejected" | "hired";
  worker_id: string;
  chats: { id: string }[] | null;
  worker: {
    id: string;
    name: string;
    city: string;
    categories: string[] | null;
  } | null;
};

export default async function OfferDetailPage({
  params,
  searchParams
}: OfferDetailPageProps) {
  const supabase = createSupabaseServerClient();
  const { profile } = await getCurrentProfile();

  const { data: job } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!job) notFound();

  const { data: companyProfile } = await supabase
    .from("profiles")
    .select("id, company_name, contact_name, city")
    .eq("id", job.company_id)
    .single();

  let alreadyApplied = false;
  let chatIdForWorker: string | null = null;

  if (profile?.role === "worker") {
    const { data: application } = await supabase
      .from("applications")
      .select("id, chats(id)")
      .eq("job_id", job.id)
      .eq("worker_id", profile.id)
      .maybeSingle();
    alreadyApplied = Boolean(application);
    chatIdForWorker = application?.chats?.[0]?.id ?? null;
  }

  let candidates: CandidateRow[] = [];
  if (profile?.role === "company" && profile.id === job.company_id) {
    const { data } = await supabase
      .from("applications")
      .select(
        "id, status, worker_id, chats(id), worker:profiles!applications_worker_id_fkey(id, name, city, categories)"
      )
      .eq("job_id", job.id)
      .order("created_at", { ascending: false });
    candidates = (data ?? []) as CandidateRow[];
  }

  return (
    <section className="space-y-4">
      <FlashMessage error={searchParams?.error} ok={searchParams?.ok} />

      <article className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold">{job.title}</h1>
            <p className="text-sm text-slate-600">
              {job.city} - {job.category} - {job.schedule}
            </p>
            <p className="mt-1 text-sm text-slate-700">{job.salary_text}</p>
          </div>
          {job.urgent && (
            <span className="rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
              Urgente
            </span>
          )}
        </div>

        <p className="text-sm text-slate-700">{job.description}</p>
        {job.start_date && (
          <p className="text-sm text-slate-600">Inicio: {job.start_date}</p>
        )}

        <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
          <p className="font-medium">Empresa</p>
          <p>{companyProfile?.company_name ?? "Sin nombre empresa"}</p>
          <p>Contacto: {companyProfile?.contact_name ?? "-"}</p>
        </div>

        {profile?.role === "worker" && (
          <div className="flex flex-wrap items-center gap-2">
            <ApplyButton jobId={job.id} disabled={alreadyApplied} />
            {chatIdForWorker && (
              <Link
                href={`/chats/${chatIdForWorker}`}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium"
              >
                Abrir chat
              </Link>
            )}
          </div>
        )}

        {profile?.role === "company" && profile.id === job.company_id && (
          <div className="flex items-center gap-2">
            <Link
              href={`/offers/${job.id}/edit`}
              className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium"
            >
              Editar oferta
            </Link>
          </div>
        )}
      </article>

      {profile?.role === "company" && profile.id === job.company_id && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Candidatos</h2>
          {candidates.map((application) => (
            <article
              key={application.id}
              className="space-y-2 rounded-xl border border-slate-200 bg-white p-4"
            >
              <p className="font-semibold">{application.worker?.name ?? "Sin nombre"}</p>
              <p className="text-sm text-slate-600">{application.worker?.city ?? "-"}</p>
              <p className="text-sm text-slate-600">
                Categorias: {toCommaList(application.worker?.categories)}
              </p>
              <ApplicationStatusForm
                applicationId={application.id}
                currentStatus={application.status}
              />
              {application.chats?.[0]?.id && (
                <Link
                  href={`/chats/${application.chats[0].id}`}
                  className="inline-block rounded-md border border-slate-300 px-3 py-2 text-sm font-medium"
                >
                  Abrir chat
                </Link>
              )}
            </article>
          ))}
          {candidates.length === 0 && (
            <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
              Aun no hay candidaturas para esta oferta.
            </p>
          )}
        </section>
      )}
    </section>
  );
}
