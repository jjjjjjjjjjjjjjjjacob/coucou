"use client";

import { useEffect, type ReactNode } from "react";
import { useUser } from "@clerk/nextjs";
import { AdminShell } from "@coucou/ui/admin";
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
      sidebar={<DashboardSidebar />}
      sidebarFooter={<>{operatorEmail} · dashboard</>}
    >
      {children}
    </AdminShell>
  );
}
