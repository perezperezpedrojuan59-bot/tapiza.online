import Link from "next/link";
import { redirect } from "next/navigation";

import { signInAction } from "@/app/actions/auth";
import { FlashMessage } from "@/components/flash-message";
import { getCurrentProfile } from "@/lib/auth";

type LoginPageProps = {
  searchParams?: {
    error?: string;
    message?: string;
  };
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { session } = await getCurrentProfile();
  if (session) redirect("/");

  return (
    <section className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-semibold">Entrar</h1>
      <FlashMessage error={searchParams?.error} message={searchParams?.message} />
      <form action={signInAction} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="block text-sm font-medium">
          Email
          <input
            name="email"
            type="email"
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm font-medium">
          Password
          <input
            name="password"
            type="password"
            required
            minLength={8}
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white"
        >
          Entrar
        </button>
      </form>
      <p className="text-sm text-slate-600">
        No tienes cuenta?{" "}
        <Link href="/auth/register" className="font-semibold text-brand-dark">
          Registrate
        </Link>
      </p>
    </section>
  );
}
