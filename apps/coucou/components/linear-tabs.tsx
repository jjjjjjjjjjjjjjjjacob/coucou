"use client";

import * as React from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

function LinearTabs(props: React.ComponentProps<typeof Tabs>) {
  return <Tabs {...props} />;
}

interface LinearTabsListProps extends React.ComponentProps<typeof TabsList> {}

function LinearTabsList({ className, ...props }: LinearTabsListProps) {
  return (
    <TabsList
      className={cn(
        "w-full justify-start gap-0 border-b border-[var(--border-subtle)] bg-transparent p-0",
        className,
      )}
      {...props}
    />
  );
}

interface LinearTabsTriggerProps extends React.ComponentProps<typeof TabsTrigger> {}

function LinearTabsTrigger({ className, children, ...props }: LinearTabsTriggerProps) {
  return (
    <TabsTrigger
      className={cn(
        "relative flex-none gap-1.5 rounded-md border-b-2 border-transparent px-3 py-2.5 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] data-[state=active]:border-[var(--text-primary)] data-[state=active]:text-[var(--text-primary)] data-[state=active]:shadow-none",
        className,
      )}
      {...props}
    >
      {children}
    </TabsTrigger>
  );
}

export type { LinearTabsListProps, LinearTabsTriggerProps };
export { LinearTabs, LinearTabsList, LinearTabsTrigger, TabsContent };
