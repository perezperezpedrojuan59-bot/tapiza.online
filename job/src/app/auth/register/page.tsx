import Link from "next/link";
import { redirect } from "next/navigation";

import { signUpAction } from "@/app/actions/auth";
import { FlashMessage } from "@/components/flash-message";
import { getCurrentProfile } from "@/lib/auth";

type RegisterPageProps = {
  searchParams?: {
    error?: string;
  };
};

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const { session } = await getCurrentProfile();
  if (session) redirect("/");

  return (
    <section className="mx-auto max-w-md space-y-4">
      <h1 className="text-xl font-semibold">Crear cuenta</h1>
      <FlashMessage error={searchParams?.error} />
      <form action={signUpAction} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="block text-sm font-medium">
          Rol
          <select
            name="role"
            defaultValue="worker"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          >
            <option value="worker">Worker</option>
            <option value="company">Company</option>
          </select>
        </label>
        <label className="block text-sm font-medium">
          Nombre
          <input
            name="name"
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <label className="block text-sm font-medium">
          Ciudad
          <input
            name="city"
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
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
            minLength={8}
            required
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2"
          />
        </label>
        <button
          type="submit"
          className="w-full rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white"
        >
          Crear cuenta
        </button>
      </form>
      <p className="text-sm text-slate-600">
        Ya tienes cuenta?{" "}
        <Link href="/auth/login" className="font-semibold text-brand-dark">
          Entrar
        </Link>
      </p>
    </section>
  );
}
