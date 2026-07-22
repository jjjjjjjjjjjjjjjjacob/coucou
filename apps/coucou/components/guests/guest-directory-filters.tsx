"use client";

import { ChevronDown, Search } from "lucide-react";
import React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Chip, ChipGroup } from "@/components/ui/chip-group";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectOption } from "@/components/ui/select";
import {
  countActiveGuestDirectoryFilters,
  createDefaultGuestDirectoryFilterState,
  DEFAULT_STATUS_FILTER,
  describeRecipientFilter,
  type GuestDirectoryFilterState,
  RECIPIENT_FILTER_LABELS,
  RECIPIENT_STATUS_LABELS,
  type RecipientApprovalStatus,
  type RecipientFilterState,
  type RecipientFilterType,
} from "@/lib/text-blast-filters";

export interface GuestDirectoryEventOption {
  eventId: string;
  eventName: string;
  eventDate: number;
}

export interface GuestDirectoryBlastOption {
  id: string;
  name: string;
  deliveryTrackingEnabled: boolean;
  status: string;
}

export interface GuestDirectoryFiltersProps {
  value: GuestDirectoryFilterState;
  onChange: (nextState: GuestDirectoryFilterState) => void;
  variant: "full" | "compact";
  eventOptions: GuestDirectoryEventOption[];
  blastOptions: GuestDirectoryBlastOption[];
  tagOptions: string[];
  defaultListKeyOptions: string[];
  customFieldOptions: Array<{ key: string; label: string }>;
  disabled?: boolean;
}

interface MultiSelectPopoverProps {
  label: string;
  selectedCount: number;
  children: React.ReactNode;
  disabled?: boolean;
}

function MultiSelectPopover({ label, selectedCount, children, disabled }: MultiSelectPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled}
          className="justify-between gap-2 border-[var(--border-subtle)] text-xs font-normal"
        >
          <span>{label}</span>
          {selectedCount > 0 ? (
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
              {selectedCount}
            </Badge>
          ) : null}
          <ChevronDown className="h-3.5 w-3.5 text-[var(--text-secondary)]" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="max-h-72 w-64 overflow-y-auto p-2">
        {children}
      </PopoverContent>
    </Popover>
  );
}

interface CheckboxOptionRowProps {
  label: React.ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}

function CheckboxOptionRow({ label, checked, onCheckedChange, disabled }: CheckboxOptionRowProps) {
  return (
    <label
      className={
        "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-3)]" +
        (disabled ? " cursor-not-allowed opacity-60" : "")
      }
    >
      <Checkbox
        checked={checked}
        disabled={disabled}
        onCheckedChange={(checkedState) => onCheckedChange(checkedState === true)}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </label>
  );
}

function toggleValueInList(values: string[], value: string, include: boolean): string[] {
  if (include) {
    return values.includes(value) ? values : [...values, value];
  }
  return values.filter((existingValue) => existingValue !== value);
}

export function GuestDirectoryFilters({
  value,
  onChange,
  variant,
  eventOptions,
  blastOptions,
  tagOptions,
  defaultListKeyOptions,
  customFieldOptions,
  disabled,
}: GuestDirectoryFiltersProps) {
  const isFullVariant = variant === "full";

  const updateFilterState = (partialState: Partial<GuestDirectoryFilterState>) => {
    onChange({ ...value, ...partialState });
  };

  const updateRecipientFilterType = (nextType: RecipientFilterType) => {
    let nextRecipientFilter: RecipientFilterState;
    switch (nextType) {
      case "status":
        nextRecipientFilter = { type: "status", status: DEFAULT_STATUS_FILTER };
        break;
      case "custom_field_missing":
        nextRecipientFilter = {
          type: "custom_field_missing",
          fieldKey: customFieldOptions[0]?.key ?? "",
        };
        break;
      case "rsvp_before":
        nextRecipientFilter = { type: "rsvp_before", isoDateTime: "" };
        break;
      case "previous_approved_not_rsvped":
        nextRecipientFilter = { type: "previous_approved_not_rsvped", excludedEventId: "" };
        break;
      default:
        nextRecipientFilter = { type: nextType };
        break;
    }
    updateFilterState({ recipientFilter: nextRecipientFilter });
  };

  const selectableBlastOptions = blastOptions.filter(
    (blastOption) =>
      blastOption.deliveryTrackingEnabled &&
      (blastOption.status === "sent" || blastOption.status === "failed"),
  );

  const activeFilterCount = countActiveGuestDirectoryFilters(value);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {isFullVariant ? (
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-[var(--text-secondary)]" />
            <Input
              placeholder="Search guests..."
              value={value.searchText}
              disabled={disabled}
              onChange={(changeEvent) =>
                updateFilterState({ searchText: changeEvent.target.value })
              }
              className="pl-8"
            />
          </div>
        ) : null}

        <MultiSelectPopover
          label="Events"
          selectedCount={value.eventIds.length}
          disabled={disabled || eventOptions.length === 0}
        >
          {eventOptions.map((eventOption) => (
            <CheckboxOptionRow
              key={eventOption.eventId}
              label={eventOption.eventName}
              checked={value.eventIds.includes(eventOption.eventId)}
              onCheckedChange={(checked) =>
                updateFilterState({
                  eventIds: toggleValueInList(value.eventIds, eventOption.eventId, checked),
                })
              }
            />
          ))}
        </MultiSelectPopover>

        <Select
          value={value.recipientFilter.type}
          disabled={disabled}
          onValueChange={(nextValue) => updateRecipientFilterType(nextValue as RecipientFilterType)}
          className="w-56"
        >
          {(Object.keys(RECIPIENT_FILTER_LABELS) as RecipientFilterType[]).map((filterType) => (
            <SelectOption
              key={filterType}
              value={filterType}
              disabled={filterType === "custom_field_missing" && customFieldOptions.length === 0}
            >
              {RECIPIENT_FILTER_LABELS[filterType]}
            </SelectOption>
          ))}
        </Select>

        {value.recipientFilter.type === "status" ? (
          <Select
            value={value.recipientFilter.status}
            disabled={disabled}
            onValueChange={(nextValue) =>
              updateFilterState({
                recipientFilter: {
                  type: "status",
                  status: nextValue as RecipientApprovalStatus,
                },
              })
            }
            className="w-32"
          >
            {(Object.keys(RECIPIENT_STATUS_LABELS) as RecipientApprovalStatus[]).map(
              (statusOption) => (
                <SelectOption key={statusOption} value={statusOption}>
                  {RECIPIENT_STATUS_LABELS[statusOption]}
                </SelectOption>
              ),
            )}
          </Select>
        ) : null}

        {value.recipientFilter.type === "custom_field_missing" ? (
          <Select
            value={value.recipientFilter.fieldKey}
            disabled={disabled}
            onValueChange={(nextValue) =>
              updateFilterState({
                recipientFilter: { type: "custom_field_missing", fieldKey: nextValue },
              })
            }
            className="w-44"
          >
            <SelectOption value="">Select field…</SelectOption>
            {customFieldOptions.map((customFieldOption) => (
              <SelectOption key={customFieldOption.key} value={customFieldOption.key}>
                {customFieldOption.label}
              </SelectOption>
            ))}
          </Select>
        ) : null}

        {value.recipientFilter.type === "rsvp_before" ? (
          <Input
            type="datetime-local"
            value={value.recipientFilter.isoDateTime}
            disabled={disabled}
            onChange={(changeEvent) =>
              updateFilterState({
                recipientFilter: { type: "rsvp_before", isoDateTime: changeEvent.target.value },
              })
            }
            className="w-56"
          />
        ) : null}

        {value.recipientFilter.type === "previous_approved_not_rsvped" ? (
          <Select
            value={value.recipientFilter.excludedEventId}
            disabled={disabled}
            onValueChange={(nextValue) =>
              updateFilterState({
                recipientFilter: {
                  type: "previous_approved_not_rsvped",
                  excludedEventId: nextValue,
                },
              })
            }
            className="w-52"
          >
            <SelectOption value="">Exclude event…</SelectOption>
            {eventOptions.map((eventOption) => (
              <SelectOption key={eventOption.eventId} value={eventOption.eventId}>
                {eventOption.eventName}
              </SelectOption>
            ))}
          </Select>
        ) : null}

        <Select
          value={value.recipientHistoryFilter.type}
          disabled={disabled}
          onValueChange={(nextValue) => {
            if (nextValue === "none") {
              updateFilterState({ recipientHistoryFilter: { type: "none", textBlastIds: [] } });
              return;
            }
            updateFilterState({
              recipientHistoryFilter: {
                type: nextValue as "received_any" | "not_received_any",
                textBlastIds:
                  value.recipientHistoryFilter.type === "none"
                    ? []
                    : value.recipientHistoryFilter.textBlastIds,
              },
            });
          }}
          className="w-52"
        >
          <SelectOption value="none">Any text history</SelectOption>
          <SelectOption value="received_any">Has received any of…</SelectOption>
          <SelectOption value="not_received_any">Has not received any of…</SelectOption>
        </Select>

        {value.recipientHistoryFilter.type !== "none" ? (
          <MultiSelectPopover
            label="Blasts"
            selectedCount={value.recipientHistoryFilter.textBlastIds.length}
            disabled={disabled || selectableBlastOptions.length === 0}
          >
            {selectableBlastOptions.map((blastOption) => {
              const historyFilterType = value.recipientHistoryFilter.type;
              const selectedTextBlastIds: string[] = value.recipientHistoryFilter.textBlastIds;
              if (historyFilterType === "none") return null;
              return (
                <CheckboxOptionRow
                  key={blastOption.id}
                  label={blastOption.name}
                  checked={selectedTextBlastIds.includes(blastOption.id)}
                  onCheckedChange={(checked) => {
                    updateFilterState({
                      recipientHistoryFilter: {
                        type: historyFilterType,
                        textBlastIds: toggleValueInList(
                          selectedTextBlastIds,
                          blastOption.id,
                          checked,
                        ),
                      },
                    });
                  }}
                />
              );
            })}
            {selectableBlastOptions.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-[var(--text-secondary)]">
                No delivery-tracked sent blasts yet.
              </p>
            ) : null}
          </MultiSelectPopover>
        ) : null}

        {isFullVariant ? (
          <>
            <Select
              value={value.smsConsentFilter}
              disabled={disabled}
              onValueChange={(nextValue) =>
                updateFilterState({
                  smsConsentFilter: nextValue as GuestDirectoryFilterState["smsConsentFilter"],
                })
              }
              className="w-44"
            >
              <SelectOption value="any">Any SMS consent</SelectOption>
              <SelectOption value="consented">SMS consented</SelectOption>
              <SelectOption value="not_consented">No SMS consent</SelectOption>
            </Select>

            <Select
              value={value.rsvpedToLatestEvent}
              disabled={disabled}
              onValueChange={(nextValue) =>
                updateFilterState({
                  rsvpedToLatestEvent:
                    nextValue as GuestDirectoryFilterState["rsvpedToLatestEvent"],
                })
              }
              className="w-52"
            >
              <SelectOption value="any">Latest event: any</SelectOption>
              <SelectOption value="yes">RSVP'd to latest event</SelectOption>
              <SelectOption value="no">Missed latest event</SelectOption>
            </Select>

            <MultiSelectPopover
              label="Tags"
              selectedCount={value.tags.length}
              disabled={disabled || tagOptions.length === 0}
            >
              {tagOptions.map((tagOption) => (
                <CheckboxOptionRow
                  key={tagOption}
                  label={tagOption}
                  checked={value.tags.includes(tagOption)}
                  onCheckedChange={(checked) =>
                    updateFilterState({ tags: toggleValueInList(value.tags, tagOption, checked) })
                  }
                />
              ))}
              {tagOptions.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-[var(--text-secondary)]">No tags yet.</p>
              ) : null}
            </MultiSelectPopover>

            <MultiSelectPopover
              label="Default list"
              selectedCount={value.defaultListKeys.length}
              disabled={disabled || defaultListKeyOptions.length === 0}
            >
              {defaultListKeyOptions.map((listKeyOption) => (
                <CheckboxOptionRow
                  key={listKeyOption}
                  label={listKeyOption}
                  checked={value.defaultListKeys.includes(listKeyOption)}
                  onCheckedChange={(checked) =>
                    updateFilterState({
                      defaultListKeys: toggleValueInList(
                        value.defaultListKeys,
                        listKeyOption,
                        checked,
                      ),
                    })
                  }
                />
              ))}
            </MultiSelectPopover>

            <Select
              value={`${value.sortBy}:${value.sortDirection}`}
              disabled={disabled}
              onValueChange={(nextValue) => {
                const [sortBy, sortDirection] = nextValue.split(":");
                updateFilterState({
                  sortBy: sortBy as GuestDirectoryFilterState["sortBy"],
                  sortDirection: sortDirection as GuestDirectoryFilterState["sortDirection"],
                });
              }}
              className="w-52"
            >
              <SelectOption value="latestRsvpAt:desc">Latest RSVP (newest)</SelectOption>
              <SelectOption value="latestRsvpAt:asc">Latest RSVP (oldest)</SelectOption>
              <SelectOption value="firstRsvpAt:desc">First RSVP (newest)</SelectOption>
              <SelectOption value="firstRsvpAt:asc">First RSVP (oldest)</SelectOption>
              <SelectOption value="name:asc">Name (A–Z)</SelectOption>
              <SelectOption value="name:desc">Name (Z–A)</SelectOption>
              <SelectOption value="eventCount:desc">Most events</SelectOption>
              <SelectOption value="eventCount:asc">Fewest events</SelectOption>
            </Select>

            {activeFilterCount > 0 ? (
              <Button
                size="sm"
                variant="outline"
                disabled={disabled}
                onClick={() => onChange(createDefaultGuestDirectoryFilterState())}
                className="border-[var(--border-subtle)] text-xs"
              >
                Clear All
              </Button>
            ) : null}
          </>
        ) : null}
      </div>

      {isFullVariant && activeFilterCount > 0 ? (
        <ChipGroup aria-label="Active guest filters">
          {value.searchText.trim() ? (
            <Chip
              label={`Search: “${value.searchText.trim()}”`}
              onRemove={() => updateFilterState({ searchText: "" })}
              removeLabel="Clear search"
            />
          ) : null}
          {value.eventIds.length > 0 ? (
            <Chip
              label={`Events: ${value.eventIds.length}`}
              onRemove={() => updateFilterState({ eventIds: [] })}
              removeLabel="Clear event filter"
            />
          ) : null}
          {value.recipientFilter.type !== "all" ? (
            <Chip
              label={describeRecipientFilter(value.recipientFilter, {
                resolveCustomFieldLabel: (fieldKey) =>
                  customFieldOptions.find((customFieldOption) => customFieldOption.key === fieldKey)
                    ?.label,
              })}
              onRemove={() => updateFilterState({ recipientFilter: { type: "all" } })}
              removeLabel="Clear audience segment"
            />
          ) : null}
          {value.recipientHistoryFilter.type !== "none" ? (
            <Chip
              label={
                value.recipientHistoryFilter.type === "received_any"
                  ? `Received any of ${value.recipientHistoryFilter.textBlastIds.length} blasts`
                  : `Not received any of ${value.recipientHistoryFilter.textBlastIds.length} blasts`
              }
              onRemove={() =>
                updateFilterState({ recipientHistoryFilter: { type: "none", textBlastIds: [] } })
              }
              removeLabel="Clear text history filter"
            />
          ) : null}
          {value.smsConsentFilter !== "any" ? (
            <Chip
              label={value.smsConsentFilter === "consented" ? "SMS consented" : "No SMS consent"}
              onRemove={() => updateFilterState({ smsConsentFilter: "any" })}
              removeLabel="Clear SMS consent filter"
            />
          ) : null}
          {value.rsvpedToLatestEvent !== "any" ? (
            <Chip
              label={
                value.rsvpedToLatestEvent === "yes"
                  ? "RSVP'd to latest event"
                  : "Missed latest event"
              }
              onRemove={() => updateFilterState({ rsvpedToLatestEvent: "any" })}
              removeLabel="Clear latest event filter"
            />
          ) : null}
          {value.tags.map((tag) => (
            <Chip
              key={tag}
              label={`Tag: ${tag}`}
              onRemove={() =>
                updateFilterState({ tags: value.tags.filter((existingTag) => existingTag !== tag) })
              }
              removeLabel={`Remove tag filter ${tag}`}
            />
          ))}
          {value.defaultListKeys.map((listKey) => (
            <Chip
              key={listKey}
              label={`List: ${listKey}`}
              onRemove={() =>
                updateFilterState({
                  defaultListKeys: value.defaultListKeys.filter(
                    (existingListKey) => existingListKey !== listKey,
                  ),
                })
              }
              removeLabel={`Remove list filter ${listKey}`}
            />
          ))}
        </ChipGroup>
      ) : null}
    </div>
  );
}
