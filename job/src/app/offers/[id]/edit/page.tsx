import { notFound, redirect } from "next/navigation";

import { updateJobAction } from "@/app/actions/jobs";
import { FlashMessage } from "@/components/flash-message";
import { JobForm } from "@/components/job-form";
import { requireRole } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type EditOfferPageProps = {
  params: { id: string };
  searchParams?: { error?: string };
};

export default async function EditOfferPage({
  params,
  searchParams
}: EditOfferPageProps) {
  const { session } = await requireRole("company");
  const supabase = createSupabaseServerClient();

  const { data: job } = await supabase
    .from("jobs")
    .select("*")
    .eq("id", params.id)
    .single();

  if (!job) notFound();
  if (job.company_id !== session.user.id) redirect(`/offers/${params.id}`);

  const action = updateJobAction.bind(null, params.id);

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Editar oferta</h1>
      <FlashMessage error={searchParams?.error} />
      <JobForm action={action} initial={job} submitLabel="Guardar cambios" />
    </section>
  );
}
