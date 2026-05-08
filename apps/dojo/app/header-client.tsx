"use client";
import { SignedIn, SignedOut, SignOutButton, useUser } from "@clerk/nextjs";
import { buildSatelliteReturnUrl, buildTenantPrimarySignInUrl, getSiteOrigin } from "@coucou/sdk";
import { Cog, DoorOpen, LogIn, LogOut, Settings, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import DojoPomodoreIcon from "@/components/icons/dojo-pomodoro-icon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { siteConfiguration } from "@/lib/site";

const workspaceSlug = siteConfiguration.workspaceSlug;
const workspaceOrganizationId = process.env.NEXT_PUBLIC_DOJO_CLERK_ORGANIZATION_ID ?? "";
const coucouBaseUrl = (process.env.NEXT_PUBLIC_COUCOU_BASE_URL ?? "http://localhost:5680").replace(
  /\/+$/,
  "",
);

function buildCoucouWorkspaceHref(surface: "host" | "door") {
  return `${coucouBaseUrl}/workspaces/${workspaceSlug}/${surface}`;
}

function buildPrimarySignInHref(redirectPath: string): string {
  const satelliteReturnUrl = buildSatelliteReturnUrl(
    getSiteOrigin(siteConfiguration),
    redirectPath,
  );
  return buildTenantPrimarySignInUrl({
    primaryBaseUrl: coucouBaseUrl,
    siteConfiguration,
    redirectUrl: satelliteReturnUrl,
  });
}

function useRoleFlags() {
  const { isSignedIn, user } = useUser();
  const workspaceMembership = user?.organizationMemberships?.find(
    (membership) =>
      workspaceOrganizationId.length > 0 && membership.organization.id === workspaceOrganizationId,
  );
  const workspaceRole = workspaceMembership?.role;
  const isHost = isSignedIn && (workspaceRole === "org:admin" || workspaceRole === "org:host");
  const isDoor = isSignedIn && (workspaceRole === "org:admin" || workspaceRole === "org:door");
  return { isHost, isDoor };
}

export default function HeaderClient() {
  const { isHost, isDoor } = useRoleFlags();
  const pathname = usePathname();
  const signInHref = buildPrimarySignInHref(pathname ?? siteConfiguration.auth.signInRedirectPath);
  const hostHref = buildCoucouWorkspaceHref("host");
  const doorHref = buildCoucouWorkspaceHref("door");

  return (
    <header className="fixed top-0 z-50 w-full flex items-center justify-end gap-2 px-2 py-2 sm:px-3 sm:py-3 pointer-events-none">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="lg"
            className="text-primary border-primary/30 aspect-square p-1 animate-in fade-in duration-600 pointer-events-auto"
          >
            <DojoPomodoreIcon size={32} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <SignedIn>
            {isHost && (
              <DropdownMenuItem asChild>
                <Link href={hostHref} className="flex items-center gap-2">
                  <Settings size={16} />
                  {siteConfiguration.shortName} Admin
                </Link>
              </DropdownMenuItem>
            )}
            {isDoor && (
              <DropdownMenuItem asChild>
                <Link href={doorHref} className="flex items-center gap-2">
                  <DoorOpen size={16} />
                  Door Portal
                </Link>
              </DropdownMenuItem>
            )}
            {(isHost || isDoor) && <DropdownMenuSeparator />}
            <DropdownMenuItem asChild>
              <Link href="/profile" className="flex items-center gap-2">
                <User size={16} />
                Profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href="/account" className="flex items-center gap-2">
                <Cog size={16} />
                Account Settings
              </Link>
            </DropdownMenuItem>
            {/* TODO: Uncomment when tickets page is implemented
            <DropdownMenuItem asChild>
              <Link href="/tickets" className="flex items-center gap-2">
                <Ticket size={16} />
                My Tickets
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            */}
            <SignOutButton>
              <DropdownMenuItem className="flex items-center gap-2 text-primary! hover:text-primary!">
                <LogOut size={16} className="text-primary" />
                Sign Out
              </DropdownMenuItem>
            </SignOutButton>
          </SignedIn>
          <SignedOut>
            <DropdownMenuItem asChild>
              <Link
                href={signInHref}
                className="flex items-center gap-2 text-primary! hover:text-primary!"
              >
                <LogIn size={16} className="text-primary" />
                Sign In
              </Link>
            </DropdownMenuItem>
          </SignedOut>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
