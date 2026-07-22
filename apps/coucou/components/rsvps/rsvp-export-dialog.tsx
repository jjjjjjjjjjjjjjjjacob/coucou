"use client";

import { Download } from "lucide-react";
import { getApprovalStatusLabel } from "@/components/rsvps/rsvp-controls";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import type { ListCredential, PrimaryFieldConfig, PrimarySocialPlatformConfig } from "@/lib/types";

const EXPORT_STATUS_OPTIONS: Array<"pending" | "approved" | "denied"> = [
  "pending",
  "approved",
  "denied",
];

interface RsvpExportDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  listCredentials: ListCredential[] | undefined;
  selectedListsForExport: string[];
  setSelectedListsForExport: React.Dispatch<React.SetStateAction<string[]>>;
  selectedStatusesForExport: Array<"pending" | "approved" | "denied">;
  setSelectedStatusesForExport: React.Dispatch<
    React.SetStateAction<Array<"pending" | "approved" | "denied">>
  >;
  selectedSocialPlatformKeysForExport: string[];
  setSelectedSocialPlatformKeysForExport: React.Dispatch<React.SetStateAction<string[]>>;
  includeInvitedBy: boolean;
  setIncludeInvitedBy: (value: boolean) => void;
  includeAttendees: boolean;
  setIncludeAttendees: (value: boolean) => void;
  includeNote: boolean;
  setIncludeNote: (value: boolean) => void;
  includeCustomFields: boolean;
  setIncludeCustomFields: (value: boolean) => void;
  includePhone: boolean;
  setIncludePhone: (value: boolean) => void;
  currentEventInvitedByPrimaryFieldConfig: PrimaryFieldConfig["invitedBy"] | undefined;
  currentEventSocialPlatforms: PrimarySocialPlatformConfig[];
  isExportingCsv: boolean;
  isLoading: boolean;
  onExport: () => Promise<boolean>;
}

export function RsvpExportDialog({
  isOpen,
  onOpenChange,
  listCredentials,
  selectedListsForExport,
  setSelectedListsForExport,
  selectedStatusesForExport,
  setSelectedStatusesForExport,
  selectedSocialPlatformKeysForExport,
  setSelectedSocialPlatformKeysForExport,
  includeInvitedBy,
  setIncludeInvitedBy,
  includeAttendees,
  setIncludeAttendees,
  includeNote,
  setIncludeNote,
  includeCustomFields,
  setIncludeCustomFields,
  includePhone,
  setIncludePhone,
  currentEventInvitedByPrimaryFieldConfig,
  currentEventSocialPlatforms,
  isExportingCsv,
  isLoading,
  onExport,
}: RsvpExportDialogProps) {
  const handleExport = async () => {
    const exported = await onExport();
    if (exported) {
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="border-[var(--border-subtle)] bg-[var(--surface-2)] text-[var(--text-primary)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export CSV</DialogTitle>
          <DialogDescription className="text-[var(--text-secondary)]">
            Choose lists, statuses, and columns before exporting.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <fieldset>
            <legend className="mb-2 block text-sm font-medium text-[var(--text-primary)]">
              Select Lists
            </legend>
            <div className="space-y-2">
              {(listCredentials || []).map((listCredential) => (
                <div key={listCredential.listKey} className="flex items-center">
                  <Checkbox
                    id={`list-${listCredential.listKey}`}
                    checked={selectedListsForExport.includes(listCredential.listKey)}
                    onCheckedChange={(checkedState) => {
                      setSelectedListsForExport((previousSelectedListKeys) => {
                        if (checkedState === true) {
                          if (previousSelectedListKeys.includes(listCredential.listKey)) {
                            return previousSelectedListKeys;
                          }
                          return [...previousSelectedListKeys, listCredential.listKey];
                        }
                        return previousSelectedListKeys.filter(
                          (selectedListKey) => selectedListKey !== listCredential.listKey,
                        );
                      });
                    }}
                  />
                  <label
                    htmlFor={`list-${listCredential.listKey}`}
                    className="ml-2 cursor-pointer text-sm text-[var(--text-primary)]"
                  >
                    {listCredential.listKey.toUpperCase()}
                  </label>
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 block text-sm font-medium text-[var(--text-primary)]">
              Select Statuses
            </legend>
            <div className="space-y-2">
              {EXPORT_STATUS_OPTIONS.map((statusOption) => (
                <div key={statusOption} className="flex items-center">
                  <Checkbox
                    id={`status-${statusOption}`}
                    checked={selectedStatusesForExport.includes(statusOption)}
                    onCheckedChange={(checkedState) => {
                      setSelectedStatusesForExport((previousStatuses) => {
                        if (checkedState === true) {
                          if (previousStatuses.includes(statusOption)) {
                            return previousStatuses;
                          }
                          const nextStatuses = [...previousStatuses, statusOption];
                          return EXPORT_STATUS_OPTIONS.filter((option) =>
                            nextStatuses.includes(option),
                          );
                        }
                        return previousStatuses.filter((option) => option !== statusOption);
                      });
                    }}
                  />
                  <label
                    htmlFor={`status-${statusOption}`}
                    className="ml-2 cursor-pointer text-sm text-[var(--text-primary)]"
                  >
                    {getApprovalStatusLabel(statusOption)}
                  </label>
                </div>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="mb-2 block text-sm font-medium text-[var(--text-primary)]">
              Select Columns
            </legend>
            <div className="space-y-2">
              <div className="flex items-center">
                <Checkbox
                  id="col-phone"
                  checked={includePhone}
                  onCheckedChange={(checkedState) => setIncludePhone(checkedState === true)}
                />
                <label
                  htmlFor="col-phone"
                  className="ml-2 cursor-pointer text-sm text-[var(--text-primary)]"
                >
                  Phone
                </label>
              </div>
              {currentEventInvitedByPrimaryFieldConfig?.enabled === true && (
                <div className="flex items-center">
                  <Checkbox
                    id="col-invited-by"
                    checked={includeInvitedBy}
                    onCheckedChange={(checkedState) => setIncludeInvitedBy(checkedState === true)}
                  />
                  <label
                    htmlFor="col-invited-by"
                    className="ml-2 cursor-pointer text-sm text-[var(--text-primary)]"
                  >
                    {currentEventInvitedByPrimaryFieldConfig.label ?? "Invited By"}
                  </label>
                </div>
              )}
              {currentEventSocialPlatforms.map((socialPlatform) => (
                <div key={socialPlatform.platformKey} className="flex items-center">
                  <Checkbox
                    id={`col-social-${socialPlatform.platformKey}`}
                    checked={selectedSocialPlatformKeysForExport.includes(
                      socialPlatform.platformKey,
                    )}
                    onCheckedChange={(checkedState) => {
                      setSelectedSocialPlatformKeysForExport(
                        (previousSelectedSocialPlatformKeys) => {
                          if (checkedState === true) {
                            if (
                              previousSelectedSocialPlatformKeys.includes(
                                socialPlatform.platformKey,
                              )
                            ) {
                              return previousSelectedSocialPlatformKeys;
                            }
                            return [
                              ...previousSelectedSocialPlatformKeys,
                              socialPlatform.platformKey,
                            ];
                          }
                          return previousSelectedSocialPlatformKeys.filter(
                            (selectedSocialPlatformKey) =>
                              selectedSocialPlatformKey !== socialPlatform.platformKey,
                          );
                        },
                      );
                    }}
                  />
                  <label
                    htmlFor={`col-social-${socialPlatform.platformKey}`}
                    className="ml-2 cursor-pointer text-sm text-[var(--text-primary)]"
                  >
                    {socialPlatform.label}
                  </label>
                </div>
              ))}
              <div className="flex items-center">
                <Checkbox
                  id="col-attendees"
                  checked={includeAttendees}
                  onCheckedChange={(checkedState) => setIncludeAttendees(checkedState === true)}
                />
                <label
                  htmlFor="col-attendees"
                  className="ml-2 cursor-pointer text-sm text-[var(--text-primary)]"
                >
                  Attendees
                </label>
              </div>
              <div className="flex items-center">
                <Checkbox
                  id="col-note"
                  checked={includeNote}
                  onCheckedChange={(checkedState) => setIncludeNote(checkedState === true)}
                />
                <label
                  htmlFor="col-note"
                  className="ml-2 cursor-pointer text-sm text-[var(--text-primary)]"
                >
                  Note
                </label>
              </div>
              <div className="flex items-center">
                <Checkbox
                  id="col-custom"
                  checked={includeCustomFields}
                  onCheckedChange={(checkedState) => setIncludeCustomFields(checkedState === true)}
                />
                <label
                  htmlFor="col-custom"
                  className="ml-2 cursor-pointer text-sm text-[var(--text-primary)]"
                >
                  Custom Fields
                </label>
              </div>
            </div>
          </fieldset>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isExportingCsv}
            className="border-[var(--border-subtle)]"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleExport}
            disabled={
              isLoading ||
              isExportingCsv ||
              selectedListsForExport.length === 0 ||
              selectedStatusesForExport.length === 0
            }
          >
            {isExportingCsv ? (
              <Spinner className="mr-2 h-4 w-4" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {isExportingCsv ? "Exporting..." : "Export"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
