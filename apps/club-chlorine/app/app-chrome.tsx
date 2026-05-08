"use client";

import { ChlorineAppShell } from "@coucou/ui/tenant-template";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Footer } from "@/components/footer";
import HeaderClient from "./header-client";

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // One persistent shell hosts the chlorine wordmark for every route. The
  // mode prop drives the layout — `expanded` for the landing (split top/
  // bottom anchors with a centered band of events) and `collapsed` for
  // every post-landing page (small upper-left wordmark, content centered
  // in the rest of the viewport). The wordmark instance never unmounts,
  // so a `/` → `/events/[id]` navigation just flips the mode and the
  // existing CSS transforms tween the SVG pieces between layouts.
  const isLandingRoute = pathname === "/";
  const mode = isLandingRoute ? "expanded" : "collapsed";
  // 650px = source wordmark width — keeps event lists / RSVP / status /
  // ticket forms aligned with the wordmark anchors. Account and profile
  // host wider Clerk surfaces and own their own internal max-widths, so
  // we drop the shell constraint there.
  const isWideContentRoute = pathname === "/account" || pathname === "/profile";
  const contentMaxWidth = isWideContentRoute ? undefined : 650;

  return (
    <>
      <HeaderClient />
      <ChlorineAppShell
        mode={mode}
        linkComponent={Link}
        wordmarkHref="/"
        contentMaxWidthPx={contentMaxWidth}
      >
        {children}
      </ChlorineAppShell>
      <Footer />
    </>
  );
}
