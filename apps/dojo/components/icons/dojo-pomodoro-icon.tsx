import Image from "next/image";
import dynamic from "next/dynamic";
import type { ComponentType, CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { DojoPomodoreIconProps } from "./dojo-pomodoro-icon.client";
import { ICON_GLOW_FILTER } from "./dojo-pomodoro-icon.client";

const DojoPomodoreIconClient = dynamic(
  () => import("./dojo-pomodoro-icon.client"),
  {
    loading: ({
      size = 24,
      className = "",
      style,
    }: DojoPomodoreIconProps) => {
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
          src="/icon-144x144.png"
          width={size}
          height={size}
          alt="Dojo Pomodoro Icon"
          className={cn("will-change-transform", className)}
          style={glowStyle}
        />
      );
    },
  },
) as ComponentType<DojoPomodoreIconProps>;

export default function DojoPomodoreIcon(props: DojoPomodoreIconProps) {
  return <DojoPomodoreIconClient {...props} />;
}
