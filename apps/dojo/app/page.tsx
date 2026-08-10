import { api } from "@convex/_generated/api";
import { fetchQuery } from "convex/nextjs";
import type { Metadata } from "next";
import { selectLandingOpenGraphImageUrl } from "@/lib/landing-open-graph";
import { siteConfiguration } from "@/lib/site";
import { HomePageClient } from "./home-page-client";

const fallbackOpenGraphImageUrl = "/og-image.png";

export const dynamic = "force-dynamic";

async function resolveLandingOpenGraphImageUrl(): Promise<string> {
  try {
    const eventEntries = await fetchQuery(api.events.listAllWithFlyerUrls, {
      siteKey: siteConfiguration.siteKey,
    });
    return selectLandingOpenGraphImageUrl(eventEntries, fallbackOpenGraphImageUrl);
  } catch (error) {
    console.error("Failed to load landing page Open Graph flyer", error);
    return fallbackOpenGraphImageUrl;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  const openGraphImageUrl = await resolveLandingOpenGraphImageUrl();

  return {
    title: siteConfiguration.brandName,
    description: siteConfiguration.description,
    openGraph: {
      title: siteConfiguration.brandName,
      description: siteConfiguration.description,
      url: siteConfiguration.domain,
      siteName: siteConfiguration.brandName,
      images: [
        {
          url: openGraphImageUrl,
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
      images: [openGraphImageUrl],
    },
  };
}

export default function Home() {
  return <HomePageClient />;
}
