"use client";
import { SignOutButton, useAuth } from "@clerk/nextjs";
import { useConvexAuth, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { siteConfiguration } from "@/lib/site";
import { buildSignInPath } from "@coucou/sdk/routes";
import {
  buildRoleAwareDashboardPath,
  hasWorkspaceReadAccess,
} from "@/lib/workspace-roles";
import {
  HamburgerMenuItem,
  HamburgerMenuSection,
  HeaderHamburgerMenu,
  TenantMasthead,
} from "@coucou/ui/tenant-template";

interface WorkspaceMenuLink {
  href: string;
  label: string;
}

function useHeaderNavigationAccess(): {
  workspaceMenuLinks: WorkspaceMenuLink[];
  hasCoucouMembership: boolean;
} {
  const { isSignedIn } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const workspaceNavigationAccess = useQuery(
    api.workspaces.listAccessibleWorkspaceNavigationForUser,
    !isSignedIn || !isAuthenticated ? "skip" : {},
  );
  const tenantWorkspaces = Array.isArray(
    workspaceNavigationAccess?.tenantWorkspaces,
  )
    ? workspaceNavigationAccess.tenantWorkspaces
    : [];
  const workspaceMenuLinks = tenantWorkspaces.flatMap((workspace) => {
    if (!hasWorkspaceReadAccess(workspace.membershipRole)) return [];
    return [
      {
        href: buildRoleAwareDashboardPath(
          workspace.slug,
          workspace.membershipRole,
        ),
        label: `${workspace.name} Dashboard`,
      },
    ];
  });

  return {
    workspaceMenuLinks,
    hasCoucouMembership: Boolean(
      workspaceNavigationAccess?.hasCoucouOrganizationAccess,
    ),
  };
}

/**
 * Coucou is the platform itself. Marketing/platform chrome: brand wordmark
 * left, "Inquire" mailto link middle-right, animated hamburger menu far
 * right. No tagline. The hamburger panel is themed via the coucou preset
 * tokens and always shows at least the home + sign-in links so the menu is
 * never empty during Clerk's loading window.
 */
interface HeaderClientProps {
  sticky?: boolean;
}

export default function HeaderClient({ sticky = false }: HeaderClientProps = {}) {
  const { isLoaded, isSignedIn } = useAuth();
  const { workspaceMenuLinks, hasCoucouMembership } =
    useHeaderNavigationAccess();
  const pathname = usePathname();
  const signInPath = buildSignInPath(
    pathname ?? siteConfiguration.auth.signInRedirectPath,
  );

  const rightSlot = (
    <>
      <Link
        href="mailto:hello@coucou.house"
        className="text-[13px] inline-flex items-center transition-opacity hover:opacity-80"
        style={{ color: "var(--tt-fg)", height: 32, lineHeight: 1 }}
      >
        Inquire
      </Link>
      <HeaderHamburgerMenu brandName={siteConfiguration.brandName}>
        <HamburgerMenuItem href="/">Home</HamburgerMenuItem>
        <HamburgerMenuItem href="mailto:hello@coucou.house">
          Inquire
        </HamburgerMenuItem>
        {isLoaded && isSignedIn ? (
          <>
            <HamburgerMenuItem href="/dashboard">Dashboard</HamburgerMenuItem>
            {hasCoucouMembership ? (
              <HamburgerMenuItem href="/admin">
                {siteConfiguration.shortName} Admin
              </HamburgerMenuItem>
            ) : null}
            {workspaceMenuLinks.length > 0 ? (
              <HamburgerMenuSection label="Organization access">
                {workspaceMenuLinks.map((workspaceMenuLink) => (
                  <HamburgerMenuItem
                    key={workspaceMenuLink.href}
                    href={workspaceMenuLink.href}
                  >
                    {workspaceMenuLink.label}
                  </HamburgerMenuItem>
                ))}
              </HamburgerMenuSection>
            ) : null}
            <HamburgerMenuSection label="Account">
              <HamburgerMenuItem href="/profile">Profile</HamburgerMenuItem>
              <HamburgerMenuItem href="/account">
                Account settings
              </HamburgerMenuItem>
              <SignOutButton>
                <HamburgerMenuItem dim>Sign out</HamburgerMenuItem>
              </SignOutButton>
            </HamburgerMenuSection>
          </>
        ) : (
          <HamburgerMenuItem href={signInPath}>Sign in</HamburgerMenuItem>
        )}
      </HeaderHamburgerMenu>
    </>
  );

  return (
    <TenantMasthead
      preset={siteConfiguration.preset}
      brandName={siteConfiguration.brandName}
      tagline=""
      rightSlot={rightSlot}
      sticky={sticky}
    />
  );
}
