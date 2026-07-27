import type { Doc } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";

export interface ApiSmsProgram {
  organizerName: string;
  consentLabel: string;
  disclosure: string;
  termsUrl: string;
  privacyUrl: string;
}

function normalizePublicOrigin(domain: string | null | undefined): string | null {
  const trimmedDomain = domain?.trim();
  if (!trimmedDomain) return null;

  try {
    const url = new URL(
      /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmedDomain) ? trimmedDomain : `https://${trimmedDomain}`,
    );
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export async function buildApiSmsProgram(
  ctx: QueryCtx,
  workspace: Doc<"workspaces">,
): Promise<ApiSmsProgram> {
  const workspaceSite = await ctx.db
    .query("workspaceSites")
    .withIndex("by_workspace", (queryBuilder) => queryBuilder.eq("workspaceId", workspace._id))
    .first();
  const publicOrigin =
    normalizePublicOrigin(workspace.primaryDomain) ??
    normalizePublicOrigin(workspaceSite?.domain) ??
    "https://coucou.events";
  const organizerName = workspace.name.trim() || workspace.slug;

  return {
    organizerName,
    consentLabel: `I agree to receive recurring SMS messages from ${organizerName}.`,
    disclosure: `${organizerName} may send account notifications, RSVP and guest-list updates, tickets or QR codes, event updates, and replies about events or reservations. Messages are delivered via Coucou. Message frequency varies. Message and data rates may apply. Reply STOP to opt out or HELP for help. Consent is not a condition of purchase, RSVP, or admission.`,
    termsUrl: `${publicOrigin}/terms`,
    privacyUrl: `${publicOrigin}/privacy`,
  };
}
