import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { preloadQuery, fetchQuery } from "convex/nextjs";
import { api } from "@convex/_generated/api";
import { siteConfiguration } from "@/lib/site";
import RedeemClientPage from "./redeem-client";

export default async function RedeemServerPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const resolvedParams = await Promise.resolve(params);
  const { code } = resolvedParams;
  const normalizedCode = code.toUpperCase();

  // Check authentication and role on server side
  const authObject = await auth();
  const orgRole = authObject?.orgRole;
  const hasFunction = authObject?.has;

  // Check if user has door/host role
  const isDoorStaff =
    (orgRole && ["admin", "host", "door"].includes(orgRole)) ||
    (typeof hasFunction === "function" &&
      (hasFunction({ role: "org:admin" }) ||
        hasFunction({ role: "org:host" }) ||
        hasFunction({ role: "org:door" })));

  // If user has door/host role, redirect to door scan page
  if (isDoorStaff) {
    redirect(`/door/scan?code=${normalizedCode}`);
  }

  // Get redemption info to determine eventId for redirect
  let eventId: string | null = null;
  try {
    const redemptionResult = await fetchQuery(api.redemptions.validate, {
      code: normalizedCode,
      siteKey: siteConfiguration.siteKey,
      workspaceSlug: siteConfiguration.workspaceSlug,
    });
    if (redemptionResult && "eventId" in redemptionResult && redemptionResult.eventId) {
      eventId = redemptionResult.eventId;
    }
  } catch (error) {
    // If query fails, continue without redirect (will show error in client)
  }

  // If user is not door/host and we have eventId, redirect to ticket page
  if (eventId) {
    redirect(`/events/${eventId}/ticket`);
  }

  // Preload query for client component
  const redemptionPreload = await preloadQuery(api.redemptions.validate, {
    code: normalizedCode,
    siteKey: siteConfiguration.siteKey,
    workspaceSlug: siteConfiguration.workspaceSlug,
  });

  // Render the client component
  return <RedeemClientPage code={code} redemptionPreload={redemptionPreload} />;
}
