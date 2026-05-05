"use client";
import { useMutation } from "convex/react";
import { usePreloadedQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Preloaded } from "convex/react";
import { Button } from "@/components/ui/button";
import React, { useEffect, useState } from "react";
import { toast } from "sonner";

interface RedeemClientPageProps {
  code: string;
  redemptionPreload: Preloaded<typeof api.redemptions.validate>;
}

export default function RedeemClientPage({
  code,
  redemptionPreload,
}: RedeemClientPageProps) {
  const normalizedCode = code.toUpperCase();
  const status = usePreloadedQuery(redemptionPreload);
  const redeem = useMutation(api.redemptions.redeem);
  const unredeem = useMutation(api.redemptions.unredeem);
  const doorApproved = true;
  const [autoDone, setAutoDone] = useState(false);

  useEffect(() => {
    const go = async () => {
      if (!autoDone && doorApproved && status?.status === "valid") {
        try {
          await redeem({ code: normalizedCode });
          toast.success("Redeemed");
        } catch (_) {}
        setAutoDone(true);
      }
    };
    go();
  }, [doorApproved, status?.status, normalizedCode, autoDone, redeem]);

  return (
    <main className="max-w-3xl mx-auto p-6 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">Redemption</h1>
        <p className="text-sm text-foreground/70">Code: {code}</p>
      </header>
      <section className="space-y-3">
        <div className="rounded border border-foreground/10 p-4 text-sm space-y-2">
          <div>Status: {status ? status.status : "—"} {doorApproved ? "(door)" : ""}</div>
          {status && (status.status === "valid" || status.status === "redeemed") && (
            <div>
              <div>Name: {status.name ?? "(unknown)"}</div>
              <div>List: {status.listKey}</div>
            </div>
          )}
          <div className="flex gap-2">
            <Button
              disabled={!status || status.status !== "valid"}
              onClick={async () => {
                await redeem({ code: normalizedCode });
                toast.success("Redeemed");
              }}
            >
              Redeem
            </Button>
            <Button
              variant="outline"
              disabled={!status || status.status !== "redeemed"}
              onClick={async () => {
                await unredeem({ code: normalizedCode });
                toast("Un-redeemed");
              }}
            >
              Un-redeem
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}

