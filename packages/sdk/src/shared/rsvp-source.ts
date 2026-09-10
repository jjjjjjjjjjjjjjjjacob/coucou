export type RsvpSource = "text" | "form" | "api" | "unknown";
export function getRsvpSourceLabel(source: RsvpSource | null | undefined): string {
  return { text: "Text", form: "Form", api: "API", unknown: "Unknown" }[source ?? "unknown"];
}
