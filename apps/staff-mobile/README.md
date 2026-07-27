# Coucou Staff

Expo development-build application for venue door, host, and administrator
workflows. The app intentionally does not target web.

## Local setup

1. Copy `.env.example` to `.env.local` and add the Clerk publishable key and
   Convex deployment URL for the environment.
2. From the repository root, run `bun install`.
3. Create a native development build with `bun --cwd apps/staff-mobile ios` or
   `bun --cwd apps/staff-mobile android`.
4. Start Metro with `bun --cwd apps/staff-mobile dev`.

Native dependency changes require a new store/development build. JavaScript-only
production fixes can ship through the `production` EAS Update channel.
