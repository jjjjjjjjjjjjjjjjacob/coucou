import dynamic from "next/dynamic";
import Image from "next/image";
import type { ComponentType, CSSProperties } from "react";
import { cn } from "@/lib/utils";
import type { DanzaOrganicaIconProps } from "./danza-organica-icon.client";
import { ICON_GLOW_FILTER } from "./danza-organica-icon.client";

const DanzaOrganicaIconClient = dynamic(() => import("./danza-organica-icon.client"), {
  loading: ({ size = 24, className = "", style }: DanzaOrganicaIconProps) => {
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
        alt="Danza Organica Icon"
        className={cn("will-change-transform", className)}
        style={glowStyle}
      />
    );
  },
}) as ComponentType<DanzaOrganicaIconProps>;

export default function DanzaOrganicaIcon(props: DanzaOrganicaIconProps) {
  return <DanzaOrganicaIconClient {...props} />;
}
