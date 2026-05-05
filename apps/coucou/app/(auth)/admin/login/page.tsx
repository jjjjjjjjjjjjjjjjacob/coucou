import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { resolveSafeRedirectPath } from "@coucou/sdk/routes";
import { SignInClient } from "../../../sign-in/[[...sign-in]]/sign-in-client";

type RawSearchParams = Record<string, string | string[] | undefined>;

function ensureString(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams?: Promise<RawSearchParams>;
}) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const redirectUrl = resolveSafeRedirectPath(
    ensureString(resolvedSearchParams.redirect_url),
    "/admin",
  );
  const authObject = await auth();
  if (authObject.userId) {
    redirect(redirectUrl);
  }

  return (
    <SignInClient
      redirectUrl={redirectUrl}
      authBranding={{
        heading: "Sign in to Coucou admin",
        sub: "Use the Coucou organization to open platform-wide tenant operations.",
        eyebrow: "Super-admin",
        brandMarkStyle: "thin-ring",
      }}
      postAuthNavigation="document-replace"
    />
  );
}
