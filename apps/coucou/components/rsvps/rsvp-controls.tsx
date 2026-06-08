"use client";

import { QrCode } from "lucide-react";
import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import type { HostRsvp, ListCredential } from "@/lib/types";
import { cn } from "@/lib/utils";

export type ApprovalStatusOption = "pending" | "approved" | "denied";
export type AttendanceStatusOption = "yes" | "no" | "maybe";
export type TicketStatusOption = "issued" | "not-issued" | "disabled";
export type TicketDisplayStatus = TicketStatusOption | "redeemed";

export const APPROVAL_STATUS_OPTIONS: ApprovalStatusOption[] = ["pending", "approved", "denied"];
export const ATTENDANCE_STATUS_OPTIONS: AttendanceStatusOption[] = ["yes", "maybe", "no"];
export const TICKET_STATUS_OPTIONS: TicketStatusOption[] = ["not-issued", "issued", "disabled"];

export function getApprovalStatusLabel(status: ApprovalStatusOption): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function getApprovalStatusClassName(status: ApprovalStatusOption): string {
  switch (status) {
    case "approved":
      return "text-green-700 border-green-200 bg-green-50 hover:bg-green-10 hover:text-green-700";
    case "denied":
      return "text-red-700 border-red-200 bg-red-50 hover:bg-red-10 hover:text-red-700";
    case "pending":
    default:
      return "text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-10 hover:text-amber-700";
  }
}

export function getAttendanceStatusLabel(status: AttendanceStatusOption): string {
  switch (status) {
    case "yes":
      return "Yes";
    case "maybe":
      return "Maybe";
    case "no":
      return "No";
  }
}

export function getAttendanceStatusClassName(status: AttendanceStatusOption): string {
  switch (status) {
    case "yes":
      return "text-green-700 border-green-200 bg-green-50 hover:bg-green-10 hover:text-green-700";
    case "maybe":
      return "text-amber-700 border-amber-200 bg-amber-50 hover:bg-amber-10 hover:text-amber-700";
    case "no":
      return "text-red-700 border-red-200 bg-red-50 hover:bg-red-10 hover:text-red-700";
  }
}

export function getTicketStatusLabel(status: TicketDisplayStatus): string {
  switch (status) {
    case "issued":
      return "Issued";
    case "redeemed":
      return "Redeemed";
    case "disabled":
      return "Disabled";
    case "not-issued":
    default:
      return "None";
  }
}

export function getTicketStatusClassName(status: TicketDisplayStatus): string {
  switch (status) {
    case "issued":
      return "text-purple-700 border-purple-200 bg-purple-50 hover:bg-purple-10 hover:text-purple-700";
    case "redeemed":
      return "text-blue-700 border-blue-200 bg-blue-50 hover:text-blue-700 hover:bg-blue-10";
    case "disabled":
      return "text-red-700 border-red-200 bg-red-50 hover:bg-red-10 hover:text-red-700";
    case "not-issued":
    default:
      return "text-gray-700 border-gray-200 bg-gray-50";
  }
}

export function formatTicketViewedTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}

export function normalizeTicketStatus(status: HostRsvp["redemptionStatus"]): TicketDisplayStatus {
  if (status === "none") {
    return "not-issued";
  }
  return status;
}

function normalizeFieldKey(key: string): string {
  return key
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export function getHostRsvpCustomFieldValue(rsvp: HostRsvp, fieldKey: string): string {
  if (!rsvp.customFieldValues) {
    return "";
  }

  const exactValue = rsvp.customFieldValues[fieldKey];
  if (exactValue) {
    return exactValue;
  }

  const normalizedFieldKey = normalizeFieldKey(fieldKey);
  for (const [customFieldKey, customFieldValue] of Object.entries(rsvp.customFieldValues)) {
    if (normalizeFieldKey(customFieldKey) === normalizedFieldKey) {
      return customFieldValue;
    }
  }

  return "";
}

export function getHostRsvpGuestDisplayValue(rsvp: HostRsvp): string {
  const displayName = `${rsvp.firstName || ""} ${rsvp.lastName || ""}`.trim();
  return displayName || rsvp.contact?.email || rsvp.contact?.phone || "(no contact)";
}

export function getTimestampDateTimeLabels(timestamp: number): [string, string] {
  const date = new Date(timestamp);
  return [
    date.toLocaleDateString(),
    date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
  ];
}

export function stopRsvpControlInteractiveEventPropagation(event: React.SyntheticEvent): void {
  event.stopPropagation();
}

interface RsvpListKeyControlProps {
  rsvp: HostRsvp;
  isReadOnly: boolean;
  listCredentials: ListCredential[] | undefined;
  isUpdating: boolean;
  onChange: (rsvp: HostRsvp, newListKey: string) => void;
  className?: string;
}

export function RsvpListKeyControl({
  rsvp,
  isReadOnly,
  listCredentials,
  isUpdating,
  onChange,
  className,
}: RsvpListKeyControlProps) {
  const currentListKey = rsvp.listKey;
  const availableListKeys = listCredentials?.map((credential) => credential.listKey) || [];

  if (isReadOnly || availableListKeys.length <= 1) {
    return (
      <span className={cn("block max-w-full truncate", className)}>
        {currentListKey?.toUpperCase()}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="xs"
          className={cn("h-6 max-w-full min-w-0 shrink overflow-hidden px-2 text-xs", className)}
          disabled={isUpdating}
          onClick={stopRsvpControlInteractiveEventPropagation}
          onPointerDown={stopRsvpControlInteractiveEventPropagation}
        >
          {isUpdating && <Spinner className="mr-1 h-3 w-3" />}
          {!isUpdating && <span className="min-w-0 truncate">{currentListKey?.toUpperCase()}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent onClick={stopRsvpControlInteractiveEventPropagation}>
        <DropdownMenuRadioGroup
          value={currentListKey}
          onValueChange={(newListKey) => onChange(rsvp, newListKey)}
        >
          {availableListKeys.map((listKey) => (
            <DropdownMenuRadioItem key={listKey} value={listKey}>
              {listKey.toUpperCase()}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface RsvpApprovalStatusControlProps {
  rsvp: HostRsvp;
  isReadOnly: boolean;
  isUpdating: boolean;
  onChange: (rsvp: HostRsvp, value: ApprovalStatusOption) => void;
  className?: string;
}

export function RsvpApprovalStatusControl({
  rsvp,
  isReadOnly,
  isUpdating,
  onChange,
  className,
}: RsvpApprovalStatusControlProps) {
  const currentApprovalStatus = rsvp.approvalStatus;

  if (isReadOnly) {
    return (
      <Badge variant="secondary" className={cn("text-xs", className)}>
        {getApprovalStatusLabel(currentApprovalStatus)}
      </Badge>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="xs"
          className={cn(
            "max-w-full min-w-0 shrink overflow-hidden",
            getApprovalStatusClassName(currentApprovalStatus),
            className,
          )}
          disabled={isUpdating}
          onClick={stopRsvpControlInteractiveEventPropagation}
          onPointerDown={stopRsvpControlInteractiveEventPropagation}
        >
          {isUpdating && <Spinner className="mr-1 h-3 w-3" />}
          {!isUpdating && (
            <span className="min-w-0 truncate">
              {getApprovalStatusLabel(currentApprovalStatus)}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent onClick={stopRsvpControlInteractiveEventPropagation}>
        <DropdownMenuRadioGroup
          value={currentApprovalStatus}
          onValueChange={(value) => onChange(rsvp, value as ApprovalStatusOption)}
        >
          <DropdownMenuRadioItem value="pending" disabled={rsvp.redemptionStatus === "redeemed"}>
            <span className="text-amber-700">Pending</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="approved">
            <span className="text-green-700">Approved</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="denied">
            <span className="text-red-700">Denied</span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface RsvpAttendanceStatusControlProps {
  rsvp: HostRsvp;
  isReadOnly: boolean;
  isUpdating: boolean;
  onChange: (rsvp: HostRsvp, value: AttendanceStatusOption) => void;
  className?: string;
}

export function RsvpAttendanceStatusControl({
  rsvp,
  isReadOnly,
  isUpdating,
  onChange,
  className,
}: RsvpAttendanceStatusControlProps) {
  const currentAttendanceStatus = rsvp.attendanceStatus;

  if (isReadOnly) {
    return (
      <Badge
        variant="secondary"
        className={cn("text-xs", getAttendanceStatusClassName(currentAttendanceStatus), className)}
      >
        {getAttendanceStatusLabel(currentAttendanceStatus)}
      </Badge>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="xs"
          className={cn(
            "max-w-full min-w-0 shrink overflow-hidden",
            getAttendanceStatusClassName(currentAttendanceStatus),
            className,
          )}
          disabled={isUpdating}
          onClick={stopRsvpControlInteractiveEventPropagation}
          onPointerDown={stopRsvpControlInteractiveEventPropagation}
        >
          {isUpdating && <Spinner className="mr-1 h-3 w-3" />}
          {!isUpdating && (
            <span className="min-w-0 truncate">
              {getAttendanceStatusLabel(currentAttendanceStatus)}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent onClick={stopRsvpControlInteractiveEventPropagation}>
        <DropdownMenuRadioGroup
          value={currentAttendanceStatus}
          onValueChange={(value) => onChange(rsvp, value as AttendanceStatusOption)}
        >
          {ATTENDANCE_STATUS_OPTIONS.map((attendanceStatusOption) => (
            <DropdownMenuRadioItem key={attendanceStatusOption} value={attendanceStatusOption}>
              <span
                className={
                  attendanceStatusOption === "yes"
                    ? "text-green-700"
                    : attendanceStatusOption === "maybe"
                      ? "text-amber-700"
                      : "text-red-700"
                }
              >
                {getAttendanceStatusLabel(attendanceStatusOption)}
              </span>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface RsvpTicketStatusControlProps {
  rsvp: HostRsvp;
  isReadOnly: boolean;
  isUpdating: boolean;
  canEditTicketForRsvp: (rsvp: HostRsvp) => boolean;
  onChange: (rsvp: HostRsvp, value: TicketStatusOption) => void;
  onOpenQrCode: (rsvp: HostRsvp) => void;
  className?: string;
}

export function RsvpTicketStatusControl({
  rsvp,
  isReadOnly,
  isUpdating,
  canEditTicketForRsvp,
  onChange,
  onOpenQrCode,
  className,
}: RsvpTicketStatusControlProps) {
  const currentTicketStatus = normalizeTicketStatus(rsvp.redemptionStatus);
  const isRedeemed = currentTicketStatus === "redeemed";
  const ticketEditingIsAllowed = canEditTicketForRsvp(rsvp);

  if (isReadOnly) {
    const canViewQrCode =
      (currentTicketStatus === "issued" || currentTicketStatus === "redeemed") &&
      Boolean(rsvp.redemptionCode);

    return (
      <Button
        variant="outline"
        size="xs"
        className={cn(
          "max-w-full min-w-0 shrink overflow-hidden",
          getTicketStatusClassName(currentTicketStatus),
          className,
        )}
        disabled={!canViewQrCode}
        onClick={(event) => {
          stopRsvpControlInteractiveEventPropagation(event);
          onOpenQrCode(rsvp);
        }}
        onPointerDown={stopRsvpControlInteractiveEventPropagation}
      >
        <span className="min-w-0 truncate">{getTicketStatusLabel(currentTicketStatus)}</span>
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="xs"
          className={cn(
            "max-w-full min-w-0 shrink overflow-hidden",
            getTicketStatusClassName(currentTicketStatus),
            className,
          )}
          disabled={isRedeemed || isUpdating || !ticketEditingIsAllowed}
          onClick={stopRsvpControlInteractiveEventPropagation}
          onPointerDown={stopRsvpControlInteractiveEventPropagation}
        >
          {isUpdating && <Spinner className="mr-1 h-3 w-3" />}
          {!isUpdating && (
            <span className="min-w-0 truncate">{getTicketStatusLabel(currentTicketStatus)}</span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent onClick={stopRsvpControlInteractiveEventPropagation}>
        <DropdownMenuRadioGroup
          value={currentTicketStatus}
          onValueChange={(value) => onChange(rsvp, value as TicketStatusOption)}
        >
          <DropdownMenuRadioItem value="not-issued">
            <span className="text-gray-700">None</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="issued">
            <span className="text-purple-700">Issued</span>
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="disabled">
            <span className="text-red-700">Disabled</span>
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
        {(currentTicketStatus === "issued" || currentTicketStatus === "redeemed") &&
          rsvp.redemptionCode && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onOpenQrCode(rsvp)}>
                <QrCode className="w-4 h-4 mr-2" />
                View QR Code
              </DropdownMenuItem>
            </>
          )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
