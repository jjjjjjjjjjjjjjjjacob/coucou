import Image from "next/image";
import dynamic from "next/dynamic";
import type { ComponentType, CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { ClubChlorineIconProps } from "./club-chlorine-icon.client";
import { ICON_GLOW_FILTER } from "./club-chlorine-icon.client";

const ClubChlorineIconClient = dynamic(
  () => import("./club-chlorine-icon.client"),
  {
    loading: ({
      size = 24,
      className = "",
      style,
    }: ClubChlorineIconProps) => {
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
          alt="Club Chlorine Icon"
          className={cn("will-change-transform", className)}
          style={glowStyle}
        />
      );
    },
  },
) as ComponentType<ClubChlorineIconProps>;

export default function ClubChlorineIcon(props: ClubChlorineIconProps) {
  return <ClubChlorineIconClient {...props} />;
}
