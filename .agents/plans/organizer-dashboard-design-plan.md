# Organizer Dashboard Design Overhaul Plan

**Scope:** `apps/coucou` host & workspace dashboards (RSVPs, Events, Analytics, Overview, etc.)  
**Goal:** Make the dashboard feel cohesive and CMS-like (Shopify admin), with a clear visual hierarchy and a global Cmd‑K power menu.  
**Status:** Draft / ready for implementation  

---

## 1. Audit findings

### 1.1 Visual hierarchy is flat
- Every page header uses `text-3xl font-bold tracking-tight`, making the page title compete with the data instead of guiding the eye.
- The breadcrumb/sidebar trigger line sits in the main content area, adding noise before the user even reaches the page content.
- Page-level actions are small icon-only buttons or dropdowns that feel disconnected from the title.

### 1.2 Toolbars wrap and feel disjointed
- RSVP controls use a mix of `flex-wrap` rows, arbitrary separators (`w-px`), and inconsistent widths (`w-32`, `w-36`, `w-28`).
- The event selector is treated as a separate form field rather than a contextual page header control.
- Filters, sort, and column toggles are not grouped as a single toolbar pattern.

### 1.3 Table density is too high
- The RSVP table computes very tight column widths, so many columns truncate (e.g., `Descendi`, `CREAT...`).
- Header text is not protected from wrapping; row controls (delete, QR, dropdowns) consume a lot of horizontal space.
- Status badges use high-saturation fills (`bg-emerald-500`, `bg-red-50`, `bg-yellow-100`) that clash with the dark Maison theme.
- List badges (`FRIENDS`, `PRESS`, `VIP`) are rendered in all-caps outline buttons, which adds visual weight to a secondary column.

### 1.4 No global navigation shortcut
- There is no keyboard-driven command palette. To move between Events, RSVPs, Analytics, etc., users must rely on the sidebar or the browser back button.
- Light/dark mode, event switching, and "New Event" are scattered in the sidebar or page menus.

### 1.5 Inconsistent surface treatment
- Overview and Analytics use default `Card` components without enough internal spacing or consistent shadow.
- Themaison theme has hardcoded dark surfaces that feel heavy for an admin tool; the light-mode override uses `!important` on many tokens, which is brittle.
- Buttons, inputs, and selects use slightly different heights and border styles.

### 1.6 Code organization is a blocker
- `apps/coucou/app/workspaces/[workspaceSlug]/host/rsvps/page.tsx` is ~4,480 lines, mixing data fetching, table logic, export UI, and inline styling. It is hard to redesign without breaking behavior.

---

## 2. Design direction

### 2.1 Shopify CMS aesthetic
We want the dashboard to read like a content management tool, not a config panel:
- A single, persistent **top app bar** that contains global search, workspace switcher, and the user avatar.
- A clean **sidebar** used only for primary navigation (not for branding or user actions).
- Each page has a clear **page header** with title, subtitle, and primary action(s) aligned to the right.
- A **sticky filter/sort bar** below the header for index pages (RSVPs, Events, Texts, Users).
- Data tables use **subtle row borders**, **muted status pills**, and **monospaced/tabular numbers** where appropriate.
- Cards sit on a slightly elevated surface with consistent padding and a restrained shadow.

### 2.2 Key visual principles
- **One type scale:** `display` (page title), `title` (card/chart titles), `body`, `caption`, `label`. No arbitrary `text-3xl` everywhere.
- **8 px spacing rhythm:** consistent `gap-4`, `p-4`, `p-6`, etc.
- **Color discipline:** all status colors go through the same low-saturation token set; no hardcoded `bg-red-50` or `bg-emerald-500` in pages.
- **No all-caps secondary labels:** list badges become `Badge` with a dot or a subtle background, not uppercase bordered buttons.
- **No wrapping on desktop toolbars:** use a horizontal overflow or collapsible "More filters" button instead of `flex-wrap`.

### 2.3 Cmd‑K power menu
A global command palette gives users one shortcut for everything:
- **Navigation:** jump to Overview, Events, RSVPs, Text Blasts, Analytics, Door Scan, Settings, etc.
- **Event switching:** type an event name and jump to its RSVPs/Analytics.
- **Quick actions:** New Event, Send Text Blast, Export RSVPs, Toggle light/dark mode.
- **Search:** jump to a guest by name on the RSVP page.
- **Help:** show the available shortcuts.

---

## 3. Component architecture

### 3.1 New / updated shell components
| Component | Purpose | Notes |
|-----------|---------|-------|
| `components/dashboard-top-bar.tsx` | Global app bar: workspace switcher, Cmd‑K trigger, notifications, user avatar. | Rendered inside `WorkspaceHostShell` and `WorkspaceDashboardShell`. |
| `components/app-sidebar.tsx` | Trimmed navigation only. | Move tenant switcher and user badge to top bar; keep nav groups. |
| `components/page-header.tsx` | Reusable page title + subtitle + actions. | Used on every host page. |
| `components/page-toolbar.tsx` | Reusable toolbar shell for search, filters, sort, view toggles. | Accepts `children` so each page can compose its own controls. |
| `components/command-palette.tsx` | Dialog + `cmdk` UI. | Headless command list, styled with the Maison theme. |
| `components/command-palette-provider.tsx` | Provides open/close state and keyboard listener. | Wraps root in `app/providers.tsx`. |
| `hooks/use-command-palette.ts` | Shortcut registration (`mod+k`) and imperative open/close. | Uses `useEffect` for keydown; no extra deps beyond `cmdk`. |
| `components/ui/status-badge.tsx` | Approved / pending / denied / issued / redeemed / draft / past / published. | Maps status to a neutral `Badge` variant. |
| `components/ui/page-card.tsx` | Card wrapper for dashboard content with consistent padding and shadow. | Sits on top of `Card`/`CardHeader`/`CardContent`. |

### 3.2 Refactored RSVP surface
Move large chunks out of the page file into focused components under `components/rsvps/`:
- `rsvp-table.tsx` – TanStack table definition and render loop.
- `rsvp-toolbar.tsx` – search, event selector, filters, sort, columns, export.
- `rsvp-export-dialog.tsx` – CSV export options dialog.
- `rsvp-pagination.tsx` – cursor pagination controls.
- `rsvp-table-preferences.ts` – column visibility / sizing helpers (move from inline).
- `use-rsvp-table-state.ts` – selection, sorting, filters, loading sets.

### 3.3 Design token additions in `app/globals.css`
Add semantic tokens scoped to `.maison-app-surface` and `.maison-dashboard-light`:
```css
--surface-1: var(--tt-bg);          /* page background */
--surface-2: var(--tt-bg-2);        /* card / popover */
--surface-3: var(--tt-highlight);   /* hover / active */
--text-primary: var(--tt-fg);
--text-secondary: var(--tt-fg-dim);
--text-tertiary: var(--tt-fg-mute);
--border-subtle: var(--tt-rule);
--border-strong: var(--tt-rule-strong);
--shadow-card: 0 1px 2px rgba(0,0,0,0.04), 0 1px 3px rgba(0,0,0,0.08);
--status-approved: ...; --status-pending: ...; --status-denied: ...; etc.
```
Replace the existing `!important` light-mode overrides with token reassignment so components stay clean.

---

## 4. Implementation plan

### Phase 1 — Foundation & tokens
1. **Add dashboard tokens** to `apps/coucou/app/globals.css` (remove brittle `!important` light mode overrides where possible).
2. **Create `components/ui/status-badge.tsx`** with variants: `approved`, `pending`, `denied`, `issued`, `redeemed`, `disabled`, `draft`, `published`, `past`.
3. **Create `components/ui/page-card.tsx`** as a standardized card wrapper.
4. **Update `components/ui/button.tsx`, `select.tsx`, `input.tsx`, `badge.tsx`** to use the new border/height tokens so every control has the same 32 px / 36 px / 40 px heights.
5. **Run `bun lint`** after token changes.

### Phase 2 — Global shell
1. **Build `components/dashboard-top-bar.tsx`**:
   - Left: hamburger / sidebar toggle, workspace name + breadcrumb.
   - Center: Cmd‑K search trigger (always visible, `⌘K` shortcut).
   - Right: user avatar / user menu.
2. **Trim `components/app-sidebar.tsx`**:
   - Remove the tenant switcher and user badge from the footer.
   - Keep `Dashboard` nav group and `Quick Actions` group.
   - Use the new surface tokens for active/hover states.
3. **Update `components/workspace-host-shell.tsx` and `components/workspace-dashboard-shell.tsx`** to render the top bar above the sidebar inset and remove the inline breadcrumb row.
4. **Update `app/app-chrome.tsx` if needed** so the new shell does not duplicate headers on non-shell pages.

### Phase 3 — Command palette
1. **Install dependency:** `bun add cmdk`.
2. **Create `components/command-palette.tsx`** with groups: Navigation, Events, Quick Actions, Recent, Help.
3. **Create `components/command-palette-provider.tsx`** and `hooks/use-command-palette.ts` to open/close with `mod+k` and `esc`.
4. **Wire provider** in `apps/coucou/app/providers.tsx`.
5. **Populate commands:**
   - Navigation items from `app-sidebar.tsx`.
   - Events list from the current workspace (query `api.events.listAll` with workspace scope).
   - Quick actions: New Event, Export RSVPs, Toggle light mode.
   - Help item: show a shortcut dialog.
6. **Add a Cmd‑K trigger button** to the top bar and the sidebar footer.

### Phase 4 — Page headers & toolbars
1. **Create `components/page-header.tsx` and `components/page-toolbar.tsx`**.
2. **Apply to every host page:**
   - `host/page.tsx` (Overview)
   - `host/events/page.tsx`
   - `host/rsvps/page.tsx`
   - `host/text-blasts/page.tsx`
   - `host/texts/page.tsx`
   - `host/users/page.tsx`
   - `host/analytics/page.tsx`
   - `host/developers/page.tsx`
   - `host/settings/page.tsx` (if exists)
3. **Rules:**
   - Page title drops to `text-2xl font-semibold` (or `text-3xl` only on Overview).
   - Subtitle uses `text-secondary` and a single line.
   - Primary action is a `Button` on the right; secondary actions move into a dropdown or the toolbar.
   - Toolbar uses `flex items-center gap-3` on desktop; overflow hidden with a "More filters" popover on small screens.

### Phase 5 — RSVP table overhaul
1. **Extract components** from the giant RSVP page:
   - `components/rsvps/rsvp-table.tsx`
   - `components/rsvps/rsvp-toolbar.tsx`
   - `components/rsvps/rsvp-export-dialog.tsx`
   - `components/rsvps/rsvp-pagination.tsx`
   - `hooks/use-rsvp-table-state.ts` (or keep the existing `RsvpTableContext` in the new table component).
2. **Table improvements:**
   - Wrap in `overflow-x-auto` with a sticky header.
   - Add `whitespace-nowrap` to all header cells and status cells.
   - Use `min-w-*` per column instead of tiny computed widths; allow horizontal scroll rather than aggressive truncation.
   - Replace all-caps list badges with `StatusBadge` variants (e.g., dot + label, soft background).
   - Replace status select cells with smaller, theme-aware `StatusBadge` toggles.
   - Row actions collapse to a single icon `...` menu with tooltips; keep only the most common action visible (e.g., "View ticket").
3. **Toolbar improvements:**
   - Move the event selector into `page-header.tsx` as a secondary control or a compact dropdown.
   - Combine search, approval, list, ticket, social filters into one row.
   - Sort by + order become a single "Sort" split button or a compact dropdown pair.
   - Columns and Export move to the right side of the toolbar as icon buttons.
4. **Pagination:** replace the current block with a compact, Shopify-style "Previous / Next" + item count bar.

### Phase 6 — Overview & Events polish
1. **Overview (`host/page.tsx`):**
   - Reduce the quick-link grid to 4–5 primary actions and move the rest into the command palette.
   - Use `page-card` for metric cards; align icons, values, and captions consistently.
   - Chart cards get a defined `min-h` and less internal padding.
   - Recent activity list uses the same row layout as the RSVP table (avatar/name/meta/status).
2. **Events (`host/events/page.tsx`):**
   - Default to a **list view** with the same card/row pattern as the RSVP table.
   - Improve event card layout: flyer thumbnail, title + meta, status badges, actions menu.
   - Use `StatusBadge` for draft/past/published.
   - Keep the grid view but make it an optional toggle.

### Phase 7 — QA, accessibility, tests
1. **Run `bun lint`** and fix any `any` types or short variable names.
2. **Accessibility:**
   - Verify all icon-only buttons have `aria-label`.
   - Ensure focus rings are visible on the dark theme.
   - Verify color contrast for the new status badges.
3. **Responsive:**
   - Test sidebar collapse on 1280 px and 1024 px.
   - Test toolbar overflow on 768 px.
   - Test command palette on mobile (full-screen sheet).
4. **Update existing tests:**
   - `apps/coucou/__tests__/host-rsvps-status-management.test.tsx`
   - `apps/coucou/__tests__/events-page.test.tsx`
   - `apps/coucou/__tests__/host-page.test.tsx`
   - Any other tests that assert selectors changed by the new shell.
5. **Light/dark mode:** verify the dashboard looks correct in both themes and that the command palette respects the current theme.

---

## 5. File list to touch

```text
apps/coucou/app/globals.css
apps/coucou/app/providers.tsx
apps/coucou/app/app-chrome.tsx
apps/coucou/app/workspaces/[workspaceSlug]/host/layout.tsx
apps/coucou/app/workspaces/[workspaceSlug]/host/page.tsx
apps/coucou/app/workspaces/[workspaceSlug]/host/rsvps/page.tsx
apps/coucou/app/workspaces/[workspaceSlug]/host/events/page.tsx
apps/coucou/app/workspaces/[workspaceSlug]/host/analytics/page.tsx
apps/coucou/app/workspaces/[workspaceSlug]/host/text-blasts/page.tsx
apps/coucou/app/workspaces/[workspaceSlug]/host/texts/page.tsx
apps/coucou/app/workspaces/[workspaceSlug]/host/users/page.tsx
apps/coucou/app/workspaces/[workspaceSlug]/host/developers/page.tsx
apps/coucou/app/workspaces/[workspaceSlug]/host/settings/page.tsx (if present)
apps/coucou/components/workspace-host-shell.tsx
apps/coucou/components/workspace-dashboard-shell.tsx
apps/coucou/components/app-sidebar.tsx
apps/coucou/components/sidebar-tenant-switcher.tsx
apps/coucou/components/ui/badge.tsx
apps/coucou/components/ui/button.tsx
apps/coucou/components/ui/select.tsx
apps/coucou/components/ui/input.tsx
apps/coucou/components/ui/sidebar.tsx
apps/coucou/components/ui/card.tsx
apps/coucou/components/ui/dialog.tsx (if extending)
apps/coucou/components/ui/tooltip.tsx
apps/coucou/components/dashboard-top-bar.tsx (new)
apps/coucou/components/page-header.tsx (new)
apps/coucou/components/page-toolbar.tsx (new)
apps/coucou/components/command-palette.tsx (new)
apps/coucou/components/command-palette-provider.tsx (new)
apps/coucou/components/ui/status-badge.tsx (new)
apps/coucou/components/ui/page-card.tsx (new)
apps/coucou/components/rsvps/rsvp-table.tsx (new)
apps/coucou/components/rsvps/rsvp-toolbar.tsx (new)
apps/coucou/components/rsvps/rsvp-export-dialog.tsx (new)
apps/coucou/components/rsvps/rsvp-pagination.tsx (new)
apps/coucou/hooks/use-command-palette.ts (new)
```

---

## 6. Acceptance criteria

- [ ] The dashboard has a persistent top bar with a Cmd‑K search trigger and user avatar.
- [ ] The sidebar shows only navigation and is visually consistent with the top bar.
- [ ] Every host page uses the new `PageHeader` and `PageToolbar` components and no longer has arbitrary `text-3xl` headers.
- [ ] Toolbars do not wrap on desktop; mobile collapses extra filters into a "Filters" popover.
- [ ] The RSVP table uses sticky headers, horizontal scroll, and `whitespace-nowrap` column headers; no labels are cut off mid-word.
- [ ] Status badges use the new `StatusBadge` component and do not use raw `bg-red-50`/`bg-emerald-500` classes in pages.
- [ ] List badges are no longer all-caps outline buttons; they use subtle, theme-aware pills.
- [ ] The command palette opens with `⌘K`/`Ctrl+K`, supports navigation, event switching, and quick actions.
- [ ] Light and dark modes both look polished and pass basic contrast checks.
- [ ] `bun lint` passes with no new `any` types or abbreviated variable names.
- [ ] Existing tests pass or are updated to match the new selectors/layout.

---

## 7. Open questions / decisions needed

1. **Top bar on mobile:** Should the sidebar collapse into a bottom sheet or stay as a narrow rail? Shopify uses a collapsible rail; the current `shadcn/ui/sidebar` supports this already.
2. **Door pages:** Door Scan and Door List live under `/door` and use a separate shell. Should they adopt the same top bar and command palette for consistency?
3. **Notifications:** Do we have a notifications system to show in the top bar, or should the avatar be the only right-side item for now?
4. **Event selector placement:** Should it be a top-bar dropdown (Shopify-style resource picker) or stay in the page toolbar? Recommendation: move it to the page toolbar for the RSVP page, but expose it in the command palette globally.
5. **Color palette for status badges:** Should we derive them from the existing Maison tokens, or introduce new semantic tokens (e.g., `oklch` greens/yellows/reds)? Recommendation: keep them inside the Maison token set so light/dark mode both work.

---

## 8. Suggested first PR

A good first PR would be **Phase 1 + Phase 2** together: introduce the design tokens, build `DashboardTopBar`, wire the command palette, and trim the sidebar. This gives the biggest visual impact before touching the complex RSVP page. Subsequent PRs can tackle the RSVP table refactor and page-level polish.
