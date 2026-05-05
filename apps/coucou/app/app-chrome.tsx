"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import HeaderClient from "./header-client";
import { Footer } from "@/components/footer";

// Routes whose pages own their full chrome (sidebar shell, sign-in shell,
// etc.). On these routes AppChrome steps aside so we don't stack the
// platform masthead on top of an internal layout. Coucou is the platform
// admin, not a tenant — most of its operational surfaces are sidebar-led.
const SELF_CHROMED_PREFIXES = [
  "/sign-in",
  "/admin",
  "/host",
  "/door",
  "/workspaces",
  "/dashboard",
];

function ownsChrome(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (pathname === "/") return true;
  return SELF_CHROMED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  if (ownsChrome(pathname)) {
    return <>{children}</>;
  }

  return (
    <>
      <HeaderClient />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
