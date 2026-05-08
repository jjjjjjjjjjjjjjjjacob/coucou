"use client";

import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useWorkspaceAccess } from "@/components/workspace-access-gate";
import {
  buildWorkspaceOperationPath,
  getWorkspaceSlugFromPathname,
  isCoucouWorkspaceSlug,
  type WorkspaceOperationSurface,
} from "./workspace-config";

interface WorkspaceScope {
  workspaceSlug: string;
  siteKey: string;
  brandName: string;
  primaryDomain?: string | null;
  clerkOrganizationId?: string | null;
  clerkOrganizationSlug?: string | null;
  queryArgs: {
    siteKey: string;
    workspaceSlug: string;
  };
}

export function useWorkspaceScope() {
  const workspaceAccess = useWorkspaceAccess();
  const pathname = usePathname();
  const workspaceSlug = useMemo(() => getWorkspaceSlugFromPathname(pathname), [pathname]);
  const workspace = useQuery(
    api.workspaces.getWorkspaceBySlug,
    workspaceAccess || !workspaceSlug ? "skip" : { slug: workspaceSlug },
  );

  return useMemo<WorkspaceScope | null>(() => {
    if (workspaceAccess) {
      return {
        workspaceSlug: workspaceAccess.workspaceSlug,
        siteKey: workspaceAccess.siteKey,
        brandName: workspaceAccess.workspaceBrandName,
        primaryDomain: workspaceAccess.primaryDomain,
        clerkOrganizationId: workspaceAccess.clerkOrganizationId,
        clerkOrganizationSlug: workspaceAccess.clerkOrganizationSlug,
        queryArgs: workspaceAccess.queryArgs,
      };
    }

    if (
      !workspace ||
      typeof workspace.slug !== "string" ||
      typeof workspace.name !== "string" ||
      isCoucouWorkspaceSlug(workspace.slug) ||
      workspace.kind === "admin"
    ) {
      return null;
    }

    const primaryWorkspaceSite = workspace.sites?.[0] ?? null;

    return {
      workspaceSlug: workspace.slug,
      siteKey: primaryWorkspaceSite?.siteKey ?? workspace.slug,
      brandName: workspace.name,
      primaryDomain: workspace.primaryDomain,
      clerkOrganizationId: workspace.clerkOrganizationId,
      clerkOrganizationSlug: workspace.clerkOrganizationSlug,
      queryArgs: {
        siteKey: primaryWorkspaceSite?.siteKey ?? workspace.slug,
        workspaceSlug: workspace.slug,
      },
    };
  }, [workspace, workspaceAccess]);
}

export function useWorkspaceOperationPath(
  surface: WorkspaceOperationSurface,
  pathname = "",
): string {
  const workspaceScope = useWorkspaceScope();
  if (workspaceScope) {
    return buildWorkspaceOperationPath(workspaceScope.workspaceSlug, surface, pathname);
  }

  const normalizedPathname = pathname.replace(/^\/+/, "");
  return `/${surface}${normalizedPathname ? `/${normalizedPathname}` : ""}`;
}
