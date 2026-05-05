"use client";

import Image from "next/image";
import React from "react";
import type { CSSProperties } from "react";
import { useEventBranding } from "@/contexts/event-branding-context";
import { cn } from "@/lib/utils";
import { DynamicOptionsLoadingProps } from "next/dynamic";

export interface DojoPomodoreIconProps extends DynamicOptionsLoadingProps {
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export const ICON_GLOW_FILTER =
  "drop-shadow(0 0 6px rgba(0,0,0,0.45)) drop-shadow(0 0 18px rgba(0,0,0,0.3))";

export default function DojoPomodoreIconClient({
  size = 24,
  className = "",
  style,
}: DojoPomodoreIconProps) {
  const { branding } = useEventBranding();
  const iconSource = branding?.iconUrl ?? "/icon-144x144.png";
  const mergedClassName = cn(
    "will-change-transform",
    className,
  );
  const composedFilter =
    style?.filter && style.filter.length > 0
      ? `${ICON_GLOW_FILTER} ${style.filter}`
      : ICON_GLOW_FILTER;
  const glowStyle: CSSProperties = {
    ...style,
    filter: composedFilter,
  };

  return (
    <Image
      src={iconSource}
      width={size}
      height={size}
      alt="Dojo Pomodoro Icon"
      className={mergedClassName}
      style={glowStyle}
    />
  );
}
