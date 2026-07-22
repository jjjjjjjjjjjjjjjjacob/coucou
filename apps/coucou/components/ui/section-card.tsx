import type * as React from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface SectionCardProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  contentClassName?: string;
}

export function SectionCard({
  title,
  description,
  action,
  footer,
  children,
  contentClassName,
  className,
  ...props
}: SectionCardProps) {
  const hasHeader = Boolean(title || description || action);

  return (
    <Card
      className={cn(
        "rounded-xl border-[var(--border-subtle)] bg-[var(--surface-1)] text-[var(--text-primary)] shadow-[var(--shadow-card)]",
        className,
      )}
      {...props}
    >
      {hasHeader ? (
        <CardHeader className="flex flex-row items-start justify-between gap-4 p-5 pb-4">
          <div className="space-y-1">
            {title ? (
              <CardTitle className="text-base font-semibold tracking-normal">{title}</CardTitle>
            ) : null}
            {description ? (
              <CardDescription className="text-pretty text-sm text-[var(--text-secondary)]">
                {description}
              </CardDescription>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </CardHeader>
      ) : null}
      <CardContent className={cn("p-5", hasHeader && "pt-0", contentClassName)}>
        {children}
      </CardContent>
      {footer ? <CardFooter className="p-5 pt-0">{footer}</CardFooter> : null}
    </Card>
  );
}

export default SectionCard;
