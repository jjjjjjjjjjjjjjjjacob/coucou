"use client";

import type { ReactNode } from "react";
import { CoucouLinearShell, useMaisonLinearBodyClass } from "@/components/coucou-linear-shell";
import { DashboardSidebar } from "@/components/dashboard-sidebar";

interface DashboardShellProps {
  children: ReactNode;
}

export function DashboardShell({ children }: DashboardShellProps) {
  useMaisonLinearBodyClass();

  return (
    <CoucouLinearShell sidebar={<DashboardSidebar />} mobileTitle="Coucou">
      {children}
    </CoucouLinearShell>
  );
}
