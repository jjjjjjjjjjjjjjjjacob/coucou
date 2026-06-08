"use client";
import { UserButton, useUser } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { buildSatelliteReturnUrl, buildTenantPrimarySignInUrl } from "@coucou/sdk";
import { useMutation, useQuery } from "convex/react";
import { Bell, ExternalLink } from "lucide-react";
import Link from "next/link";
import React from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { resolveEventMessagingBrandName } from "@/lib/event-display";
import { coucouBaseUrl, siteConfiguration } from "@/lib/site";
import { fetchSmsConsentIpAddress } from "@/lib/sms-consent";
import type { UserEventSharing } from "@/lib/types";
import { formatEventDateTime } from "@/lib/utils";

const displayHeadingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-bowlby-one), "Bowlby One", "Fugaz One", "Anton", "Impact", sans-serif',
  textTransform: "uppercase",
  letterSpacing: "0.01em",
  lineHeight: 1.05,
};

const textBodyStyle: React.CSSProperties = {
  fontFamily: "var(--tt-text)",
};

const sectionEyebrowClassName = "text-[11px] font-medium uppercase tracking-[0.12em] text-primary";

export default function ProfilePage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const sharedEvents = useQuery(api.rsvps.listForCurrentUserInWorkspace, {
    workspaceSlug: siteConfiguration.workspaceSlug,
    siteKey: siteConfiguration.siteKey,
  }) as UserEventSharing[] | undefined;
  const workspace = useQuery(api.workspaces.getWorkspaceBySlug, {
    slug: siteConfiguration.workspaceSlug,
  });
  const showCoucouProfileLink = workspace?.showCoucouProfileLink === true;
  const updateSmsPreference = useMutation(api.rsvps.updateSmsPreference);
  const updateSharedFields = useMutation(api.rsvps.updateSharedFields);
  const [editingRsvpId, setEditingRsvpId] = React.useState<string | null>(null);
  const [pendingFieldValues, setPendingFieldValues] = React.useState<Record<string, string>>({});
  const [isSavingSharedFields, setIsSavingSharedFields] = React.useState<boolean>(false);
  const [smsUpdatingRsvpId, setSmsUpdatingRsvpId] = React.useState<string | null>(null);

  const editingEvent = React.useMemo(() => {
    if (!editingRsvpId || !sharedEvents) return undefined;
    return sharedEvents.find((entry) => entry.rsvpId === editingRsvpId);
  }, [editingRsvpId, sharedEvents]);

  React.useEffect(() => {
    if (!editingEvent) return;
    const initialValues: Record<string, string> = {};
    editingEvent.customFields.forEach((field) => {
      initialValues[field.key] = field.value ?? "";
    });
    setPendingFieldValues(initialValues);
  }, [editingEvent]);

  const handleSmsToggle = async (sharedEvent: UserEventSharing) => {
    setSmsUpdatingRsvpId(sharedEvent.rsvpId);
    try {
      let consentIpAddress: string | undefined;
      if (!sharedEvent.smsConsent) {
        consentIpAddress = await fetchSmsConsentIpAddress();
      }
      const smsSenderDisplayNameForToast = resolveEventMessagingBrandName(
        {
          name: sharedEvent.eventName,
          secondaryTitle: sharedEvent.eventSecondaryTitle,
          eventHostNames: sharedEvent.eventHostNames,
          productionCompany: sharedEvent.productionCompany,
        },
        { fallback: sharedEvent.eventName ?? "Event Host" },
      );
      await updateSmsPreference({
        rsvpId: sharedEvent.rsvpId as Id<"rsvps">,
        smsConsent: !sharedEvent.smsConsent,
        smsConsentIpAddress:
          !sharedEvent.smsConsent && consentIpAddress ? consentIpAddress : undefined,
      });
      toast.success(
        !sharedEvent.smsConsent
          ? `SMS from ${smsSenderDisplayNameForToast} enabled.`
          : `SMS from ${smsSenderDisplayNameForToast} disabled.`,
      );
    } catch (error) {
      const errorDetails = error as Error;
      toast.error(errorDetails.message || "Failed to update SMS preference.");
    } finally {
      setSmsUpdatingRsvpId(null);
    }
  };

  const handleFieldChange = (fieldKey: string, value: string) => {
    setPendingFieldValues((current) => ({
      ...current,
      [fieldKey]: value,
    }));
  };

  const handleFieldClear = (fieldKey: string) => {
    setPendingFieldValues((current) => ({
      ...current,
      [fieldKey]: "",
    }));
  };

  const handleSaveSharedFields = async () => {
    if (!editingEvent) return;
    setIsSavingSharedFields(true);
    try {
      await updateSharedFields({
        rsvpId: editingEvent.rsvpId as Id<"rsvps">,
        fields: pendingFieldValues,
      });
      toast.success("Shared details updated.");
      setEditingRsvpId(null);
    } catch (error) {
      const errorDetails = error as Error;
      toast.error(errorDetails.message || "Failed to update shared details.");
    } finally {
      setIsSavingSharedFields(false);
    }
  };

  if (!isLoaded) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-6 py-10">
        <Spinner />
      </div>
    );
  }

  if (!isSignedIn || !user) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-16 text-center">
        <h2 className="text-2xl text-primary" style={displayHeadingStyle}>
          Not signed in
        </h2>
        <p className="mt-4 text-sm text-primary/70" style={textBodyStyle}>
          Please sign in to view your profile.
        </p>
        <div className="mt-6 flex justify-center">
          <Button
            onClick={() => {
              if (typeof window === "undefined") return;
              // Build at click-time so the return URL points at the
              // current satellite origin rather than the hard-coded
              // production domain in `siteConfiguration`.
              window.location.assign(
                buildTenantPrimarySignInUrl({
                  primaryBaseUrl: coucouBaseUrl,
                  siteConfiguration,
                  redirectUrl: buildSatelliteReturnUrl(window.location.origin, "/profile"),
                }),
              );
            }}
          >
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  const organizationMemberships = user.organizationMemberships || [];
  const primaryEmail = user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId);
  const primaryPhone = user.phoneNumbers.find((phone) => phone.id === user.primaryPhoneNumberId);
  const isSharedEventsLoading = sharedEvents === undefined;
  const sharedEventCount = sharedEvents?.length ?? 0;
  const memberSinceLabel = new Date(user.createdAt!).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
  });
  const joinedLabel = new Date(user.createdAt!).toLocaleDateString();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:px-8" style={textBodyStyle}>
      <div className="mb-12 flex items-center gap-5">
        <Avatar className="size-14">
          <AvatarImage src={user.imageUrl} alt={user.fullName || ""} />
          <AvatarFallback>
            {user.firstName?.[0]}
            {user.lastName?.[0]}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-3xl text-primary sm:text-4xl" style={displayHeadingStyle}>
            {user.fullName || "Profile"}
          </h1>
          <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-primary/60">
            Member since {memberSinceLabel}
          </p>
        </div>
      </div>

      <div className="space-y-12">
        <section className="space-y-3">
          <p className={sectionEyebrowClassName}>Contact</p>
          <div className="space-y-2 text-sm text-primary">
            {primaryEmail && (
              <div className="flex flex-wrap items-center gap-3">
                <span>{primaryEmail.emailAddress}</span>
                {primaryEmail.verification?.status === "verified" && (
                  <Badge variant="outline" className="text-[10px] uppercase tracking-[0.1em]">
                    Verified
                  </Badge>
                )}
              </div>
            )}
            {primaryPhone && (
              <div className="flex flex-wrap items-center gap-3">
                <span>{primaryPhone.phoneNumber}</span>
                {primaryPhone.verification?.status === "verified" && (
                  <Badge variant="outline" className="text-[10px] uppercase tracking-[0.1em]">
                    Verified
                  </Badge>
                )}
              </div>
            )}
            <div className="text-[11px] uppercase tracking-[0.1em] text-primary/60">
              Joined {joinedLabel}
            </div>
          </div>
        </section>

        {showCoucouProfileLink && (
          <section className="space-y-3">
            <p className={sectionEyebrowClassName}>Coucou Profile</p>
            <h2 className="text-xl text-primary sm:text-2xl" style={displayHeadingStyle}>
              View your full Coucou profile
            </h2>
            <p className="max-w-xl text-sm text-primary/70">
              See all your events, saved info, and shared profile data across every workspace on
              Coucou.
            </p>
            <Button asChild variant="outline">
              <a href={`${coucouBaseUrl}/profile`} target="_blank" rel="noopener noreferrer">
                Open on Coucou
                <ExternalLink className="size-4" />
              </a>
            </Button>
          </section>
        )}

        {organizationMemberships.length > 0 && (
          <section className="space-y-3">
            <p className={sectionEyebrowClassName}>Organizations</p>
            <div className="space-y-2">
              {organizationMemberships.map((membership) => (
                <div
                  key={membership.organization.id}
                  className="flex items-center justify-between gap-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <Avatar className="size-8">
                      <AvatarImage
                        src={membership.organization.imageUrl}
                        alt={membership.organization.name}
                      />
                      <AvatarFallback>{membership.organization.name[0]}</AvatarFallback>
                    </Avatar>
                    <div>
                      <h3 className="text-sm text-primary">{membership.organization.name}</h3>
                      <p className="text-[11px] uppercase tracking-[0.1em] text-primary/60">
                        {membership.organization.slug}
                      </p>
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-[0.1em]">
                    {membership.role.replace("org:", "")}
                  </Badge>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Bell className="size-4 text-primary" />
            <p className={sectionEyebrowClassName}>Event Sharing & Notifications</p>
          </div>
          <p className="text-sm text-primary/70">
            Manage SMS updates and the custom fields you have shared with hosts.
          </p>
          {isSharedEventsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner />
            </div>
          ) : sharedEventCount === 0 ? (
            <p className="text-sm text-primary/70">
              You have not shared details with any events yet. Once you RSVP, your shared
              information will appear here.
            </p>
          ) : (
            <div className="space-y-6">
              <p className="text-[10px] leading-tight text-primary/60">
                RSVP updates, reminders, and offers via SMS. Sent by Coucou on behalf of each event
                host using Club Chlorine. Msg & data rates may apply. Reply STOP to cancel.
              </p>
              {sharedEvents?.map((sharedEvent) => {
                const smsSenderDisplayName = resolveEventMessagingBrandName(
                  {
                    name: sharedEvent.eventName,
                    secondaryTitle: sharedEvent.eventSecondaryTitle,
                    eventHostNames: sharedEvent.eventHostNames,
                    productionCompany: sharedEvent.productionCompany,
                  },
                  { fallback: sharedEvent.eventName ?? "Event Host" },
                );
                const sharedFieldValues = sharedEvent.customFields.filter(
                  (field) => field.value && field.value.length > 0,
                );
                return (
                  <div key={sharedEvent.rsvpId} className="space-y-4 py-2">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3
                            className="text-lg text-primary sm:text-xl"
                            style={displayHeadingStyle}
                          >
                            {sharedEvent.eventName}
                          </h3>
                          {sharedEvent.listKey && (
                            <Badge
                              variant="outline"
                              className="text-[10px] uppercase tracking-[0.1em]"
                            >
                              {sharedEvent.listKey}
                            </Badge>
                          )}
                        </div>
                        {sharedEvent.eventSecondaryTitle && (
                          <p className="text-sm text-primary/70">
                            {sharedEvent.eventSecondaryTitle}
                          </p>
                        )}
                        {sharedEvent.eventDate && (
                          <p className="text-[11px] uppercase tracking-[0.1em] text-primary/60">
                            {formatEventDateTime(sharedEvent.eventDate, sharedEvent.eventTimezone)}
                          </p>
                        )}
                        {smsSenderDisplayName && (
                          <p className="text-[11px] uppercase tracking-[0.1em] text-primary/60">
                            SMS sender: {smsSenderDisplayName} (delivered via Club Chlorine)
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={sharedEvent.smsConsent ? "default" : "outline"}
                          onClick={() => handleSmsToggle(sharedEvent)}
                          disabled={smsUpdatingRsvpId === sharedEvent.rsvpId}
                          className="min-w-[7rem]"
                        >
                          {smsUpdatingRsvpId === sharedEvent.rsvpId && (
                            <Spinner className="mr-2 h-3.5 w-3.5" />
                          )}
                          {sharedEvent.smsConsent ? "SMS On" : "SMS Off"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingRsvpId(sharedEvent.rsvpId)}
                        >
                          Edit Shared Fields
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-[0.12em] text-primary/60">
                        Shared fields
                      </p>
                      {sharedFieldValues.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {sharedFieldValues.map((field) => (
                            <Badge
                              key={`${sharedEvent.rsvpId}-${field.key}`}
                              variant="secondary"
                              className="px-2.5 py-1 text-xs font-medium"
                            >
                              <span className="pr-1 text-primary/60">{field.label}:</span>
                              <span>{field.value}</span>
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-primary/70">
                          You have not shared any custom fields for this event.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <p className={sectionEyebrowClassName}>Quick Actions</p>
          <div className="flex flex-col gap-2">
            <Link href="/tickets">
              <Button variant="outline" className="w-full justify-start">
                View My Tickets
              </Button>
            </Link>
            <div className="flex items-center gap-3 py-2">
              <UserButton
                appearance={{
                  elements: {
                    userButtonAvatarBox: "w-8 h-8",
                  },
                }}
              />
              <span className="text-sm text-primary">Manage Account Settings</span>
            </div>
          </div>
        </section>
      </div>

      <Dialog
        open={editingRsvpId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingRsvpId(null);
          }
        }}
      >
        <DialogContent className="max-w-lg" style={textBodyStyle}>
          <DialogHeader>
            <DialogTitle style={displayHeadingStyle}>Update shared details</DialogTitle>
            <DialogDescription>
              Adjust the information you are sharing with the host for this event. Clearing a field
              removes it from your shared details.
            </DialogDescription>
          </DialogHeader>
          {editingEvent ? (
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <h3 className="text-lg text-primary" style={displayHeadingStyle}>
                  {editingEvent.eventName}
                </h3>
                {editingEvent.eventSecondaryTitle && (
                  <p className="text-sm text-primary/70">{editingEvent.eventSecondaryTitle}</p>
                )}
              </div>
              {editingEvent.customFields.length === 0 ? (
                <p className="text-sm text-primary/70">
                  This event does not request additional custom fields.
                </p>
              ) : (
                <div className="space-y-3">
                  {editingEvent.customFields.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <Label
                        htmlFor={`shared-${field.key}`}
                        className="text-[11px] uppercase tracking-[0.12em] text-primary"
                      >
                        {field.label}
                      </Label>
                      <div className="flex gap-2">
                        <Input
                          id={`shared-${field.key}`}
                          value={pendingFieldValues[field.key] ?? ""}
                          placeholder="Not shared"
                          onChange={(event) => handleFieldChange(field.key, event.target.value)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => handleFieldClear(field.key)}
                          disabled={!pendingFieldValues[field.key]}
                        >
                          Clear
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <Spinner />
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingRsvpId(null)}
              disabled={isSavingSharedFields}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveSharedFields}
              disabled={isSavingSharedFields || !editingEvent}
            >
              {isSavingSharedFields ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
