import Link from "next/link";
import { siteConfiguration } from "@/lib/site";
import DojoPomodoreIcon from "@/components/icons/dojo-pomodoro-icon";

export function Footer() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-6">

          {/* Logo and Brand */}
          <div className="flex items-center">
            <DojoPomodoreIcon size={24} className="mr-2" />
            <Link href="/" className="font-semibold text-primary hover:text-primary/80 transition-colors">
              {siteConfiguration.brandName}
            </Link>
          </div>

          {/* Info (Legal) - Horizontal on desktop */}
          <nav className="flex flex-col md:flex-row md:gap-6 space-y-2 md:space-y-0">
            <Link href="/terms" className="text-sm text-primary hover:text-primary/80 transition-colors">
              Terms & Conditions
            </Link>
            <Link href="/privacy" className="text-sm text-primary hover:text-primary/80 transition-colors">
              Privacy Policy
            </Link>
            <Link href="/cookies" className="text-sm text-primary hover:text-primary/80 transition-colors">
              Cookie Policy
            </Link>
            <Link href="/data" className="text-sm text-primary hover:text-primary/80 transition-colors">
              Data Collection
            </Link>
          </nav>

        </div>
      </div>
    </footer>
  );
}
