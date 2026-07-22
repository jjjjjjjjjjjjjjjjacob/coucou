"use client";

import { api } from "@convex/_generated/api";
import { useQuery } from "convex/react";
import {
  Building2,
  CreditCard,
  Flag,
  Gauge,
  Inbox,
  Radio,
  ScrollText,
  Smartphone,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType } from "react";
import { LinearSidebarFooter } from "@/components/linear-sidebar-footer";
import { SidebarTenantSwitcher } from "@/components/sidebar-tenant-switcher";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";

interface AdminSidebarItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  countKey?: "pending" | "flags";
}

interface AdminSidebarGroup {
  label: string;
  items: AdminSidebarItem[];
}

const SIDEBAR_GROUPS: AdminSidebarGroup[] = [
  {
    label: "oversight",
    items: [
      { href: "/admin", label: "Tenancies", icon: Building2 },
      { href: "/admin/pending", label: "Pending", icon: Inbox, countKey: "pending" },
      { href: "/admin/flags", label: "Flags", icon: Flag, countKey: "flags" },
      { href: "/admin/billing", label: "Billing", icon: CreditCard },
    ],
  },
  {
    label: "system",
    items: [
      { href: "/admin/delivery", label: "Delivery", icon: Radio },
      { href: "/admin/senders", label: "Senders", icon: Smartphone },
      { href: "/admin/limits", label: "Limits", icon: Gauge },
    ],
  },
  {
    label: "internal",
    items: [
      { href: "/admin/staff", label: "Staff", icon: Users },
      { href: "/admin/audit", label: "Audit", icon: ScrollText },
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
    <Sidebar collapsible="icon">
      <SidebarHeader className="md:pt-3">
        <SidebarTenantSwitcher />
      </SidebarHeader>

      <SidebarContent>
        {SIDEBAR_GROUPS.map((group) => (
          <SidebarGroup key={group.label} className="py-2">
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const count = item.countKey ? counts[item.countKey] : undefined;
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive(pathname, item.href)}
                        tooltip={item.label}
                      >
                        <Link href={item.href}>
                          <item.icon className="h-4 w-4" />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                      {count !== undefined && count > 0 ? (
                        <SidebarMenuBadge>{count}</SidebarMenuBadge>
                      ) : null}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <LinearSidebarFooter />

      <SidebarRail />
    </Sidebar>
  );
}
