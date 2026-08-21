"use client";

import { Crown, DoorOpen, type LucideIcon, Pencil, Shield, User } from "lucide-react";
import { ContextMenuContent, ContextMenuItem } from "@/components/ui/context-menu";
import { DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import type { GuestDirectoryPerson } from "@/lib/types";

export interface GuestRowActionDescriptor {
  id: string;
  label: string;
  icon: LucideIcon;
  onSelect: () => void;
}

/**
 * One source of row actions rendered through both Radix menu flavors: the
 * Actions-column DropdownMenu and the row right-click ContextMenu.
 */
export function buildGuestRowActionDescriptors({
  person,
  canManageRoles,
  onEditProfile,
  onViewDetails,
  onRoleChange,
}: {
  person: GuestDirectoryPerson;
  canManageRoles: boolean;
  onEditProfile: (person: GuestDirectoryPerson) => void;
  onViewDetails: (person: GuestDirectoryPerson) => void;
  onRoleChange: (person: GuestDirectoryPerson, newRole: string) => void;
}): GuestRowActionDescriptor[] {
  const descriptors: GuestRowActionDescriptor[] = [
    {
      id: "edit-profile",
      label: "Edit tags & notes",
      icon: Pencil,
      onSelect: () => onEditProfile(person),
    },
  ];

  if (person.detailReference) {
    descriptors.push({
      id: "view-details",
      label: "View details",
      icon: User,
      onSelect: () => onViewDetails(person),
    });
  }

  const canAssignRole =
    canManageRoles && person.detailReference && !person.detailReference.startsWith("rsvp~");
  if (canAssignRole) {
    const roleVerb = person.hasOrganizationMembership ? "Change to" : "Promote to";
    descriptors.push(
      {
        id: "role-host",
        label: `${roleVerb} Host`,
        icon: Shield,
        onSelect: () => onRoleChange(person, "host"),
      },
      {
        id: "role-door",
        label: `${roleVerb} Door`,
        icon: DoorOpen,
        onSelect: () => onRoleChange(person, "door"),
      },
      {
        id: "role-member",
        label: `${roleVerb} Member`,
        icon: User,
        onSelect: () => onRoleChange(person, "member"),
      },
      {
        id: "role-admin",
        label: `${roleVerb} Admin`,
        icon: Crown,
        onSelect: () => onRoleChange(person, "admin"),
      },
    );
  }

  return descriptors;
}

export function GuestRowActionsDropdownMenuContent({
  descriptors,
}: {
  descriptors: GuestRowActionDescriptor[];
}) {
  return (
    <DropdownMenuContent className="border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-primary)]">
      {descriptors.map((descriptor) => (
        <DropdownMenuItem
          key={descriptor.id}
          onClick={descriptor.onSelect}
          className="focus:bg-[var(--surface-3)]"
        >
          <descriptor.icon className="mr-2 h-4 w-4" />
          {descriptor.label}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
  );
}

export function GuestRowActionsContextMenuContent({
  descriptors,
}: {
  descriptors: GuestRowActionDescriptor[];
}) {
  return (
    <ContextMenuContent className="border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-primary)]">
      {descriptors.map((descriptor) => (
        <ContextMenuItem
          key={descriptor.id}
          onClick={descriptor.onSelect}
          className="focus:bg-[var(--surface-3)]"
        >
          <descriptor.icon className="mr-2 h-4 w-4" />
          {descriptor.label}
        </ContextMenuItem>
      ))}
    </ContextMenuContent>
  );
}
