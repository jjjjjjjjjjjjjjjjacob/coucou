export const OPEN_GRAPH_IMAGE_SOURCES = ["logo", "thumbnail"] as const;

export type OpenGraphImageSource = (typeof OPEN_GRAPH_IMAGE_SOURCES)[number];

export const DEFAULT_OPEN_GRAPH_IMAGE_SOURCE: OpenGraphImageSource = "thumbnail";
