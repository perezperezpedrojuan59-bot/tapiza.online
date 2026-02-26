"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import type { UserRole } from "@/types/database";

type BottomNavProps = {
  role: UserRole | null;
};

const COMMON_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/offers", label: "Ofertas" },
  { href: "/panel", label: "Panel" }
] as const;

export function BottomNav({ role }: BottomNavProps) {
  const pathname = usePathname();
  if (!role) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-slate-200 bg-white md:hidden">
      <ul className="mx-auto grid max-w-lg grid-cols-3">
        {COMMON_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "block px-3 py-3 text-center text-sm font-medium",
                  active ? "text-brand" : "text-slate-500"
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
