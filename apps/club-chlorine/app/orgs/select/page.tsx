"use client";
import { useRouter } from "next/navigation";
import { useOrganizationList } from "@clerk/nextjs";
import { Button } from "@/components/ui/button";

export default function SelectOrgPage() {
  const router = useRouter();
  const { userMemberships, setActive } = useOrganizationList({ userMemberships: { infinite: true } });
  const memberships = userMemberships?.data ?? [];

  return (
    <main className="max-w-xl mx-auto p-6 space-y-4">
      <h1 className="text-xl font-semibold">Select Organization</h1>
      <p className="text-sm text-foreground/70">
        Pick an existing organization to continue. If you don’t see yours,
        ask an admin to invite you to it. Organization creation is disabled.
      </p>
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
                onClick={async () => {
                  await setActive?.({ organization: m.organization.id });
                  router.replace("/");
                }}
              >
                Use this org
              </Button>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}

