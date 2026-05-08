import type { ReactNode } from "react";

interface WorkspacePreviewCardProps {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}

export function WorkspacePreviewCard({
  eyebrow,
  title,
  description,
  actions,
}: WorkspacePreviewCardProps) {
  return (
    <section className="rounded-lg border border-border/60 bg-background/80 p-5 shadow-sm">
      <div className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          {eyebrow}
        </div>
        <div className="text-lg font-semibold text-foreground">{title}</div>
        <p className="text-sm leading-6 text-muted-foreground">{description}</p>
      </div>
      {actions ? <div className="mt-4 flex flex-wrap gap-3">{actions}</div> : null}
    </section>
  );
}
