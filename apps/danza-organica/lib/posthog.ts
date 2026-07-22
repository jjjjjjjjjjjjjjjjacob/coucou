export const postHogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "";

export const postHogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

export function isPostHogConfigured(): boolean {
  return postHogKey.trim().length > 0;
}
