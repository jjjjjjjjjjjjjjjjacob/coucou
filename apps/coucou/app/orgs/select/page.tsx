"use client";
import { useRouter } from "next/navigation";
import { useOrganizationList } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";
import { siteConfiguration } from "@/lib/site";
import { getCoucouOrganizationSlug } from "@/lib/workspace-config";
import { buildRoleAwareDashboardPath } from "@/lib/workspace-roles";

export default function SelectOrgPage() {
  const router = useRouter();
  const { userMemberships, setActive } = useOrganizationList({
    userMemberships: { infinite: true },
  });
  const memberships = userMemberships?.data ?? [];

  return (
    <main className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-xl font-semibold">Select Workspace</h1>
      <p className="text-sm text-foreground/70">
        Pick the active organization for {siteConfiguration.brandName}, or use
        the dashboard for a full view of your tenant access.
      </p>
      <Button asChild variant="outline" size="sm">
        <a href="/dashboard">Open dashboard</a>
      </Button>
      {userMemberships === undefined ? (
        <div className="text-sm text-foreground/70">Loading organizations…</div>
      ) : memberships.length === 0 ? (
        <div className="text-sm">No organizations found for your account.</div>
      ) : (
        <div className="space-y-2">
          {memberships.map((m) => (
            <div key={m.id} className="flex items-center justify-between border rounded p-3">
              <div>
                <div className="font-medium">{m.organization.name}</div>
                <div className="text-xs text-foreground/70">Role: {m.role}</div>
              </div>
              <Button
                size="sm"
                onClick={() => {
                  const organizationSlug = m.organization.slug ?? "";
                  const destination =
                    organizationSlug &&
                      organizationSlug !== getCoucouOrganizationSlug()
                      ? buildRoleAwareDashboardPath(organizationSlug, m.role)
                      : "/dashboard";
                  router.replace(destination);
                  void setActive?.({ organization: m.organization.id }).catch(
                    () => undefined,
                  );
                }}
              >
                Activate
              </Button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
