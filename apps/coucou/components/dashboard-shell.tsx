"use client";

import { useUser } from "@clerk/nextjs";
import { AdminShell } from "@coucou/ui/admin";
import { type ReactNode, useEffect } from "react";
import { CoucouLogoWordmark } from "@/components/coucou-logo";
import { DashboardSidebar } from "@/components/dashboard-sidebar";

interface DashboardShellProps {
  children: ReactNode;
}

function useMaisonBodyClass() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.body.classList.add("maison-app-surface");
    return () => {
      document.body.classList.remove("maison-app-surface");
    };
  }, []);
}

export function DashboardShell({ children }: DashboardShellProps) {
  useMaisonBodyClass();

  const { user } = useUser();
  const operatorEmail =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    "operator";

  return (
    <AdminShell
      brand={<CoucouLogoWordmark markSize={20} />}
      sidebar={<DashboardSidebar />}
      sidebarFooter={<>{operatorEmail} · dashboard</>}
    >
      {children}
    </AdminShell>
  );
}
