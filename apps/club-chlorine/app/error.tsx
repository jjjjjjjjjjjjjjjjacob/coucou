"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Application error:", error);
  }, [error]);

  // No min-h-screen — the chlorine app shell already owns the viewport
  // height, and stacking another 100vh section pushes the wordmark out
  // of view. Fit naturally inside the shell's centered content band.
  return (
    <div className="mx-auto flex w-full max-w-md flex-col items-center gap-6 py-10 text-center">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold" style={{ color: "var(--tt-fg)" }}>
          Oops!
        </h1>
        <h2 className="text-lg font-semibold" style={{ color: "var(--tt-fg)" }}>
          Something went wrong
        </h2>
        <p className="text-sm" style={{ color: "var(--tt-fg-dim)" }}>
          We encountered an unexpected error. Please try again or contact support if the problem
          persists.
        </p>

        {process.env.NODE_ENV === "development" && (
          <details className="mt-4 text-left">
            <summary className="cursor-pointer text-xs" style={{ color: "var(--tt-fg-mute)" }}>
              Error Details (Development Only)
            </summary>
            <pre
              className="mt-2 overflow-auto rounded p-3 text-xs"
              style={{
                background: "var(--tt-bg-elevated, rgba(0,0,0,0.04))",
                color: "var(--tt-fg-dim)",
              }}
            >
              {error.message}
              {error.stack && (
                <>
                  {"\n\nStack Trace:\n"}
                  {error.stack}
                </>
              )}
            </pre>
          </details>
        )}
      </div>

      <div className="flex w-full flex-col gap-3">
        <Button onClick={reset} className="w-full">
          Try Again
        </Button>

        <Button variant="outline" onClick={() => (window.location.href = "/")} className="w-full">
          Go Home
        </Button>
      </div>
    </div>
  );
}
