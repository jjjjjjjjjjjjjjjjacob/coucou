"use client";

import {
  CheckCircle,
  Copy,
  Edit,
  ExternalLink,
  EyeOff,
  MoreHorizontal,
  QrCode,
  Share,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { ShareEventPopover } from "@/components/share-event-popover";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Event } from "@/lib/types";
import { useWorkspaceScope } from "@/lib/use-workspace-scope";

interface EventListRowActionsProps {
  event: Event;
  isDraft: boolean;
  publicEventUrl: string | null;
  lifecycleActionLabel: string;
  onView: () => void;
  onTogglePublish: () => Promise<void>;
  onSetFeatured: () => Promise<void>;
  onDelete: () => void;
}

export function EventListRowActions({
  event,
  isDraft,
  publicEventUrl,
  lifecycleActionLabel,
  onView,
  onTogglePublish,
  onSetFeatured,
  onDelete,
}: EventListRowActionsProps) {
  const workspaceScope = useWorkspaceScope();
  const [copied, setCopied] = useState(false);

  const handleCopyUrl = async () => {
    if (!publicEventUrl) return;
    try {
      await navigator.clipboard.writeText(publicEventUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <>
      <div className="flex items-center gap-1">
        {publicEventUrl ? (
          <ShareEventPopover
            eventId={event._id}
            eventUrl={publicEventUrl}
            siteKey={workspaceScope?.siteKey}
            workspaceSlug={workspaceScope?.workspaceSlug}
          >
            <Button
              variant="outline"
              size="sm"
              className="size-8 border-[var(--border-subtle)] bg-transparent"
              aria-label="Share event"
            >
              <Share className="h-4 w-4" />
            </Button>
          </ShareEventPopover>
        ) : null}

        <Button
          variant="outline"
          size="sm"
          className="hidden border-[var(--border-subtle)] bg-transparent sm:inline-flex"
          onClick={onView}
        >
          {isDraft ? (
            <>
              <Edit className="h-4 w-4" /> Edit
            </>
          ) : (
            <>
              <ExternalLink className="h-4 w-4" /> View
            </>
          )}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="size-8 border-[var(--border-subtle)] bg-transparent"
              aria-label="Open event actions"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-56 border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-primary)]"
          >
            <DropdownMenuItem
              onSelect={(selectEvent) => {
                selectEvent.preventDefault();
                onView();
              }}
            >
              {isDraft ? (
                <Edit className="mr-2 h-4 w-4" />
              ) : (
                <ExternalLink className="mr-2 h-4 w-4" />
              )}
              {isDraft ? "Continue editing" : "View public page"}
            </DropdownMenuItem>

            {publicEventUrl ? (
              <>
                <DropdownMenuItem
                  onSelect={(selectEvent) => {
                    selectEvent.preventDefault();
                    void handleCopyUrl();
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  {copied ? "Copied" : "Copy public URL"}
                </DropdownMenuItem>
                <DropdownMenuSeparator className="bg-[var(--border-subtle)]" />
              </>
            ) : null}

            <DropdownMenuItem
              onSelect={(selectEvent) => {
                selectEvent.preventDefault();
                void onTogglePublish();
              }}
            >
              {isDraft ? (
                <CheckCircle className="mr-2 h-4 w-4" />
              ) : (
                <EyeOff className="mr-2 h-4 w-4" />
              )}
              {lifecycleActionLabel}
            </DropdownMenuItem>

            <DropdownMenuItem
              disabled={event.isFeatured}
              onSelect={(selectEvent) => {
                selectEvent.preventDefault();
                void onSetFeatured();
              }}
            >
              <QrCode className="mr-2 h-4 w-4" />
              {event.isFeatured ? "Already featured" : "Set as featured"}
            </DropdownMenuItem>

            <DropdownMenuSeparator className="bg-[var(--border-subtle)]" />

            <DropdownMenuItem
              variant="destructive"
              onSelect={(selectEvent) => {
                selectEvent.preventDefault();
                onDelete();
              }}
            >
              <Trash2 className="mr-2 h-4 w-4" /> Delete event
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
