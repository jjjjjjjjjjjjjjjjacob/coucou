"use client";
import { SignOutButton, useAuth, useUser } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { siteConfiguration } from "@/lib/site";
import { buildSignInPath } from "@coucou/sdk/routes";
import {
  ChlorineRippleMark,
  HamburgerMenuItem,
  HamburgerMenuSection,
  HeaderHamburgerMenu,
  TenantMasthead,
} from "@coucou/ui/tenant-template";

const workspaceSlug = "club-chlorine";
const workspaceOrganizationId =
  process.env.NEXT_PUBLIC_CLUB_CHLORINE_CLERK_ORGANIZATION_ID ?? "";
const coucouBaseUrl = (
  process.env.NEXT_PUBLIC_COUCOU_BASE_URL ?? "http://localhost:5680"
).replace(/\/+$/, "");

function buildCoucouWorkspaceHref(surface: "host" | "door") {
  return `${coucouBaseUrl}/workspaces/${workspaceSlug}/${surface}`;
}

function useRoleFlags() {
  const { isSignedIn, user } = useUser();
  const workspaceMembership = user?.organizationMemberships?.find(
    (membership) =>
      workspaceOrganizationId.length > 0 &&
      membership.organization.id === workspaceOrganizationId,
  );
  const workspaceRole = workspaceMembership?.role;
  const isHost =
    isSignedIn &&
    (workspaceRole === "org:admin" || workspaceRole === "org:host");
  const isDoor =
    isSignedIn &&
    (workspaceRole === "org:admin" || workspaceRole === "org:door");
  return { isHost, isDoor };
}

/**
 * Club Chlorine uses the chlorine preset (pool-blue on black). The shared
 * `<TenantMasthead>` supplies the bar layout; we pass the composed
 * `<ChlorineMark>` as the `logoSlot` so the bar shows the actual swimmer
 * wordmark instead of plain text. The hamburger menu rides in the right
 * slot for the same reason as the legacy maison config — the slide-in
 * panel plays nicely with the Clerk loading window.
 */
export default function HeaderClient() {
  const { isLoaded, isSignedIn } = useAuth();
  const { isHost, isDoor } = useRoleFlags();
  const pathname = usePathname();
  const signInPath = buildSignInPath(
    pathname ?? siteConfiguration.auth.signInRedirectPath,
  );
  const hostHref = buildCoucouWorkspaceHref("host");
  const doorHref = buildCoucouWorkspaceHref("door");

  // Always render at least one item so the menu is never empty during
  // Clerk's loading window. Compose based on the resolved auth state.
  const menu = (
    <HeaderHamburgerMenu brandName={siteConfiguration.brandName}>
      <HamburgerMenuItem href="/">Home</HamburgerMenuItem>
      {isLoaded && isSignedIn ? (
        <>
          {isHost ? (
            <HamburgerMenuItem href={hostHref}>
              {siteConfiguration.shortName} Admin
            </HamburgerMenuItem>
          ) : null}
          {isDoor ? (
            <HamburgerMenuItem href={doorHref}>Door Portal</HamburgerMenuItem>
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
  );

  return (
    <TenantMasthead
      preset={siteConfiguration.preset}
      brandName={siteConfiguration.brandName}
      logoSlot={<ChlorineRippleMark size={120} fg="var(--tt-fg)" />}
      rightSlot={menu}
    />
  );
}
