"use client";

import { type ReactNode, useEffect, useState } from "react";

export interface RsvpReconciliationBoundaryProps {
  active: boolean;
  authentication: "loading" | "signedOut" | "signedIn";
  identityKey: string;
  reconcile: () => Promise<unknown>;
  switchAccount: () => Promise<unknown>;
  children: ReactNode;
}

/** Mount guest pages only after verified-phone recovery and query refresh finish. */
export function RsvpReconciliationBoundary({
  active,
  authentication,
  identityKey,
  reconcile,
  switchAccount,
  children,
}: RsvpReconciliationBoundaryProps) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string; attempt: number; error?: string } | null>(
    null,
  );

  useEffect(() => {
    if (!active || authentication !== "signedIn") {
      setResult(null);
      return;
    }
    let cancelled = false;
    void reconcile().then(
      () => {
        if (!cancelled) setResult({ key: identityKey, attempt });
      },
      (error: unknown) => {
        if (!cancelled)
          setResult({
            key: identityKey,
            attempt,
            error:
              error instanceof Error
                ? error.message
                : "We couldn't load your RSVPs. Please try again.",
          });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [active, authentication, identityKey, attempt, reconcile]);

  if (!active || authentication === "signedOut") return children;
  const currentResult = result?.key === identityKey && result.attempt === attempt ? result : null;
  if (authentication === "loading" || !currentResult) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p role="status">Loading your RSVPs…</p>
      </main>
    );
  }
  if (currentResult.error) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="space-y-4 text-center">
          <p role="alert">{currentResult.error}</p>
          <button
            type="button"
            className="rounded-md border px-4 py-2"
            onClick={() => setAttempt((previous) => previous + 1)}
          >
            Try again
          </button>
          <button
            type="button"
            className="block w-full underline"
            onClick={() => void switchAccount()}
          >
            Switch accounts
          </button>
          <a href="/" className="block underline">
            Browse events
          </a>
        </div>
      </main>
    );
  }
  return children;
}
