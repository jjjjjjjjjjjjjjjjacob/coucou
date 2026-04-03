"use client";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignOutButton,
  useUser,
} from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import Link from "next/link";
import DojoPomodoreIcon from "@/components/icons/dojo-pomodoro-icon";
import { LogOut, LogIn, Settings, DoorOpen, User, Cog } from "lucide-react";

function useRoleFlags() {
  const { isSignedIn, user } = useUser();
  const orgRoleSet = new Set(
    user?.organizationMemberships?.map((membership) => membership.role) || [],
  );
  const isHost = isSignedIn && orgRoleSet.has("org:admin" as const);
  const isDoor =
    isSignedIn &&
    (orgRoleSet.has("org:admin" as const) ||
      orgRoleSet.has("org:member" as const));
  return { isHost, isDoor };
}

export default function HeaderClient() {
  const { isHost, isDoor } = useRoleFlags();

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
                <Link href="/host" className="flex items-center gap-2">
                  <Settings size={16} />
                  Host Dashboard
                </Link>
              </DropdownMenuItem>
            )}
            {isDoor && (
              <DropdownMenuItem asChild>
                <Link href="/door" className="flex items-center gap-2">
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
            <SignInButton>
              <DropdownMenuItem className="flex items-center gap-2 text-primary! hover:text-primary!">
                <LogIn size={16} className="text-primary" />
                Sign In
              </DropdownMenuItem>
            </SignInButton>
          </SignedOut>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
