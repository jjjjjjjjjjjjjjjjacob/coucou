"use client";

import { useUser } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const workspaceSlug = "danza-organica";
const workspaceOrganizationId = process.env.NEXT_PUBLIC_DANZA_ORGANICA_CLERK_ORGANIZATION_ID ?? "";
const coucouBaseUrl = (process.env.NEXT_PUBLIC_COUCOU_BASE_URL ?? "http://localhost:5680").replace(
  /\/+$/,
  "",
);

const REDIRECT_PATHS = new Set(["/", ""]);

export function RedirectAdminsToCoucou() {
  const { isLoaded, isSignedIn, user } = useUser();
  const pathname = usePathname();

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) return;
    if (!workspaceOrganizationId) return;
    if (!REDIRECT_PATHS.has(pathname ?? "")) return;

    const membership = user.organizationMemberships?.find(
      (entry) => entry.organization.id === workspaceOrganizationId,
    );
    if (!membership) return;

    const role = membership.role;
    const dashboardPath =
      role === "org:admin" || role === "org:host"
        ? "dashboard"
        : role === "org:door" || role === "org:member"
          ? "dashboard/rsvps"
          : null;
    if (!dashboardPath) return;

    window.location.replace(`${coucouBaseUrl}/workspaces/${workspaceSlug}/${dashboardPath}`);
  }, [isLoaded, isSignedIn, user, pathname]);

  return null;
}
