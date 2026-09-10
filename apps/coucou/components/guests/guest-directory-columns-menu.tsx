"use client";

import { Columns3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  GUEST_DIRECTORY_COLUMN_LABELS,
  GUEST_DIRECTORY_TOGGLEABLE_COLUMN_IDS,
} from "@/lib/guest-directory-columns";
import type { DashboardTableColumnLayout } from "@/lib/hooks/use-dashboard-table-column-layout";

export function GuestDirectoryColumnsMenu({
  columnLayout,
}: {
  columnLayout: DashboardTableColumnLayout;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="border-[var(--border-subtle)] text-xs">
          <Columns3 className="mr-1.5 h-3.5 w-3.5" />
          Columns
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-96 w-56 overflow-y-auto p-2">
        {columnLayout.columnOrder
          .filter((columnId) =>
            GUEST_DIRECTORY_TOGGLEABLE_COLUMN_IDS.some((identifier) => identifier === columnId),
          )
          .map((columnId) => (
            <label
              key={columnId}
              className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-3)]"
            >
              <Checkbox
                checked={!columnLayout.hiddenColumnIds.includes(columnId)}
                onCheckedChange={(checkedState) =>
                  columnLayout.setHiddenColumnIds(
                    checkedState === true
                      ? columnLayout.hiddenColumnIds.filter((hiddenId) => hiddenId !== columnId)
                      : [...columnLayout.hiddenColumnIds, columnId],
                  )
                }
              />
              {GUEST_DIRECTORY_COLUMN_LABELS[columnId]}
            </label>
          ))}
      </PopoverContent>
    </Popover>
  );
}
