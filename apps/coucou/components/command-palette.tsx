"use client";

import { api } from "@convex/_generated/api";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandLoading,
  CommandSeparator,
} from "cmdk";
import { useQuery } from "convex/react";
import {
  Calendar,
  DoorOpen,
  Home,
  Lightbulb,
  MessageSquare,
  Moon,
  Plus,
  Search,
  Settings,
  Sun,
  User,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusBadge } from "@/components/ui/status-badge";
import { useWorkspaceAccess } from "@/components/workspace-access-gate";
import { useCommandPalette } from "@/hooks/use-command-palette";
import { useDashboardAppearance } from "@/hooks/use-dashboard-appearance";
import { useDebounce } from "@/lib/hooks/use-debounce";
import { useWorkspaceOperationPath, useWorkspaceScope } from "@/lib/use-workspace-scope";
import { cn } from "@/lib/utils";
import {
  buildWorkspaceOperationPath,
  type WorkspaceOperationSurface,
} from "@/lib/workspace-config";

const ICON_CLASS = "mr-2 h-4 w-4";

interface NavigationCommandItem {
  id: string;
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  subtitle?: string;
  searchTerms?: string[];
  shortcut?: string;
  action?: () => void;
}

interface GuestSearchResult {
  detailReference: string | null;
  name: string;
  phoneObfuscated?: string;
  tags: string[];
  eventCount: number;
  latestEventName?: string;
}

function commandMatchesQuery(item: NavigationCommandItem, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  return [item.title, item.subtitle ?? "", ...(item.searchTerms ?? [])]
    .join(" ")
    .toLowerCase()
    .includes(normalizedQuery);
}

function useWorkspaceNavigationCommands(): NavigationCommandItem[] {
  const workspaceScope = useWorkspaceScope();

  return React.useMemo(() => {
    const resolve = (url: string) => {
      if (!workspaceScope) return url;
      const match = url.match(/^\/(host|door)(?:\/(.*))?$/);
      if (!match) return url;
      return buildWorkspaceOperationPath(
        workspaceScope.workspaceSlug,
        match[1] as WorkspaceOperationSurface,
        match[2] ?? "",
      );
    };

    return [
      { id: "overview", title: "Overview", url: resolve("/host"), icon: Home },
      { id: "events", title: "Events", url: resolve("/host/events"), icon: Calendar },
      { id: "guests", title: "Guests", url: resolve("/host/guests"), icon: Users },
      {
        id: "text-blasts",
        title: "Text Blasts",
        url: resolve("/host/text-blasts"),
        icon: MessageSquare,
      },
      { id: "texts", title: "Texts", url: resolve("/host/texts"), icon: MessageSquare },
      { id: "users", title: "Users", url: resolve("/host/users"), icon: User },
      { id: "analytics", title: "Analytics", url: resolve("/host/analytics"), icon: Search },
      { id: "door-scan", title: "Door Scan", url: resolve("/door/scan"), icon: DoorOpen },
      { id: "door-list", title: "Door List", url: resolve("/door/list"), icon: DoorOpen },
      { id: "developers", title: "Developers", url: resolve("/host/developers"), icon: Settings },
      { id: "settings", title: "Settings", url: resolve("/host/settings"), icon: Settings },
    ];
  }, [workspaceScope]);
}

function useEventCommands(): NavigationCommandItem[] {
  const workspaceScope = useWorkspaceScope();
  const events = useQuery(
    api.events.listAll,
    workspaceScope ? { ...workspaceScope.queryArgs } : "skip",
  );
  const eventsPath = useWorkspaceOperationPath("host", "events");

  return React.useMemo(() => {
    if (!events || events.length === 0) return [];
    return events.map((event) => {
      const formattedEventDate = event.eventDate
        ? new Date(event.eventDate).toLocaleDateString()
        : "";
      const subtitleParts = [event.secondaryTitle, event.location, formattedEventDate].filter(
        (value): value is string => Boolean(value),
      );
      const searchTerms = [
        event.secondaryTitle,
        event.location,
        event.productionCompany,
        formattedEventDate,
        ...(event.hosts ?? []),
        ...(event.acts ?? []).map((act) => act.name),
      ].filter((value): value is string => Boolean(value));

      return {
        id: `event-${event._id}`,
        title: event.name || "Untitled event",
        subtitle: subtitleParts.join(" · "),
        searchTerms,
        url: `${eventsPath}/${event._id}`,
        icon: Calendar,
      };
    });
  }, [events, eventsPath]);
}

function useGuestCommands(
  searchQuery: string,
  isSearchEnabled: boolean,
): { commands: NavigationCommandItem[]; isLoading: boolean } {
  const workspaceScope = useWorkspaceScope();
  const usersPath = useWorkspaceOperationPath("host", "users");
  const guestSearchResults = useQuery(
    api.guestDirectory.searchGuestDirectory,
    workspaceScope && isSearchEnabled && searchQuery
      ? {
          ...workspaceScope.queryArgs,
          searchText: searchQuery,
          limit: 8,
        }
      : "skip",
  ) as GuestSearchResult[] | undefined;

  const commands = React.useMemo(() => {
    if (!guestSearchResults) return [];
    return guestSearchResults.flatMap((guest) => {
      if (!guest.detailReference) return [];
      const eventCountLabel = `${guest.eventCount} event${guest.eventCount === 1 ? "" : "s"}`;
      const subtitle = [guest.phoneObfuscated, guest.latestEventName, eventCountLabel]
        .filter(Boolean)
        .join(" · ");

      return [
        {
          id: `guest-${guest.detailReference}`,
          title: guest.name,
          subtitle,
          searchTerms: [guest.phoneObfuscated ?? "", guest.latestEventName ?? "", ...guest.tags],
          url: `${usersPath}/${encodeURIComponent(guest.detailReference)}`,
          icon: User,
        },
      ];
    });
  }, [guestSearchResults, usersPath]);

  return {
    commands,
    isLoading:
      Boolean(workspaceScope && isSearchEnabled && searchQuery) && guestSearchResults === undefined,
  };
}

function useQuickActionCommands(): NavigationCommandItem[] {
  const { isLightModeEnabled, toggleDashboardAppearance } = useDashboardAppearance();
  const newEventPath = useWorkspaceOperationPath("host", "new");
  const textBlastsPath = useWorkspaceOperationPath("host", "text-blasts");
  const rsvpsPath = useWorkspaceOperationPath("host", "rsvps");

  return React.useMemo(
    () => [
      {
        id: "new-event",
        title: "New Event",
        url: newEventPath,
        icon: Plus,
      },
      {
        id: "send-text-blast",
        title: "Send Text Blast",
        url: textBlastsPath,
        icon: MessageSquare,
      },
      {
        id: "export-rsvps",
        title: "Export guests",
        url: `${rsvpsPath}?export=open`,
        icon: User,
      },
      {
        id: "toggle-theme",
        title: isLightModeEnabled ? "Switch to dark mode" : "Switch to light mode",
        url: "#theme",
        icon: isLightModeEnabled ? Moon : Sun,
        action: toggleDashboardAppearance,
      },
      {
        id: "keyboard-shortcuts",
        title: "Keyboard shortcuts",
        url: "#help",
        icon: Lightbulb,
        searchTerms: ["help"],
      },
    ],
    [isLightModeEnabled, newEventPath, textBlastsPath, rsvpsPath, toggleDashboardAppearance],
  );
}

interface HelpDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

function HelpDialog({ isOpen, onClose }: HelpDialogProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[var(--surface-2)] text-[var(--text-primary)] border-[var(--border-subtle)]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">Keyboard shortcuts</DialogTitle>
          <DialogDescription className="text-[var(--text-secondary)]">
            Speed up your workflow with these shortcuts.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-4">
          {[
            { keys: "⌘ K", description: "Open the command palette" },
            { keys: "⌘ B", description: "Toggle sidebar" },
          ].map((shortcut) => (
            <div key={shortcut.keys} className="flex items-center justify-between">
              <span className="text-sm text-[var(--text-secondary)]">{shortcut.description}</span>
              <kbd className="rounded border border-[var(--border-subtle)] bg-[var(--surface-1)] px-2 py-0.5 text-xs font-mono text-[var(--text-primary)]">
                {shortcut.keys}
              </kbd>
            </div>
          ))}
        </div>
        <Button variant="outline" onClick={onClose} className="w-full">
          Close
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function CommandResultContent({
  item,
  badgeLabel,
}: {
  item: NavigationCommandItem;
  badgeLabel?: string;
}) {
  return (
    <>
      <item.icon className={ICON_CLASS} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate">{item.title}</span>
        {item.subtitle ? (
          <span className="truncate text-xs text-[var(--text-secondary)]">{item.subtitle}</span>
        ) : null}
      </span>
      {item.shortcut ? (
        <kbd className="rounded border border-[var(--border-subtle)] bg-[var(--surface-1)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--text-tertiary)]">
          {item.shortcut}
        </kbd>
      ) : null}
      {badgeLabel ? <StatusBadge variant="default" label={badgeLabel} showDot={false} /> : null}
    </>
  );
}

function CommandPalette() {
  const router = useRouter();
  const { isOpen, close } = useCommandPalette();
  const [query, setQuery] = React.useState("");
  const [isHelpOpen, setIsHelpOpen] = React.useState(false);
  const normalizedQuery = query.trim().toLowerCase();
  const debouncedSearchQuery = useDebounce(normalizedQuery, 180);
  const workspaceAccess = useWorkspaceAccess();
  const navigationCommands = useWorkspaceNavigationCommands();
  const eventCommands = useEventCommands();
  const quickActionCommands = useQuickActionCommands();
  const guestSearch = useGuestCommands(
    debouncedSearchQuery,
    isOpen && workspaceAccess?.canWrite === true,
  );
  const guestCommands = debouncedSearchQuery === normalizedQuery ? guestSearch.commands : [];
  const isGuestSearchLoading =
    Boolean(normalizedQuery) && (debouncedSearchQuery !== normalizedQuery || guestSearch.isLoading);

  const runCommand = React.useCallback(
    (command: NavigationCommandItem) => {
      setQuery("");
      if (command.action) {
        command.action();
        close();
        return;
      }
      if (command.url === "#help") {
        setIsHelpOpen(true);
        close();
        return;
      }
      router.push(command.url);
      close();
    },
    [router, close],
  );

  const filteredEvents = React.useMemo(() => {
    if (!normalizedQuery) return eventCommands.slice(0, 8);
    return eventCommands
      .filter((event) => commandMatchesQuery(event, normalizedQuery))
      .slice(0, 10);
  }, [eventCommands, normalizedQuery]);

  const filteredNavigation = React.useMemo(
    () => navigationCommands.filter((item) => commandMatchesQuery(item, normalizedQuery)),
    [navigationCommands, normalizedQuery],
  );

  const filteredQuickActions = React.useMemo(
    () => quickActionCommands.filter((item) => commandMatchesQuery(item, normalizedQuery)),
    [quickActionCommands, normalizedQuery],
  );

  const hasResults =
    filteredNavigation.length > 0 ||
    filteredEvents.length > 0 ||
    guestCommands.length > 0 ||
    filteredQuickActions.length > 0;

  return (
    <>
      <CommandDialog
        open={isOpen}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setQuery("");
            close();
          }
        }}
        shouldFilter={false}
        className={cn(
          "fixed left-1/2 top-1/2 z-50 grid w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 gap-0 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-2)] p-0 outline-none",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        )}
      >
        <span className="sr-only">Command palette</span>
        <span className="sr-only">
          Search workspace navigation, events, event locations, guests, and quick actions.
        </span>
        <CommandInput
          placeholder="Search events, locations, guests, or commands…"
          value={query}
          onValueChange={setQuery}
          className="flex h-14 w-full border-b border-[var(--border-subtle)] bg-transparent px-4 text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none"
        />
        <CommandList className="max-h-[60vh] overflow-y-auto p-2">
          {!hasResults && !isGuestSearchLoading ? (
            <CommandEmpty className="py-6 text-center text-sm text-[var(--text-secondary)]">
              No results found.
            </CommandEmpty>
          ) : null}

          {filteredNavigation.length > 0 ? (
            <CommandGroup heading="Navigation" className="text-[var(--text-tertiary)]">
              {filteredNavigation.map((item) => (
                <CommandItem
                  key={item.id}
                  value={item.title}
                  onSelect={() => runCommand(item)}
                  className="flex cursor-pointer items-center rounded-md px-2 py-2 text-[var(--text-primary)] aria-selected:bg-[var(--surface-3)] aria-selected:text-[var(--text-primary)]"
                >
                  <CommandResultContent item={item} />
                </CommandItem>
              ))}
            </CommandGroup>
          ) : null}

          {filteredEvents.length > 0 ? (
            <>
              {filteredNavigation.length > 0 ? (
                <CommandSeparator className="my-2 h-px bg-[var(--border-subtle)]" />
              ) : null}
              <CommandGroup heading="Events" className="text-[var(--text-tertiary)]">
                {filteredEvents.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.title}
                    onSelect={() => runCommand(item)}
                    className="flex cursor-pointer items-center rounded-md px-2 py-2 text-[var(--text-primary)] aria-selected:bg-[var(--surface-3)] aria-selected:text-[var(--text-primary)]"
                  >
                    <CommandResultContent item={item} badgeLabel="Event" />
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : null}

          {guestCommands.length > 0 ? (
            <>
              {filteredNavigation.length > 0 || filteredEvents.length > 0 ? (
                <CommandSeparator className="my-2 h-px bg-[var(--border-subtle)]" />
              ) : null}
              <CommandGroup heading="Guests" className="text-[var(--text-tertiary)]">
                {guestCommands.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.id}
                    onSelect={() => runCommand(item)}
                    className="flex cursor-pointer items-center rounded-md px-2 py-2 text-[var(--text-primary)] aria-selected:bg-[var(--surface-3)] aria-selected:text-[var(--text-primary)]"
                  >
                    <CommandResultContent item={item} badgeLabel="Guest" />
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : null}

          {isGuestSearchLoading ? (
            <CommandLoading className="px-2 py-3 text-xs text-[var(--text-secondary)]">
              Searching guests…
            </CommandLoading>
          ) : null}

          {filteredQuickActions.length > 0 ? (
            <>
              {filteredNavigation.length > 0 ||
              filteredEvents.length > 0 ||
              guestCommands.length > 0 ? (
                <CommandSeparator className="my-2 h-px bg-[var(--border-subtle)]" />
              ) : null}
              <CommandGroup heading="Quick Actions" className="text-[var(--text-tertiary)]">
                {filteredQuickActions.map((item) => (
                  <CommandItem
                    key={item.id}
                    value={item.title}
                    onSelect={() => runCommand(item)}
                    className="flex cursor-pointer items-center rounded-md px-2 py-2 text-[var(--text-primary)] aria-selected:bg-[var(--surface-3)] aria-selected:text-[var(--text-primary)]"
                  >
                    <CommandResultContent item={item} />
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          ) : null}
        </CommandList>
      </CommandDialog>
      <HelpDialog isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
    </>
  );
}

export { CommandPalette };
