import type { Metadata } from "next";
import { Bowlby_One, Geist, Geist_Mono, Noto_Emoji } from "next/font/google";
import { ClerkProvider } from "@clerk/nextjs";
import "./globals.css";
import Providers from "./providers";
import { AppChrome } from "./app-chrome";
import { RedirectAdminsToCoucou } from "@/components/redirect-admins-to-coucou";
import { clubChlorineIconPaths, siteConfiguration } from "@/lib/site";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Bowlby One is the free fallback for Adobe's Alfarn — heavy rounded display
// sans used across Club Chlorine's wordmark and event lineup type. Loading
// it via next/font/google avoids a runtime FOUT and exposes the
// `--font-bowlby-one` variable consumed by the chlorine preset's display
// stack.
const bowlbyOne = Bowlby_One({
  variable: "--font-bowlby-one",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
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
      {
        url: clubChlorineIconPaths.faviconIco,
        sizes: "any",
        type: "image/x-icon",
      },
      // Vector mark renders crisp at every size and recolours cleanly to the
      // brand blue. Browsers that don't support SVG favicons fall through to
      // the rasterised PNG fallbacks below.
      { url: clubChlorineIconPaths.svg, type: "image/svg+xml" },
      {
        url: clubChlorineIconPaths.faviconPng,
        sizes: "32x32",
        type: "image/png",
      },
      {
        url: clubChlorineIconPaths.icon192,
        sizes: "192x192",
        type: "image/png",
      },
    ],
    apple: clubChlorineIconPaths.appleTouchIcon,
    shortcut: clubChlorineIconPaths.faviconIco,
  },
  manifest: clubChlorineIconPaths.manifest,
};

// Vaul scales whatever element carries this attribute when a drawer with
// shouldScaleBackground is opened. The body acts as the dark backdrop.
const vaulDrawerWrapperAttribute = { "vaul-drawer-wrapper": "" };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const inner = (
    <Providers>
      <RedirectAdminsToCoucou />
      <div
        {...vaulDrawerWrapperAttribute}
        className="flex min-h-screen flex-col bg-background"
      >
        <AppChrome>{children}</AppChrome>
      </div>
    </Providers>
  );

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${bowlbyOne.variable} ${notoEmoji.variable} antialiased`}
      >
        <ClerkProvider>{inner}</ClerkProvider>
      </body>
    </html>
  );
}
