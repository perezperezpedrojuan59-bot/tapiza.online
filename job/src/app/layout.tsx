import type { Metadata } from "next";
import { Inter } from "next/font/google";

import { BottomNav } from "@/components/bottom-nav";
import { TopBar } from "@/components/top-bar";
import { getCurrentProfile } from "@/lib/auth";

import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "CurranteYA",
  description: "Empleo rapido para trabajadores operativos"
};

export default async function RootLayout({
  children
}: Readonly<{ children: React.ReactNode }>) {
  const { profile } = await getCurrentProfile();
  const role = profile?.role ?? null;

  return (
    <html lang="es">
      <body className={inter.className}>
        <TopBar role={role} />
        <main className="mx-auto max-w-5xl px-4 pb-24 pt-4 md:pb-8">{children}</main>
        <BottomNav role={role} />
      </body>
    </html>
  );
}
