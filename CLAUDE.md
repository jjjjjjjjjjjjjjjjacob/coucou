# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**IMPORTANT: Always use `bun` as the package manager - NEVER use npm, yarn, or pnpm**

### Build Commands
- `bun run dev` - Start development servers through Turbo
- `bun run check` - Run the required repository-wide Biome formatting and lint gate
- `bun run test` - Run all tests included in CI
- `bun run build` - Build all production apps through Turbo
- `bun run quality` - Run the complete CI-equivalent check, test, and build gate
- `bun run quality:fix` - Apply safe Biome formatting/lint fixes, then run the complete quality gate
- `bun run lint` - Run linting only; this is narrower than the required `check` script

## Required CI Static Checks

The required GitHub `Static Checks` gate in `.github/workflows/ci.yml` passes only when its Biome, Tests, and Build jobs all pass. Before completing any change to code, tests, configuration, dependencies, or build tooling, run the exact root scripts used by CI:

```bash
bun run quality
```

- `bun run quality` runs `bun run check`, `bun run test`, and `bun run build` in sequence.
- `bun run quality:fix` first runs `biome check --write .` to format files, organize imports, and apply safe lint fixes, then runs the complete `quality` gate. Review all generated changes before committing them.
- Run `bun run quality` from the repository root; all three underlying checks are mandatory.
- `bun run check` verifies repository-wide Biome formatting and linting. `bun run lint` alone is not equivalent and is not sufficient.
- `bun run test` runs every workspace test task and the script tests.
- `bun run build` runs all production builds through Turbo, including framework/type validation performed during those builds.
- Targeted tests and package-level checks are useful while developing, but they do not replace the full gate.
- Fix failures rather than skipping checks, weakening configuration, or suppressing errors. Never report a task complete unless all three checks pass. If a check cannot run because of an environment or external dependency, report the exact command and failure clearly.
- `.github/workflows/ci.yml` and the root `package.json` are the source of truth. Keep this section synchronized whenever CI changes.

### Web App (apps/web)
- `cd apps/web && bun dev` - Start Next.js development server on port 2345
- `cd apps/web && bun build` - Build Next.js app for production
- `cd apps/web && bun lint` - Run Next.js ESLint (currently minimal config)

### Convex Backend (apps/convex)
- `cd apps/convex && npx convex dev` - Start Convex development server
- `cd apps/convex && npx convex deploy` - Deploy Convex backend

## Architecture Overview

This is a monorepo using Turbo with workspaces for a Next.js event management application with Convex backend.

### Key Technologies
- **Frontend**: Next.js 15 with App Router, React 19, TypeScript
- **Backend**: Convex (real-time database with serverless functions)
- **Authentication**: Clerk
- **Styling**: Tailwind CSS v4, Radix UI components
- **State Management**: TanStack Query integrated with Convex
- **Package Manager**: Bun
- **Monorepo**: Turbo

### Project Structure
```
apps/
├── web/          # Next.js frontend application
│   ├── app/      # App Router pages and layouts
│   ├── components/ # Reusable UI components
│   └── lib/      # Utilities and hooks
└── convex/       # Convex backend
    └── convex/   # Database schema, functions, and API endpoints
```

### Authentication & State
- Clerk handles user authentication and organization management
- ConvexProviderWithClerk integrates Clerk auth with Convex
- TanStack Query provides client-side caching with Convex integration
- Global providers configured in `apps/web/app/providers.tsx`

### Core Features
Based on the codebase structure, this appears to be an event management system with:
- Event creation and management
- RSVP functionality
- User profiles and organizations
- File uploads
- QR code generation
- Real-time notifications

### Environment Configuration
- Convex URL configured via `NEXT_PUBLIC_CONVEX_URL`
- Development server uses polling for file watching
- Node.js version 22 specified for Convex functions

## Code Style Guidelines

### Variable Naming
- **Always use verbose, descriptive variable names**
- Avoid abbreviations and shortened names
- Examples of BAD naming: `d`, `ts`, `pw`, `sp`, `qpPassword`, `authRes`, `userDoc`
- Examples of GOOD naming: `date`, `timestamp`, `password`, `searchParams`, `queryParamPassword`, `authResult`, `userDocument`
- Variable names should clearly explain what the data represents
- Prefer readability over brevity - code is read more than it's written

### General Code Style
- Use verbose naming throughout: variables, functions, parameters
- No single-letter variables except for very short-lived loop indices
- No unnecessary abbreviations (e.g., `res` → `result`, `req` → `request`)
- Function names should be action-oriented and descriptive
- Component names should clearly indicate their purpose

## Notes
- The repository has workspace and script test suites run by `bun run test`.
- Biome is the required repository-wide formatting and linting gate; selected web apps also have ESLint scripts for targeted validation.
- Uses Bun as package manager with workspaces configuration
