"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import HeaderClient from "./header-client";
import { Footer } from "@/components/footer";

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isSignInRoute = pathname?.startsWith("/sign-in") ?? false;
  // The chlorine landing's animated wordmark IS the chrome — it splits to
  // anchor at the top and bottom edges of the viewport. Rendering the shared
  // header/footer on top of it would double up the brand mark.
  const isHomeRoute = pathname === "/";

  // On /sign-in the auth shell owns the full viewport (its own <main>,
  // masthead, and footer). Don't wrap it in another <main> or the
  // outer-flex container will leave whitespace below.
  if (isSignInRoute || isHomeRoute) {
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
