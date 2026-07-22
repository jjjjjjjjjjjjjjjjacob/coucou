import * as React from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface PageCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
  noPadding?: boolean;
}

function PageCard({
  className,
  title,
  description,
  action,
  children,
  noPadding = false,
  ...props
}: PageCardProps) {
  return (
    <Card
      className={cn(
        "bg-[var(--surface-2)] text-[var(--text-primary)] border-[var(--border-subtle)] shadow-[var(--shadow-card)]",
        className,
      )}
      {...props}
    >
      {title || description || action ? (
        <CardHeader className="flex flex-row items-start justify-between gap-4 pb-2">
          <div className="space-y-1">
            {title ? <CardTitle className="text-base font-semibold">{title}</CardTitle> : null}
            {description ? <CardDescription>{description}</CardDescription> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </CardHeader>
      ) : null}
      <CardContent className={cn("p-4", noPadding ? "p-0" : "pt-0")}>{children}</CardContent>
    </Card>
  );
}

export { PageCard };
