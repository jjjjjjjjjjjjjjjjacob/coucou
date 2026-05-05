import type { Metadata } from "next";
import { Geist, Geist_Mono, Noto_Emoji } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import Providers from "./providers";
import { AppChrome } from "./app-chrome";
import { RedirectAdminsToCoucou } from "@/components/redirect-admins-to-coucou";
import { siteConfiguration } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const notoEmoji = Noto_Emoji({
  variable: "--font-noto-emoji",
  subsets: ["emoji"],
  display: "swap",
});

export const metadata: Metadata = {
  title: siteConfiguration.brandName,
  description: siteConfiguration.description,
  metadataBase: new URL(siteConfiguration.domain),
  openGraph: {
    title: siteConfiguration.brandName,
    description: siteConfiguration.description,
    url: siteConfiguration.domain,
    siteName: siteConfiguration.brandName,
    images: [
      {
        url: "/og-image.png", // You can replace this with actual image path
        width: 1200,
        height: 630,
        alt: siteConfiguration.brandName,
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfiguration.brandName,
    description: siteConfiguration.description,
    images: ["/og-image.png"],
  },
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192x192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
    shortcut: "/favicon.png",
  },
  manifest: "/manifest.json",
};

// Satellite-mode toggle. When NEXT_PUBLIC_CLERK_DOMAIN is set in production
// (e.g. "dojopomodoro.club"), this app delegates auth to the primary Clerk
// instance running at NEXT_PUBLIC_CLERK_PRIMARY_SIGN_IN_URL (Coucou).
// In local dev (no env vars set) the app uses Clerk in standalone mode.
const clerkSatelliteDomain = process.env.NEXT_PUBLIC_CLERK_DOMAIN;
const clerkPrimarySignInUrl =
  process.env.NEXT_PUBLIC_CLERK_PRIMARY_SIGN_IN_URL;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const inner = (
    <Providers>
      <RedirectAdminsToCoucou />
      <AppChrome>{children}</AppChrome>
    </Providers>
  );

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${notoEmoji.variable} antialiased flex flex-col min-h-screen`}
      >
        {clerkSatelliteDomain ? (
          <ClerkProvider
            isSatellite
            domain={clerkSatelliteDomain}
            signInUrl={clerkPrimarySignInUrl}
          >
            {inner}
          </ClerkProvider>
        ) : (
          <ClerkProvider>{inner}</ClerkProvider>
        )}
      </body>
    </html>
  );
}
