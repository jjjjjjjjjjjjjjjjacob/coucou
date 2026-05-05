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

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-destructive">Oops!</h1>
          <h2 className="text-2xl font-semibold">Something went wrong</h2>
          <p className="text-foreground/70">
            We encountered an unexpected error. Please try again or contact support if the problem persists.
          </p>

          {process.env.NODE_ENV === "development" && (
            <details className="mt-4 text-left">
              <summary className="cursor-pointer text-sm text-foreground/60 hover:text-foreground">
                Error Details (Development Only)
              </summary>
              <pre className="mt-2 text-xs bg-muted p-3 rounded overflow-auto">
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

        <div className="space-y-3">
          <Button onClick={reset} className="w-full">
            Try Again
          </Button>

          <Button
            variant="outline"
            onClick={() => window.location.href = "/"}
            className="w-full"
          >
            Go Home
          </Button>
        </div>
      </div>
    </div>
  );
}