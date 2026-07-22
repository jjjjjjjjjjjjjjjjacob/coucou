"use client";
import { SignedIn, SignedOut, SignOutButton, useUser } from "@clerk/nextjs";
import { buildSatelliteReturnUrl, buildTenantPrimarySignInUrl } from "@coucou/sdk";
import { Cog, DoorOpen, LogIn, LogOut, Menu, Settings, User } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { siteConfiguration } from "@/lib/site";

const workspaceSlug = "danza-organica";
const workspaceOrganizationId = process.env.NEXT_PUBLIC_DANZA_ORGANICA_CLERK_ORGANIZATION_ID ?? "";
const coucouBaseUrl = (process.env.NEXT_PUBLIC_COUCOU_BASE_URL ?? "http://localhost:5680").replace(
  /\/+$/,
  "",
);

function buildCoucouWorkspaceHref(surface: "host" | "door") {
  return `${coucouBaseUrl}/workspaces/${workspaceSlug}/${surface}`;
}

function buildPrimarySignInHref(satelliteOrigin: string, redirectPath: string): string {
  const satelliteReturnUrl = buildSatelliteReturnUrl(satelliteOrigin, redirectPath);
  return buildTenantPrimarySignInUrl({
    primaryBaseUrl: coucouBaseUrl,
    siteConfiguration,
    redirectUrl: satelliteReturnUrl,
  });
}

const fallbackSatelliteOrigin = new URL(siteConfiguration.domain).origin;

interface HeaderClientProps {
  initialSatelliteOrigin?: string;
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

export default function HeaderClient({ initialSatelliteOrigin }: HeaderClientProps) {
  const { isHost, isDoor } = useRoleFlags();
  const pathname = usePathname();
  const [satelliteOrigin, setSatelliteOrigin] = useState<string>(
    initialSatelliteOrigin ?? fallbackSatelliteOrigin,
  );
  useEffect(() => {
    if (typeof window === "undefined") return;
    setSatelliteOrigin((currentSatelliteOrigin) => {
      return currentSatelliteOrigin === window.location.origin
        ? currentSatelliteOrigin
        : window.location.origin;
    });
  }, []);
  const signInHref = buildPrimarySignInHref(
    satelliteOrigin,
    pathname ?? siteConfiguration.auth.signInRedirectPath,
  );
  const hostHref = buildCoucouWorkspaceHref("host");
  const doorHref = buildCoucouWorkspaceHref("door");

  return (
    <header className="fixed top-0 z-50 w-full flex items-center justify-end gap-2 px-2 py-2 sm:px-3 sm:py-3 pointer-events-none">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="aspect-square animate-in fade-in duration-600 pointer-events-auto"
            aria-label={`${siteConfiguration.brandName} menu`}
          >
            <Menu className="h-5 w-5" />
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
            <SignOutButton>
              <DropdownMenuItem className="flex items-center gap-2">
                <LogOut size={16} />
                Sign Out
              </DropdownMenuItem>
            </SignOutButton>
          </SignedIn>
          <SignedOut>
            <DropdownMenuItem asChild>
              <Link href={signInHref} className="flex items-center gap-2">
                <LogIn size={16} />
                Sign In
              </Link>
            </DropdownMenuItem>
          </SignedOut>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
