import Link from "next/link";

import { signOutAction } from "@/app/actions/auth";
import type { UserRole } from "@/types/database";

type TopBarProps = {
  role: UserRole | null;
};

export function TopBar({ role }: TopBarProps) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-bold text-brand-dark">
          CurranteYA
        </Link>
        <div className="flex items-center gap-2">
          {!role ? (
            <>
              <Link
                href="/auth/login"
                className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium"
              >
                Entrar
              </Link>
              <Link
                href="/auth/register"
                className="rounded-md bg-brand px-3 py-2 text-sm font-semibold text-white"
              >
                Crear cuenta
              </Link>
            </>
          ) : (
            <form action={signOutAction}>
              <button
                type="submit"
                className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium"
              >
                Salir
              </button>
            </form>
          )}
        </div>
      </div>
    </header>
  );
}
