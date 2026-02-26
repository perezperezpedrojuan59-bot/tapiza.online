import { createJobAction } from "@/app/actions/jobs";
import { FlashMessage } from "@/components/flash-message";
import { JobForm } from "@/components/job-form";
import { requireRole } from "@/lib/auth";

type NewOfferPageProps = {
  searchParams?: {
    error?: string;
  };
};

export default async function NewOfferPage({ searchParams }: NewOfferPageProps) {
  await requireRole("company");

  return (
    <section className="space-y-4">
      <h1 className="text-xl font-semibold">Nueva oferta</h1>
      <FlashMessage error={searchParams?.error} />
      <JobForm action={createJobAction} submitLabel="Publicar oferta" />
    </section>
  );
}
