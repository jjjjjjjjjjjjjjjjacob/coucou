# Linear-Inspired Organizer Dashboard Plan

**Scope:** `apps/coucou` organizer dashboard — overall layout, events list (`/host/events`), and event detail (`/host/events/[eventId]`).  
**Goal:** Evolve the current dashboard from a Shopify/CMS-style admin toward a Linear-style product interface: darker, flatter, typographic, with a clear title bar, breadcrumb way-finding, and a right-hand properties panel on detail pages.  
**Status:** Draft / ready for implementation  
**Relation to existing plan:** This plan supersedes the visual direction in `.agents/plans/organizer-dashboard-design-plan.md` (which targeted a Shopify/CMS aesthetic). Reuse the shell components it already created (`DashboardTopBar`, `PageHeader`, `PageToolbar`, `PageCard`, `StatusBadge`, `CommandPalette`) but reshape them to feel like Linear rather than Shopify.

---

## 1. What makes Linear feel like Linear

From the provided screenshots, the signature traits are:

- **Almost no chrome.** A narrow, flat sidebar and a single title bar; no separate global "app bar" with a persistent search box.
- **Breadcrumb title bar.** The top of the content area reads `Workspace > Section > Item` with a small icon, not a large centered heading.
- **Single-column primary content.** Pages are one readable stream with generous whitespace and a consistent max-width.
- **Right-hand properties panel.** On detail/issue pages, metadata lives in a fixed right rail (Status, Assignee, Labels, Project, etc.).
- **Minimal surfaces.** No heavy cards or shadows; separation is via 1px borders at very low opacity, not elevated cards.
- **Tiny status chips.** Status is a small colored dot + lowercase/sentence-case label, not a big filled badge.
- **Subtle tabs.** Under the title bar, a thin underline tab list sits almost flush with the content.
- **Command palette is hidden.** It is invoked by `⌘K`, not displayed as a search bar in the header.
- **Muted typography.** `Inter`-style sans, large page titles with medium weight, small body text, generous line-height.
- **Rounded dialogs.** Modals are centered, rounded, dark, and minimal.

---

## 2. Current-state audit

### 2.1 Global layout
- `DashboardTopBar` currently renders a full-width sticky bar with a search trigger, avatar, and user name. This reads as Shopify, not Linear.
- The sidebar has grouped sections with visible group labels (`Dashboard`, `Quick Actions`) and a footer with a light-mode toggle. Linear sidebars are flatter and quieter.
- The main content area has a small gap and no clear max-width; it feels like a generic admin panel rather than a focused reading surface.

### 2.2 Events list (`host/events/page.tsx`)
- List items are rendered as `Card` components with a heavy background and shadow.
- Each row exposes several buttons (`Details`, `Share`, `…`) which creates visual noise.
- Status is a filled `Badge`, not a subtle dot + label.
- Toolbar is a full-width row with search, filters, and view toggles; Linear would prefer a simpler, compact filter bar.

### 2.3 Event detail (`host/events/[eventId]/page.tsx`)
- The page embeds the full `EditEventDialog` as an inline form. That form uses a single horizontal tab list with many tabs (`Overview`, `RSVP Setup`, `Lists & Access`, `Messages`, `Guest Page`, `Branding`, `Lineup`, `Guests`, `Settings`).
- The tab list is dense and wraps on smaller screens.
- Settings are currently rendered as stacked `PageCard` sections inside a tab. Linear would prefer a right-hand properties panel for lifecycle metadata and a calmer main form.
- There is no breadcrumb or clear sense of where the user is in the hierarchy.

### 2.4 Design tokens
- The existing `maison-app-surface` tokens are already dark, but surfaces are not differentiated enough for a Linear look; `--surface-2` is too close to `--surface-1` and the card shadow is too Shopify.
- Typography uses `"Helvetica Neue"`, Helvetica, Arial. Linear uses a more modern geometric sans (Inter / SF Pro / Geist); the project already loads `var(--font-geist-sans)`.

---

## 3. Design direction

### 3.1 Overall layout principles
1. **Flatten the shell.** Remove the persistent global search bar. The top of the content area becomes the title/breadcrumb bar.
2. **Quiet the sidebar.** Keep only nav items, no group labels, no footer. Move the workspace switcher to the sidebar header as a compact dropdown. Move light-mode toggle and user avatar to the sidebar footer or remove them from the sidebar entirely.
3. **Center the content stream.** Use a max-width container (e.g., `max-w-5xl` for list pages, `max-w-6xl` for detail pages) with generous horizontal padding (`px-6 lg:px-10`).
4. **Prefer borders over cards.** Replace card shadows with `border-b border-[var(--border-subtle)]` or a 1px outline around panels.
5. **Command palette is invisible until invoked.** Keep `⌘K` support, but do not show a search input in the header. Add a keyboard hint in the sidebar footer or a small floating trigger if needed.

### 3.2 Typography
- Adopt the Geist font stack already in the project: `font-sans: var(--font-geist-sans)`.
- Page title: `text-2xl font-semibold tracking-tight` (or `text-3xl` only on the workspace overview).
- Section title: `text-sm font-medium text-[var(--text-primary)]`.
- Body/secondary: `text-sm text-[var(--text-secondary)]`.
- Use `text-wrap: balance` on headings and `text-wrap: pretty` on body text.
- Apply `-webkit-font-smoothing: antialiased` on the dashboard root for macOS crispness.

### 3.3 Color & surface tokens
Add Linear-leaning overrides inside `.maison-app-surface` (the current dark mode):

```css
.maison-linear {
  --tt-bg: #0a0a0a;
  --tt-bg-2: #111111;
  --tt-bg-3: #1c1c1c;
  --tt-fg: #f0f0f0;
  --tt-fg-dim: #8a8a8a;
  --tt-fg-mute: #5c5c5c;
  --tt-rule: rgba(255, 255, 255, 0.08);
  --tt-rule-strong: rgba(255, 255, 255, 0.12);
  --tt-highlight: rgba(255, 255, 255, 0.06);
  --tt-highlight-strong: rgba(255, 255, 255, 0.10);
  --tt-accent: #5e6ad2; /* Linear-style muted indigo; only for links/selected states */
}
```

Apply `maison-linear` to the dashboard body via the shell. Keep existing `maison-app-surface` tokens as a fallback so other pages are not broken.

### 3.4 Status chips
- Replace the existing `StatusBadge` with a smaller Linear-style dot badge:
  - `size="sm"` with `h-5 px-1.5`.
  - A `2px` colored dot before the label.
  - Transparent background, no border, or a very subtle border.
  - Labels are sentence case (`Draft`, `Published`, `Past`), not all-caps.
- Map variants: `draft`, `published`, `past`, `featured`, `approved`, `pending`, `denied`.

### 3.5 Buttons & inputs
- Buttons should be subtle: `variant="outline"` with `border-[var(--border-subtle)]` and `bg-transparent`.
- Primary actions use the default button with a slightly lighter surface.
- Inputs/selects have a `1px` border at `--border-subtle`, no strong shadow, and rounded-md.
- Add `active:scale-[0.96] transition-transform` to interactive buttons per the polish skill.

---

## 4. Component architecture

### 4.1 New / updated shell components
| Component | Purpose | Notes |
|-----------|---------|-------|
| `components/dashboard-title-bar.tsx` | Linear-style breadcrumb + title + actions at the top of the content area. | Replaces `PageHeader` on Linear-style pages. Includes a back link, breadcrumb, page icon, title, and right-aligned primary actions. |
| `components/dashboard-shell.tsx` | Updated workspace shell: sidebar + inset content with a title bar. | Replaces the heavy top bar with a minimal title bar inside the content area. |
| `components/app-sidebar.tsx` | Quieter sidebar: no group labels, compact nav, workspace switcher in header, Cmd-K hint in footer. | Keep existing file but trim visual weight. |
| `components/property-panel.tsx` | Right-hand properties rail for detail pages. | Sticky on desktop, stacked on mobile. |
| `components/property-row.tsx` | A single property row: icon + label + value + optional action. | Used inside `PropertyPanel`. |
| `components/linear-tabs.tsx` | Thin underline tabs for detail pages. | Wraps `Tabs` with `variant="line"` and minimal styling. |
| `components/event-list-row.tsx` | Dense list row for the events page. | Replaces the current card/list item. Hover reveals actions. |
| `components/event-list-row-actions.tsx` | Overflow action menu for an event row. | Keeps the row surface clean. |
| `components/ui/status-badge.tsx` | Updated to a Linear-style dot badge. | Keep the API; change rendering only. |

### 4.2 Refactored event detail surface
The current inline `EditEventDialog` is too large to replace wholesale, so we restructure the page around it:
- Keep the form and its tabs, but move them into a calmer two-column layout:
  - **Left/main:** Title bar + `LinearTabs` + active tab content (the existing form sections).
  - **Right/properties:** A sticky `PropertyPanel` with event metadata and lifecycle actions.
- Introduce `components/event-detail-layout.tsx` that composes the title bar, tabs, form, and property panel.

### 4.3 Refactored events list
- Replace the current card/list `Card` rendering with `EventListRow`.
- Use a simple header row above the list (Title, Date, Status, Guests/RSVP count).
- Keep the existing card view as an optional toggle, but default to the Linear-style list view.
- Toolbar becomes a single compact row with search, filter, and sort.

---

## 5. Implementation plan

### Phase 1 — Tokens & shell foundation
1. **Add Linear tokens** in `apps/coucou/app/globals.css` under a new `.maison-linear` class (see §3.3).
2. **Apply `maison-linear`** to the dashboard body in `workspace-host-shell.tsx` and `workspace-dashboard-shell.tsx` instead of `maison-app-surface`.
3. **Add font smoothing** to the dashboard root: `-webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale;`.
4. **Update font stack** to prefer Geist for dashboard surfaces: set `--font-sans: var(--font-geist-sans)` inside the Linear theme.
5. **Create `components/dashboard-title-bar.tsx`**:
   - Props: `title`, `subtitle`, `breadcrumb`, `icon`, `backHref`, `actions`.
   - Renders a top content bar like Linear: `icon / Workspace / Section / Item`.
   - Keep the title large but not competing; right-align primary actions.
6. **Trim `components/app-sidebar.tsx`**:
   - Remove `SidebarGroupLabel` for nav groups (or make them very small/uppercase/tracked-out).
   - Move `SidebarTenantSwitcher` to the header and make it compact.
   - Remove the light-mode footer from the sidebar; add a tiny `⌘K` hint and the user avatar at the bottom.
7. **Remove or demote `DashboardTopBar`**:
   - Either delete the component or reduce it to a 1px border only (no search bar, no avatar).
   - The title bar will now live inside the content area.
8. **Update shells** (`workspace-host-shell.tsx`, `workspace-dashboard-shell.tsx`) to render the new flatter layout.

### Phase 2 — Events list page
1. **Create `components/event-list-row.tsx`**:
   - Single row with a bottom border, not a card.
   - Left: small event thumbnail (if available) or placeholder.
   - Center: event title (truncated), date/time, location.
   - Right: status dot badge, RSVP count, hover-revealed actions.
2. **Create `components/event-list-row-actions.tsx`**:
   - A single `…` menu with: View public page, Publish/Unpublish, Set featured, Send QR codes, Delete.
3. **Update `host/events/page.tsx`**:
   - Use `DashboardTitleBar` instead of `PageHeader`.
   - Keep `PageToolbar` but make it compact: search + filter + sort + view toggle.
   - Replace the list rendering with `EventListRow`.
   - Keep the card grid as a view-mode toggle.
   - Ensure the empty and filtered-empty states match the new typography.
4. **Delete or deprecate** the heavy `EventCardClient` usage in list mode; keep it for the card grid view only.
5. **Run `bun lint`** and fix any `any` types or abbreviated names.

### Phase 3 — Event detail page
1. **Create `components/property-panel.tsx` and `components/property-row.tsx`**:
   - A sticky right rail with a subtle left border.
   - Sections: Properties, Sharing, Actions, Record history.
2. **Create `components/event-detail-layout.tsx`**:
   - Two-column grid on desktop (`lg:grid-cols-[1fr_320px]`), single column on mobile.
   - Left: `DashboardTitleBar`, `LinearTabs`, and tab content.
   - Right: `PropertyPanel` with event metadata and actions.
3. **Update `host/events/[eventId]/page.tsx`**:
   - Replace `PageHeader` with `DashboardTitleBar`.
   - Breadcrumb: `Events / {eventName}`.
   - Wrap the existing `EditEventDialog` (inline) inside `EventDetailLayout`.
   - Move the "System details", "Sharing", and "Lifecycle actions" currently in `EventSettingsTab` into the right `PropertyPanel`.
   - Keep `Guests` and `Settings` tabs but rename `Settings` to something more specific (e.g., `System`) or merge it into the property panel.
4. **Update `host/events/[eventId]/event-settings-tab.tsx`**:
   - Remove the system details, sharing, and lifecycle cards that moved to the property panel.
   - Keep only settings that are truly form-based (or remove the tab entirely if the property panel covers it).
5. **Create `components/linear-tabs.tsx`**:
   - A thin underline tab list with minimal padding and hover states.
6. **Update `EditEventDialog`** to accept a `tabsComponent` prop so it can render either the current horizontal tab list or the new `LinearTabs` without duplicating form logic.
7. **Run `bun lint`** and update tests.

### Phase 4 — Detail micro-interactions & polish
1. **Update `StatusBadge`** to the dot style (§3.4).
2. **Add press scaling** to all buttons and row actions.
3. **Add hover transitions** to list rows (`bg-[var(--tt-highlight)]` over 150ms).
4. **Add tab content enter transition** if using a motion library; otherwise skip.
5. **Ensure focus rings** are visible but subtle on the Linear dark theme.
6. **Verify tabular numbers** for RSVP counts and dates.

### Phase 5 — Command palette & navigation
1. **Remove the persistent search bar** from `DashboardTopBar`.
2. **Keep the `CommandPalette` provider** and `⌘K` shortcut; ensure it still works globally.
3. **Add a `⌘K` footer item** in the sidebar for discoverability.
4. **Update command palette styling** to match the Linear dark theme (no shadows, subtle borders, dot badges for status).

### Phase 6 — QA & responsive
1. **Light mode:** Decide whether to support the Linear look in light mode or keep the current Maison light theme. Recommendation: keep the existing light mode for now; the Linear aesthetic is primarily a dark-mode refinement.
2. **Responsive:**
   - On mobile, the property panel stacks below the content.
   - Sidebar collapses to the standard shadcn rail.
   - Title bar actions collapse into a `…` menu.
3. **Accessibility:**
   - All icon-only buttons have `aria-label`.
   - Breadcrumb is a real `nav` with `aria-label`.
   - Tab list uses `role="tablist"` and proper focus management.
4. **Tests:** Update existing tests to match new selectors and layout.
5. **Final lint:** `bun lint` with zero new warnings.

---

## 6. File list to touch

```text
apps/coucou/app/globals.css
apps/coucou/app/providers.tsx
apps/coucou/components/workspace-host-shell.tsx
apps/coucou/components/workspace-dashboard-shell.tsx
apps/coucou/components/app-sidebar.tsx
apps/coucou/components/sidebar-tenant-switcher.tsx
apps/coucou/components/dashboard-top-bar.tsx
apps/coucou/components/dashboard-title-bar.tsx (new)
apps/coucou/components/linear-tabs.tsx (new)
apps/coucou/components/event-list-row.tsx (new)
apps/coucou/components/event-list-row-actions.tsx (new)
apps/coucou/components/event-detail-layout.tsx (new)
apps/coucou/components/property-panel.tsx (new)
apps/coucou/components/property-row.tsx (new)
apps/coucou/components/ui/status-badge.tsx
apps/coucou/components/ui/button.tsx
apps/coucou/components/ui/input.tsx
apps/coucou/components/ui/select.tsx
apps/coucou/components/ui/badge.tsx
apps/coucou/app/workspaces/[workspaceSlug]/host/events/page.tsx
apps/coucou/app/workspaces/[workspaceSlug]/host/events/event-card-client.tsx
apps/coucou/app/workspaces/[workspaceSlug]/host/events/[eventId]/page.tsx
apps/coucou/app/workspaces/[workspaceSlug]/host/events/[eventId]/event-settings-tab.tsx
apps/coucou/app/workspaces/[workspaceSlug]/host/events/[eventId]/event-guests-tab.tsx
apps/coucou/app/workspaces/[workspaceSlug]/host/events/edit-event-dialog.tsx
apps/coucou/app/workspaces/[workspaceSlug]/host/page.tsx
apps/coucou/app/workspaces/[workspaceSlug]/host/rsvps/page.tsx
apps/coucou/__tests__/events-page.test.tsx
apps/coucou/__tests__/host-page.test.tsx
apps/coucou/__tests__/host-rsvps-status-management.test.tsx
```

---

## 7. Acceptance criteria

- [ ] The dashboard body uses the new Linear dark tokens (`maison-linear`) and the Geist font stack.
- [ ] The persistent global search bar is removed; the command palette is invoked only by `⌘K` and a small sidebar hint.
- [ ] The sidebar is flat: no heavy group labels, no footer toggle, compact nav items, workspace switcher in the header.
- [ ] Every host page uses `DashboardTitleBar` with a breadcrumb instead of the old `PageHeader`.
- [ ] The events list defaults to a Linear-style dense row with a bottom border, status dot badge, and hover-revealed actions.
- [ ] The event detail page renders in a two-column layout: main form on the left, sticky property panel on the right.
- [ ] Event lifecycle, sharing, and system metadata are moved into the property panel.
- [ ] `StatusBadge` renders as a small dot + label with no heavy background.
- [ ] All buttons use `active:scale-[0.96]` and focus rings are visible on the dark theme.
- [ ] Tabular numbers are used for counts and dates.
- [ ] `bun lint` passes with no new `any` types or abbreviated variable names.
- [ ] Existing tests pass or are updated to match the new selectors/layout.

---

## 8. Open questions / decisions needed

1. **Light mode:** Should the Linear look apply to the dashboard light mode too, or keep the current Maison light theme? The Linear screenshots are dark-only; recommend keeping light mode as-is and only refining dark mode.
2. **Event detail tab count:** The current form has many tabs. Should we keep all of them in the Linear tab bar or move some sections (e.g., `Branding`, `Lineup`) into the right property panel? Recommendation: keep the most-edited sections as tabs and move read-only/config metadata to the property panel.
3. **Event card grid:** Should we keep the card grid view at all? It is useful for visual browsing. Recommendation: keep it as a secondary view toggle but default to the Linear list.
4. **User menu location:** Linear puts user/workspace controls in the sidebar. The current plan moves the avatar to the sidebar footer. Is that acceptable, or should we keep a minimal top-right avatar in the title bar?
5. **Accent color:** Linear uses a muted indigo for selection. The current brand may not support this. Should we introduce a neutral accent or keep the existing brand color for primary actions?

---

## 9. Suggested first PR

**Phase 1 + Phase 2** together: introduce the Linear tokens, flatten the shell (new title bar, quiet sidebar, removed top-bar search), and convert the events list to dense rows. This gives the biggest visual shift before tackling the more complex event detail page refactor. The event detail refactor can be a second PR.
