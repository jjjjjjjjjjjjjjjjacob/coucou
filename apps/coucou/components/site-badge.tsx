import { CoucouLogoMark } from "@/components/coucou-logo";
import { cn } from "@/lib/utils";

interface SiteBadgeProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "size-7 text-[11px]",
  md: "size-8 text-xs",
  lg: "size-12 text-sm",
} as const;

export function SiteBadge({ className, size = "md" }: SiteBadgeProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-lg border border-primary/20 bg-primary text-primary-foreground font-semibold tracking-[0.14em]",
        sizeClasses[size],
        className,
      )}
    >
      <CoucouLogoMark decorative={false} label="Coucou" size={size === "lg" ? 28 : 18} />
    </div>
  );
}
