"use client";

import { CheckCircle, Copy, Edit, ExternalLink, EyeOff, QrCode, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";
import type { Event } from "@/lib/types";

interface EventContextMenuProps {
  event: Event;
  isDraft: boolean;
  publicEventUrl: string | null;
  lifecycleActionLabel: "Publish" | "Unpublish";
  onOpenDetails: () => void;
  onView: () => void;
  onDuplicateToDraft: () => void | Promise<void>;
  onTogglePublish: () => void | Promise<void>;
  onSetFeatured: () => void | Promise<void>;
  onDelete: () => void;
  onSendQrCodes?: () => void | Promise<void>;
  sendingQrCodes?: boolean;
  pendingQrCount?: number;
  isDuplicating?: boolean;
}

export function EventContextMenu({
  event,
  isDraft,
  publicEventUrl,
  lifecycleActionLabel,
  onOpenDetails,
  onView,
  onDuplicateToDraft,
  onTogglePublish,
  onSetFeatured,
  onDelete,
  onSendQrCodes,
  sendingQrCodes = false,
  pendingQrCount = 0,
  isDuplicating = false,
}: EventContextMenuProps) {
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
    <ContextMenuContent className="w-56 border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-primary)] shadow-[var(--shadow-card)]">
      <ContextMenuItem onSelect={onOpenDetails}>
        <Edit className="h-4 w-4" />
        Configure event
      </ContextMenuItem>

      <ContextMenuItem
        onSelect={(selectEvent) => {
          selectEvent.preventDefault();
          onView();
        }}
      >
        <ExternalLink className="h-4 w-4" />
        {isDraft ? "Continue editing" : "View public page"}
      </ContextMenuItem>

      {publicEventUrl ? (
        <ContextMenuItem
          onSelect={(selectEvent) => {
            selectEvent.preventDefault();
            void handleCopyUrl();
          }}
        >
          <Copy className="h-4 w-4" />
          {copied ? "Copied" : "Copy public URL"}
        </ContextMenuItem>
      ) : null}

      <ContextMenuSeparator className="bg-[var(--border-subtle)]" />

      <ContextMenuItem
        disabled={isDuplicating}
        onSelect={(selectEvent) => {
          selectEvent.preventDefault();
          void onDuplicateToDraft();
        }}
      >
        <Copy className="h-4 w-4" />
        {isDuplicating ? "Duplicating..." : "Duplicate to draft"}
      </ContextMenuItem>

      {onSendQrCodes ? (
        <>
          <ContextMenuItem
            disabled={sendingQrCodes}
            onSelect={(selectEvent) => {
              selectEvent.preventDefault();
              void onSendQrCodes();
            }}
          >
            <QrCode className="h-4 w-4" />
            {sendingQrCodes ? "Sending QR codes..." : `Send QR codes (${pendingQrCount})`}
          </ContextMenuItem>
          <ContextMenuSeparator className="bg-[var(--border-subtle)]" />
        </>
      ) : null}

      <ContextMenuItem
        onSelect={(selectEvent) => {
          selectEvent.preventDefault();
          void onTogglePublish();
        }}
      >
        {isDraft ? <CheckCircle className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        {lifecycleActionLabel}
      </ContextMenuItem>

      <ContextMenuItem
        disabled={event.isFeatured}
        onSelect={(selectEvent) => {
          selectEvent.preventDefault();
          void onSetFeatured();
        }}
      >
        <Star className="h-4 w-4" />
        {event.isFeatured ? "Featured" : "Set as featured"}
      </ContextMenuItem>

      <ContextMenuSeparator className="bg-[var(--border-subtle)]" />

      <ContextMenuItem
        variant="destructive"
        onSelect={(selectEvent) => {
          selectEvent.preventDefault();
          onDelete();
        }}
      >
        <Trash2 className="h-4 w-4" />
        Delete event
      </ContextMenuItem>
    </ContextMenuContent>
  );
}
