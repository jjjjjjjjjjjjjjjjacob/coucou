# AGENTS.md

Guidelines for AI agents working with this codebase.

## Package Manager: Bun Only

**CRITICAL: Always use `bun` for package management and script execution. Never use npm, yarn, or pnpm.**

### Command Usage
- Install dependencies: `bun install`
- Add packages: `bun add <package>`
- Add dev dependencies: `bun add -d <package>`
- Remove packages: `bun remove <package>`
- Run scripts: `bun run <script>` or `bun <script>`

### Development Workflow
```bash
# Start development server
bun run dev

# Run the complete CI validation gate
bun run quality

# Apply safe formatting/lint fixes, then run the complete gate
bun run quality:fix
```

## Required CI Static Checks

The required GitHub `Static Checks` gate in `.github/workflows/ci.yml` succeeds only when every check below succeeds. Before completing any change to code, tests, configuration, dependencies, or build tooling, run these commands from the repository root:

```bash
bun run quality
```

- `bun run quality` runs `bun run check`, `bun run test`, and `bun run build` in sequence.
- `bun run quality:fix` first runs `biome check --write .` to format files, organize imports, and apply safe lint fixes, then runs the complete `quality` gate. Review all generated changes before committing them.
- `bun run check` runs the repository-wide Biome formatting and lint checks.
- `bun run test` runs all workspace tests plus the tests under `scripts/__tests__`.
- `bun run build` runs the production builds through Turbo and performs framework/type validation included by those builds.
- All three commands are mandatory. `bun run lint`, a package-level check, or a targeted test is useful during development but is not a substitute for the full CI gate.
- Fix failures instead of skipping checks, weakening configuration, or suppressing errors. Do not report a task complete until all three commands pass. If an environment or external dependency makes a command impossible to run, report the exact command and failure instead of claiming success.
- Treat `.github/workflows/ci.yml` and the root `package.json` scripts as the source of truth. If CI changes, update this section in the same change.

## Code Quality Standards

### TypeScript Requirements
- **NO `any` types allowed** - Use proper interfaces from `apps/web/lib/types.ts`
- All components must have proper type definitions
- Error handling must use proper error types, not `catch (e: any)`
- Form components must use typed React Hook Form interfaces

### Variable Naming Standards
- **Verbose, descriptive names required**
- NO abbreviations or shortened names
- Examples:
  - ❌ `d`, `ts`, `pw`, `sp`, `ev`, `cf`
  - ✅ `date`, `timestamp`, `password`, `searchParams`, `event`, `customField`

### Component Architecture
- Minimize "use client" directives
- Prefer server components for presentation-only components
- Only use "use client" for interactive components that need browser APIs

### Code Organization
- Follow DRY principles - extract shared utilities
- Use proper error handling with structured error types
- Maintain consistent patterns across frontend and backend

## Architecture Overview

### Monorepo Structure
```
apps/
├── web/          # Next.js frontend (TypeScript)
│   ├── app/      # App Router pages
│   ├── components/ # UI components
│   ├── lib/      # Utilities, types, helpers
│   └── ...
└── convex/       # Backend (Convex)
    └── convex/   # Database schema & functions
```

### Key Technologies
- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS v4
- **Backend**: Convex (serverless functions + real-time database)
- **Auth**: Clerk
- **State**: TanStack Query + Convex integration
- **Build**: Turbo (monorepo)
- **Runtime**: Bun

### Type System
- Central type definitions in `apps/web/lib/types.ts`
- Domain interfaces: `Event`, `User`, `RSVP`, `CustomField`, etc.
- Form interfaces: `EventFormData`, `RSVPFormData`
- Error types: `ApplicationError`, `ValidationError`, etc.

## Development Patterns

### Adding New Features
1. Check existing patterns in similar components
2. Use proper TypeScript interfaces from `lib/types.ts`
3. Follow verbose naming conventions
4. Use server components when possible
5. Run the complete CI validation gate described above

### Making Changes
1. Always read existing code first to understand patterns
2. Update types in `lib/types.ts` if needed
3. Use descriptive variable names throughout
4. Maintain consistency with existing patterns
5. Run `bun run quality` from the repository root

### Common Utilities
- Date/time handling: Use utilities in `lib/utils.ts`
- Form validation: Use React Hook Form with proper types
- Error handling: Use structured error types from `lib/types.ts`
- API calls: Use Convex mutations/queries with proper typing

## Quality Checklist

Before completing any task:
- [ ] All `any` types replaced with proper interfaces
- [ ] All variable names are verbose and descriptive
- [ ] "use client" only where necessary
- [ ] Proper error handling with typed errors
- [ ] Consistent with existing codebase patterns
- [ ] `bun run quality` passes from the repository root
- [ ] No duplicate code (DRY principle followed)

## Common Mistakes to Avoid

- Using npm/yarn/pnpm instead of Bun
- Using `any` types anywhere in the codebase
- Short variable names (`d`, `e`, `i`, `res`, `req`)
- Unnecessary "use client" directives
- Inconsistent naming patterns
- Copy-pasting code instead of extracting utilities
- Not reading existing code patterns before making changes

## Notes for AI Agents

- This codebase has been systematically refactored for code quality
- Follow the established patterns exactly
- When in doubt, check existing similar components
- The type system is comprehensive - use it
- All major improvements have been documented in `IMPLEMENTATION_PLAN.md`
