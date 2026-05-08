"use client";

import { ChlorineAppShell } from "@coucou/ui/tenant-template";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Footer } from "@/components/footer";
import HeaderClient from "./header-client";

export function isExactEventDetailPath(pathname: string | null | undefined): boolean {
  return /^\/events\/[^/]+\/?$/.test(pathname ?? "");
}

export function resolveChlorineAppShellMode(pathname: string | null | undefined) {
  return pathname === "/" || isExactEventDetailPath(pathname) ? "expanded" : "collapsed";
}

export function shouldSkipChlorineAppShellIntro(pathname: string | null | undefined) {
  return !isExactEventDetailPath(pathname) && pathname !== "/";
}

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // One persistent shell hosts the chlorine wordmark for every route. The
  // mode prop drives the layout — `expanded` for the landing (split top/
  // bottom anchors with a centered band of events) and `collapsed` for
  // most post-landing pages (small upper-left wordmark, content centered
  // in the rest of the viewport). Exact event detail routes reuse the
  // split final state so shared event pages keep the landing composition.
  // The wordmark instance never unmounts,
  // so a `/` → `/events/[id]` navigation keeps the already-settled split
  // state. A direct `/events/[id]` mount is allowed to play the measured
  // center→split intro; nested post-RSVP pages mount collapsed.
  const mode = resolveChlorineAppShellMode(pathname);
  const skipAnimation = shouldSkipChlorineAppShellIntro(pathname);
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
        yearLabel=""
        postViewportBottomPaddingPx={72}
        skipAnimation={skipAnimation}
      >
        {children}
      </ChlorineAppShell>
      <Footer />
    </>
  );
}
