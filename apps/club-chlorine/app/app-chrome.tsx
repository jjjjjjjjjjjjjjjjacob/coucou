"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChlorineLanding } from "@coucou/ui/tenant-template";
import HeaderClient from "./header-client";
import { Footer } from "@/components/footer";

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // The Club Chlorine animated split wordmark IS the chrome — three-phase
  // intro (centered → split → content fades in) anchors CLUB to the top
  // edge and CHLORINE to the bottom. We mount it ONCE here so every shell
  // route (home, sign-in, every /events/<id>/* subpath) shares the same
  // wordmark instance — navigating between them only swaps `children`,
  // never re-measures or re-animates the marks.
  const isHomeRoute = pathname === "/" || pathname === "/events";
  const isLandingShellRoute =
    isHomeRoute ||
    (pathname?.startsWith("/sign-in") ?? false) ||
    /^\/events\/[^/]+\/?$/.test(pathname ?? "");
  const isFormShellRoute = /^\/events\/[^/]+\/(rsvp|status|ticket|denied)(?:\/|$)/.test(
    pathname ?? "",
  );
  const isShellRoute = isLandingShellRoute || isFormShellRoute;

  if (isShellRoute) {
    return (
      <>
        <HeaderClient />
        <ChlorineLanding linkComponent={Link} wordmarkHref="/">
          {children}
        </ChlorineLanding>
        <Footer />
      </>
    );
  }

  return (
    <>
      <HeaderClient />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}
