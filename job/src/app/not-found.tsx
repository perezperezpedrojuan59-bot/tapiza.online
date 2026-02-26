import Link from "next/link";

export default function NotFoundPage() {
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-6 text-center">
      <h1 className="text-2xl font-bold">Pagina no encontrada</h1>
      <p className="text-sm text-slate-600">
        La ruta que buscas no existe o no tienes permiso para verla.
      </p>
      <Link
        href="/"
        className="inline-block rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white"
      >
        Volver al inicio
      </Link>
    </section>
  );
}
