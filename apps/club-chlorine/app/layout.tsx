import { ClerkProvider } from "@clerk/nextjs";
import { buildTenantPrimarySignInUrl } from "@coucou/sdk";
import type { Metadata } from "next";
import { Bowlby_One, Noto_Emoji } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { DevColorTweakPanel } from "@/components/dev-color-tweak-panel";
import { clubChlorineIconPaths, siteConfiguration } from "@/lib/site";
import { AppChrome } from "./app-chrome";
import Providers from "./providers";

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
const coucouBaseUrl = (process.env.NEXT_PUBLIC_COUCOU_BASE_URL ?? "http://localhost:5680").replace(
  /\/+$/,
  "",
);
const primaryTenantSignInUrl = buildTenantPrimarySignInUrl({
  primaryBaseUrl: coucouBaseUrl,
  siteConfiguration,
});
const fallbackSatelliteHost =
  process.env.NEXT_PUBLIC_CLERK_DOMAIN ?? new URL(siteConfiguration.domain).host;

function getFirstHeaderValue(headerValue: string | null): string | null {
  const firstHeaderValue = headerValue?.split(",")[0]?.trim();
  return firstHeaderValue && firstHeaderValue.length > 0 ? firstHeaderValue : null;
}

function normalizeRequestHost(headerValue: string | null): string | null {
  const requestHost = getFirstHeaderValue(headerValue);
  if (!requestHost || /[\s/\\]/.test(requestHost)) {
    return null;
  }
  return requestHost;
}

function isLocalRequestHost(requestHost: string): boolean {
  try {
    const hostname = new URL(`http://${requestHost}`).hostname;
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local")
    );
  } catch {
    return false;
  }
}

function resolveRequestProtocol(headersList: Headers, requestHost: string): "http" | "https" {
  const forwardedProtocol = getFirstHeaderValue(headersList.get("x-forwarded-proto"));
  if (forwardedProtocol === "http" || forwardedProtocol === "https") {
    return forwardedProtocol;
  }
  return isLocalRequestHost(requestHost) ? "http" : "https";
}

function resolveRequestSatelliteContext(headersList: Headers): { host: string; origin: string } {
  const requestHost =
    normalizeRequestHost(headersList.get("x-forwarded-host")) ??
    normalizeRequestHost(headersList.get("host")) ??
    fallbackSatelliteHost;
  const requestProtocol = resolveRequestProtocol(headersList, requestHost);

  return {
    host: requestHost,
    origin: `${requestProtocol}://${requestHost}`,
  };
}

export const metadata: Metadata = {
  title: siteConfiguration.brandName,
  description: siteConfiguration.description,
  metadataBase: new URL(siteConfiguration.domain),
  openGraph: {
    title: siteConfiguration.brandName,
    description: siteConfiguration.description,
    url: siteConfiguration.domain,
    siteName: siteConfiguration.brandName,
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: siteConfiguration.brandName,
    description: siteConfiguration.description,
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const headersList = await headers();
  const requestSatelliteContext = resolveRequestSatelliteContext(headersList);
  const inner = (
    <Providers>
      <div {...vaulDrawerWrapperAttribute} className="flex min-h-screen flex-col bg-background">
        <AppChrome satelliteOrigin={requestSatelliteContext.origin}>{children}</AppChrome>
      </div>
      <DevColorTweakPanel />
    </Providers>
  );

  return (
    <html lang="en">
      <body className={`${bowlbyOne.variable} ${notoEmoji.variable} antialiased`}>
        <ClerkProvider
          isSatellite
          domain={requestSatelliteContext.host}
          signInUrl={primaryTenantSignInUrl}
          signUpUrl={primaryTenantSignInUrl}
        >
          {inner}
        </ClerkProvider>
      </body>
    </html>
  );
}
