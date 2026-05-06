import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";

interface CoucouLogoMarkProps {
  className?: string;
  decorative?: boolean;
  label?: string;
  size?: number;
  style?: CSSProperties;
}

export function CoucouLogoMark({
  className,
  decorative = true,
  label = "Coucou logo",
  size = 32,
  style,
}: CoucouLogoMarkProps) {
  const accessibilityProps = decorative
    ? { "aria-hidden": true }
    : { "aria-label": label, role: "img" };

  return (
    <span
      {...accessibilityProps}
      className={cn("inline-block flex-shrink-0", className)}
      style={{
        width: size,
        height: size,
        backgroundColor: "currentColor",
        maskImage: "url('/brand/coucou.svg')",
        maskPosition: "center",
        maskRepeat: "no-repeat",
        maskSize: "contain",
        WebkitMaskImage: "url('/brand/coucou.svg')",
        WebkitMaskPosition: "center",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskSize: "contain",
        ...style,
      }}
    />
  );
}

interface CoucouLogoWordmarkProps {
  className?: string;
  markSize?: number;
}

export function CoucouLogoWordmark({
  className,
  markSize = 18,
}: CoucouLogoWordmarkProps) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <CoucouLogoMark size={markSize} />
      <span>Coucou</span>
    </span>
  );
}
