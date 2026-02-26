import Link from "next/link";
import { redirect } from "next/navigation";

import { deleteJobAction } from "@/app/actions/jobs";
import {
  updateCompanyProfileAction,
  updateWorkerProfileAction
} from "@/app/actions/profiles";
import { CompanyProfileForm } from "@/components/company-profile-form";
import { FlashMessage } from "@/components/flash-message";
import { WorkerProfileForm } from "@/components/worker-profile-form";
import { getCurrentProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type WorkerApplication = {
  id: string;
  status: "applied" | "shortlisted" | "rejected" | "hired";
  job: { id: string; title: string; city: string; category: string } | null;
  chats: { id: string }[];
};

type CompanyJob = {
  id: string;
  title: string;
  city: string;
  category: string;
  urgent: boolean;
  applications: { id: string }[] | null;
};

type WorkerApplicationRaw = {
  id: string;
  status: "applied" | "shortlisted" | "rejected" | "hired";
  job: { id: string; title: string; city: string; category: string }[] | null;
  chats: { id: string }[] | null;
};

type PanelPageProps = {
  searchParams?: {
    error?: string;
    ok?: string;
  };
};

export default async function PanelPage({ searchParams }: PanelPageProps) {
  const { session, profile } = await getCurrentProfile();
  if (!session || !profile) redirect("/auth/login");

  const supabase = createSupabaseServerClient();

  if (profile.role === "worker") {
    const { data } = await supabase
      .from("applications")
      .select("id, status, job:jobs(id, title, city, category), chats(id)")
      .eq("worker_id", session.user.id)
      .order("created_at", { ascending: false });

    const applications = (((data ?? []) as unknown as WorkerApplicationRaw[]) ?? []).map(
      (item) => ({
        id: item.id,
        status: item.status,
        job: item.job?.[0] ?? null,
        chats: item.chats ?? []
      })
    );

    return (
      <section className="space-y-4">
        <h1 className="text-xl font-semibold">Panel trabajador</h1>
        <FlashMessage error={searchParams?.error} ok={searchParams?.ok} />
        <WorkerProfileForm profile={profile} action={updateWorkerProfileAction} />

        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Mis candidaturas</h2>
          {applications.map((application) => (
            <article
              key={application.id}
              className="space-y-1 rounded-xl border border-slate-200 bg-white p-4"
            >
              <p className="font-semibold">{application.job?.title ?? "Oferta eliminada"}</p>
              <p className="text-sm text-slate-600">
                {application.job?.city ?? "-"} - {application.job?.category ?? "-"}
              </p>
              <p className="text-sm">
                Estado:{" "}
                <span className="font-medium uppercase">{application.status}</span>
              </p>
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
          {applications.length === 0 && (
            <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
              Aun no has aplicado a ninguna oferta.
            </p>
          )}
        </section>
      </section>
    );
  }

  const { data } = await supabase
    .from("jobs")
    .select("id, title, city, category, urgent, applications(id)")
    .eq("company_id", session.user.id)
    .order("created_at", { ascending: false });

  const jobs = (data ?? []) as CompanyJob[];

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Panel empresa</h1>
      <FlashMessage error={searchParams?.error} ok={searchParams?.ok} />
      <CompanyProfileForm profile={profile} action={updateCompanyProfileAction} />

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Mis ofertas</h2>
          <Link
            href="/offers/new"
            className="rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white"
          >
            Crear oferta
          </Link>
        </div>
        {jobs.map((job) => (
          <article
            key={job.id}
            className="space-y-2 rounded-xl border border-slate-200 bg-white p-4"
          >
            <p className="font-semibold">{job.title}</p>
            <p className="text-sm text-slate-600">
              {job.city} - {job.category}
            </p>
            <p className="text-sm text-slate-600">
              Candidaturas: {job.applications?.length ?? 0}
            </p>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/offers/${job.id}`}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium"
              >
                Ver detalle
              </Link>
              <Link
                href={`/offers/${job.id}/edit`}
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium"
              >
                Editar
              </Link>
              <form action={deleteJobAction}>
                <input type="hidden" name="job_id" value={job.id} />
                <button
                  type="submit"
                  className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700"
                >
                  Eliminar
                </button>
              </form>
            </div>
          </article>
        ))}
        {jobs.length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            No has publicado ofertas todavia.
          </p>
        )}
      </section>
    </section>
  );
}
