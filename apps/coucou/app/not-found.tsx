import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="text-center space-y-6 max-w-md">
        <div className="space-y-2">
          <h1 className="text-6xl font-bold text-foreground/60">404</h1>
          <h2 className="text-2xl font-semibold">Page Not Found</h2>
          <p className="text-foreground/70">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>
        </div>

        <div className="space-y-3">
          <Button asChild className="w-full">
            <Link href="/">
              Go Home
            </Link>
          </Button>

          <Button variant="outline" asChild className="w-full">
            <Link href="javascript:history.back()">
              Go Back
            </Link>
          </Button>
        </div>
      </div>
    </div>
  );
}