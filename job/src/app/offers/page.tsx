import Link from "next/link";

import { FlashMessage } from "@/components/flash-message";
import { JOB_CATEGORIES } from "@/lib/constants";
import { getCurrentProfile } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type OffersPageProps = {
  searchParams?: {
    city?: string;
    category?: string;
    urgent?: string;
    error?: string;
    ok?: string;
  };
};

export default async function OffersPage({ searchParams }: OffersPageProps) {
  const supabase = createSupabaseServerClient();
  const { profile } = await getCurrentProfile();

  const city = searchParams?.city?.trim() ?? "";
  const category = searchParams?.category?.trim() ?? "";
  const urgent = searchParams?.urgent === "1";

  let query = supabase
    .from("jobs")
    .select("*")
    .order("urgent", { ascending: false })
    .order("created_at", { ascending: false });

  if (city) query = query.ilike("city", `%${city}%`);
  if (category) query = query.eq("category", category);
  if (urgent) query = query.eq("urgent", true);

  const { data: jobs } = await query.limit(100);

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Ofertas</h1>
        {profile?.role === "company" && (
          <Link
            href="/offers/new"
            className="rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white"
          >
            Crear oferta
          </Link>
        )}
      </div>

      <FlashMessage error={searchParams?.error} ok={searchParams?.ok} />

      <form className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white p-4">
        <input
          name="city"
          defaultValue={city}
          placeholder="Ciudad"
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          name="category"
          defaultValue={category}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">Categoria</option>
          {JOB_CATEGORIES.map((item) => (
            <option key={item} value={item}>
              {item}
            </option>
          ))}
        </select>
        <label className="col-span-2 flex items-center gap-2 text-sm">
          <input type="checkbox" name="urgent" value="1" defaultChecked={urgent} />
          Solo urgentes
        </label>
        <button
          type="submit"
          className="col-span-2 rounded-md border border-slate-300 px-3 py-2 text-sm font-medium"
        >
          Filtrar
        </button>
      </form>

      <div className="space-y-2">
        {jobs?.map((job) => (
          <Link
            key={job.id}
            href={`/offers/${job.id}`}
            className="block rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{job.title}</p>
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
          </Link>
        ))}
      </div>
      {jobs?.length === 0 && (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          No hay resultados para los filtros seleccionados.
        </p>
      )}
    </section>
  );
}
