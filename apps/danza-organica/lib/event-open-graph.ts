import {
  DEFAULT_OPEN_GRAPH_IMAGE_SOURCE,
  type OpenGraphImageSource,
} from "@coucou/sdk/shared/open-graph";

export const DANZA_LOGO_OPEN_GRAPH_IMAGE_URL = "/opengraph-image";

export function resolveDanzaOpenGraphImageUrl({
  source = DEFAULT_OPEN_GRAPH_IMAGE_SOURCE,
  thumbnailUrl,
}: {
  source?: OpenGraphImageSource;
  thumbnailUrl?: string | null;
}): string {
  if (source === "logo") {
    return DANZA_LOGO_OPEN_GRAPH_IMAGE_URL;
  }

  return thumbnailUrl ?? DANZA_LOGO_OPEN_GRAPH_IMAGE_URL;
}
