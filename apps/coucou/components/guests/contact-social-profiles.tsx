import { DEFAULT_SOCIAL_PLATFORM_CONFIGS } from "@coucou/sdk/shared/primary-fields";
import type { GuestDirectoryPerson } from "@/lib/types";

export function ContactSocialProfiles({
  profiles,
}: {
  profiles: NonNullable<GuestDirectoryPerson["socialProfiles"]>;
}) {
  if (profiles.length === 0) return <span className="text-xs text-[var(--text-secondary)]">—</span>;
  return (
    <div className="min-w-0 space-y-1">
      {profiles.map((profile) => {
        const platform = DEFAULT_SOCIAL_PLATFORM_CONFIGS.find(
          (configuration) => configuration.platformKey === profile.platformKey,
        );
        const label = `${platform?.label ?? profile.platformKey}: @${profile.handle.replace(/^@/, "")}`;
        return platform?.profileUrlPrefix ? (
          <a
            key={profile.platformKey}
            href={`${platform.profileUrlPrefix}${encodeURIComponent(profile.handle.replace(/^@/, ""))}`}
            target="_blank"
            rel="noopener noreferrer"
            className="block truncate text-sm underline decoration-[var(--border-subtle)] underline-offset-4 hover:decoration-current"
            title={label}
          >
            {label}
          </a>
        ) : (
          <span key={profile.platformKey} className="block truncate text-sm" title={label}>
            {label}
          </span>
        );
      })}
    </div>
  );
}
