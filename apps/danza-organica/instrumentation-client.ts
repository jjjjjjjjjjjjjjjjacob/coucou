import posthog from "posthog-js";
import { isPostHogConfigured, postHogHost, postHogKey } from "./lib/posthog";

if (isPostHogConfigured()) {
  posthog.init(postHogKey, {
    api_host: postHogHost,
    defaults: "2026-01-30",
    capture_exceptions: true,
    debug: process.env.NODE_ENV === "development",
  });
}
