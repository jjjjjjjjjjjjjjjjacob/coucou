"use client";

import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { NavGroup, NavLink } from "@coucou/ui/admin";

interface AdminSidebarItem {
  href: string;
  label: string;
  countKey?: "pending" | "flags";
}

interface AdminSidebarGroup {
  label: string;
  items: AdminSidebarItem[];
}

const SIDEBAR_GROUPS: AdminSidebarGroup[] = [
  {
    label: "Oversight",
    items: [
      { href: "/admin", label: "Tenancies" },
      { href: "/admin/pending", label: "Pending", countKey: "pending" },
      { href: "/admin/flags", label: "Flags", countKey: "flags" },
      { href: "/admin/billing", label: "Billing" },
    ],
  },
  {
    label: "System",
    items: [
      { href: "/admin/delivery", label: "Delivery" },
      { href: "/admin/senders", label: "Senders" },
      { href: "/admin/limits", label: "Limits" },
    ],
  },
  {
    label: "Internal",
    items: [
      { href: "/admin/staff", label: "Staff" },
      { href: "/admin/audit", label: "Audit" },
    ],
  },
];

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === "/admin") return pathname === "/admin";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebar() {
  const pathname = usePathname();
  const pendingApplications = useQuery(api.workspaces.listPendingApplications);
  const attentionFlags = useQuery(api.workspaces.listAttentionFlags);

  const counts = {
    pending: pendingApplications?.length ?? 0,
    flags: attentionFlags?.length ?? 0,
  };

  return (
    <>
      {SIDEBAR_GROUPS.map((group) => (
        <NavGroup key={group.label} label={group.label}>
          {group.items.map((item) => {
            const count = item.countKey ? counts[item.countKey] : undefined;
            return (
              <NavLink
                key={item.href}
                href={item.href}
                active={isActive(pathname, item.href)}
                count={count && count > 0 ? count : undefined}
              >
                {item.label}
              </NavLink>
            );
          })}
        </NavGroup>
      ))}
    </>
  );
}
