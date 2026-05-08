"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Footer } from "@/components/footer";
import HeaderClient from "./header-client";

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isSignInRoute = pathname?.startsWith("/sign-in") ?? false;

  // On /sign-in the auth shell owns the full viewport (its own <main>,
  // masthead, and footer). Don't wrap it in another <main> or the
  // outer-flex container will leave whitespace below.
  if (isSignInRoute) {
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
