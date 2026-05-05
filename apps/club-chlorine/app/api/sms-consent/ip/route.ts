import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const extractClientIpAddress = (request: NextRequest): string | undefined => {
  const forwardedForHeader = request.headers.get("x-forwarded-for");
  if (forwardedForHeader) {
    const forwardedAddresses = forwardedForHeader
      .split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0);
    if (forwardedAddresses[0]) {
      return forwardedAddresses[0];
    }
  }

  const realIpHeader = request.headers.get("x-real-ip");
  if (realIpHeader?.length) {
    return realIpHeader;
  }

  return undefined;
};

export async function GET(request: NextRequest) {
  const ipAddress = extractClientIpAddress(request);
  return NextResponse.json({ ipAddress: ipAddress ?? null });
}
