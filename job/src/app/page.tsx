import Link from "next/link";

import { toggleAvailableTodayAction } from "@/app/actions/profiles";
import { FlashMessage } from "@/components/flash-message";
import { JOB_CATEGORIES } from "@/lib/constants";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toCommaList } from "@/lib/utils";
import { getCurrentProfile } from "@/lib/auth";

type HomePageProps = {
  searchParams?: {
    city?: string;
    category?: string;
    error?: string;
    ok?: string;
    message?: string;
  };
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const supabase = createSupabaseServerClient();
  const { session, profile } = await getCurrentProfile();

  const { data: jobs } = await supabase
    .from("jobs")
    .select("*")
    .order("urgent", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(20);

  if (!session || !profile) {
    return (
      <section className="space-y-4">
        <FlashMessage
          error={searchParams?.error}
          ok={searchParams?.ok}
          message={searchParams?.message}
        />
        <div className="rounded-2xl bg-brand-dark p-5 text-white">
          <h1 className="text-2xl font-bold">Encuentra curro o personal hoy mismo</h1>
          <p className="mt-2 text-sm text-white/90">
            CurranteYA conecta trabajadores operativos con empresas que necesitan cubrir
            puestos urgentes.
          </p>
          <div className="mt-4 flex gap-2">
            <Link
              href="/auth/register"
              className="rounded-md bg-white px-4 py-2 text-sm font-semibold text-brand-dark"
            >
              Crear cuenta
            </Link>
            <Link
              href="/auth/login"
              className="rounded-md border border-white/40 px-4 py-2 text-sm font-semibold"
            >
              Ya tengo cuenta
            </Link>
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Ultimas ofertas</h2>
          {jobs?.map((job) => (
            <Link
              href={`/offers/${job.id}`}
              key={job.id}
              className="block rounded-xl border border-slate-200 bg-white p-4"
            >
              <p className="font-semibold">{job.title}</p>
              <p className="text-sm text-slate-600">
                {job.city} - {job.category} - {job.schedule}
              </p>
              {job.urgent && (
                <span className="mt-2 inline-block rounded bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                  Urgente
                </span>
              )}
            </Link>
          ))}
          {jobs?.length === 0 && (
            <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
              No hay ofertas publicadas aun.
            </p>
          )}
        </div>
      </section>
    );
  }

  if (profile.role === "worker") {
    return (
      <section className="space-y-4">
        <FlashMessage error={searchParams?.error} ok={searchParams?.ok} />
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <h1 className="text-lg font-semibold">Hola, {profile.name}</h1>
          <p className="mt-1 text-sm text-slate-600">
            Tu estado de hoy:{" "}
            <strong>{profile.available_today ? "Disponible" : "No disponible"}</strong>
          </p>
          <form action={toggleAvailableTodayAction} className="mt-3">
            <button
              type="submit"
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white"
            >
              {profile.available_today ? "Marcar no disponible" : "Marcar disponible hoy"}
            </button>
          </form>
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Ofertas para ti</h2>
          {jobs?.map((job) => (
            <Link
              href={`/offers/${job.id}`}
              key={job.id}
              className="block rounded-xl border border-slate-200 bg-white p-4"
            >
              <p className="font-semibold">{job.title}</p>
              <p className="text-sm text-slate-600">
                {job.city} - {job.category} - {job.schedule}
              </p>
              <p className="mt-1 text-sm text-slate-700">{job.salary_text}</p>
            </Link>
          ))}
        </div>
      </section>
    );
  }

  const city = searchParams?.city?.trim() ?? "";
  const category = searchParams?.category?.trim() ?? "";

  let query = supabase
    .from("profiles")
    .select("id, name, city, categories, experience, available_today, radius_km")
    .eq("role", "worker")
    .eq("available_today", true)
    .order("updated_at", { ascending: false });

  if (city) query = query.ilike("city", `%${city}%`);
  if (category) query = query.contains("categories", [category]);

  const { data: availableWorkers } = await query.limit(50);

  return (
    <section className="space-y-4">
      <FlashMessage error={searchParams?.error} ok={searchParams?.ok} />
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h1 className="text-lg font-semibold">Panel rapido empresa</h1>
        <p className="mt-1 text-sm text-slate-600">
          Filtra trabajadores disponibles hoy para cubrir turnos.
        </p>
      </div>

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
        <button
          type="submit"
          className="col-span-2 rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white"
        >
          Aplicar filtros
        </button>
      </form>

      <div className="space-y-2">
        {(availableWorkers ?? []).map((worker) => (
          <article key={worker.id} className="rounded-xl border border-slate-200 bg-white p-4">
            <p className="font-semibold">{worker.name}</p>
            <p className="text-sm text-slate-600">{worker.city}</p>
            <p className="mt-1 text-sm text-slate-600">
              Categorias: {toCommaList(worker.categories)}
            </p>
            <p className="mt-1 text-sm text-slate-600">
              Radio: {worker.radius_km} km - Disponible hoy
            </p>
            {worker.experience && (
              <p className="mt-1 text-sm text-slate-700">{worker.experience}</p>
            )}
          </article>
        ))}
        {availableWorkers?.length === 0 && (
          <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
            No hay trabajadores disponibles con estos filtros.
          </p>
        )}
      </div>
    </section>
  );
}
