"use client";
import React from "react";
import { useUser, UserButton } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Mail, Phone, Calendar, Users, Settings, ExternalLink } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatEventDateTime } from "@/lib/utils";
import { toast } from "sonner";
import type { UserEventSharing } from "@/lib/types";
import type { Id } from "@convex/_generated/dataModel";
import { fetchSmsConsentIpAddress } from "@/lib/sms-consent";
import { resolveEventMessagingBrandName } from "@/lib/event-display";
import { coucouBaseUrl, siteConfiguration } from "@/lib/site";

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
  const [pendingFieldValues, setPendingFieldValues] = React.useState<
    Record<string, string>
  >({});
  const [isSavingSharedFields, setIsSavingSharedFields] =
    React.useState<boolean>(false);
  const [smsUpdatingRsvpId, setSmsUpdatingRsvpId] = React.useState<string | null>(null);
  const exampleHostName = React.useMemo(() => {
    if (!sharedEvents || sharedEvents.length === 0) {
      return "Neon District Events";
    }
    for (const entry of sharedEvents) {
      const brandName = resolveEventMessagingBrandName(
        {
          name: entry.eventName,
          secondaryTitle: entry.eventSecondaryTitle,
          eventHostNames: entry.eventHostNames,
          productionCompany: entry.productionCompany,
        },
        { fallback: entry.eventName ?? "Neon District Events" },
      );
      if (brandName?.trim()) {
        return brandName.trim();
      }
    }
    return resolveEventMessagingBrandName(
      {
        name: sharedEvents[0]?.eventName,
        secondaryTitle: sharedEvents[0]?.eventSecondaryTitle,
        eventHostNames: sharedEvents[0]?.eventHostNames,
        productionCompany: sharedEvents[0]?.productionCompany,
      },
      { fallback: sharedEvents[0]?.eventName ?? "Neon District Events" },
    );
  }, [sharedEvents]);

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
          !sharedEvent.smsConsent && consentIpAddress
            ? consentIpAddress
            : undefined,
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
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center min-h-screen">
          <Spinner />
        </div>
      </div>
    );
  }

  if (!isSignedIn || !user) {
    return (
      <div className="container mx-auto p-6 max-w-2xl">
        <Card>
          <CardContent className="text-center py-12">
            <h2 className="text-lg font-medium mb-2">Not signed in</h2>
            <p className="text-muted-foreground mb-6">
              Please sign in to view your profile.
            </p>
            <Link href="/sign-in">
              <Button>Sign In</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const organizationMemberships = user.organizationMemberships || [];
  const primaryEmail = user.emailAddresses.find(
    (email) => email.id === user.primaryEmailAddressId
  );
  const primaryPhone = user.phoneNumbers.find(
    (phone) => phone.id === user.primaryPhoneNumberId
  );
  const isSharedEventsLoading = sharedEvents === undefined;
  const sharedEventCount = sharedEvents?.length ?? 0;

  return (
    <div className="container mx-auto p-6 max-w-3xl">
      <h1 className="text-3xl font-bold mb-6">Profile</h1>

      <div className="space-y-6">
        {/* User Info Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-3">
              <Avatar className="h-12 w-12">
                <AvatarImage src={user.imageUrl} alt={user.fullName || ""} />
                <AvatarFallback>
                  {user.firstName?.[0]}{user.lastName?.[0]}
                </AvatarFallback>
              </Avatar>
              <div>
                <h2 className="text-xl font-semibold">
                  {user.fullName || "User"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Member since{" "}
                  {new Date(user.createdAt!).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                  })}
                </p>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {primaryEmail && (
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span>{primaryEmail.emailAddress}</span>
                {primaryEmail.verification?.status === "verified" && (
                  <Badge variant="outline" className="text-green-600 border-green-600">
                    Verified
                  </Badge>
                )}
              </div>
            )}

            {primaryPhone && (
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{primaryPhone.phoneNumber}</span>
                {primaryPhone.verification?.status === "verified" && (
                  <Badge variant="outline" className="text-green-600 border-green-600">
                    Verified
                  </Badge>
                )}
              </div>
            )}

            <div className="flex items-center gap-3">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>
                Joined {new Date(user.createdAt!).toLocaleDateString()}
              </span>
            </div>
          </CardContent>
        </Card>

        {showCoucouProfileLink && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ExternalLink className="h-5 w-5" />
                View your full Coucou profile
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                See all your events, saved info, and shared profile data
                across every workspace on Coucou.
              </p>
              <Button asChild>
                <a
                  href={`${coucouBaseUrl}/profile`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open on Coucou
                  <ExternalLink className="size-4" />
                </a>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Organizations Card */}
        {organizationMemberships.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Organizations
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {organizationMemberships.map((membership) => (
                  <div
                    key={membership.organization.id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage
                          src={membership.organization.imageUrl}
                          alt={membership.organization.name}
                        />
                        <AvatarFallback>
                          {membership.organization.name[0]}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <h3 className="font-medium">
                          {membership.organization.name}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {membership.organization.slug}
                        </p>
                      </div>
                    </div>
                    <Badge variant="outline" className="capitalize">
                      {membership.role.replace("org:", "")}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Event Sharing & Notifications
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Manage SMS updates and the custom fields you have shared with hosts.
            </p>
          </CardHeader>
          <CardContent>
            {isSharedEventsLoading ? (
              <div className="flex items-center justify-center py-8">
                <Spinner />
              </div>
            ) : sharedEventCount === 0 ? (
              <p className="text-sm text-muted-foreground">
                You have not shared details with any events yet. Once you RSVP, your shared information will appear here.
              </p>
            ) : (
              <div className="space-y-4">
                <p className="text-[10px] text-muted-foreground leading-tight">
                  RSVP updates, reminders, and offers via SMS. Sent by Coucou on behalf of each event host using Dojo Pomodoro. Msg & data rates may apply. Reply STOP to cancel.
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
                  const sharedFieldValues =
                    sharedEvent.customFields.filter((field) => field.value && field.value.length > 0);
                  return (
                    <div
                      key={sharedEvent.rsvpId}
                      className="border rounded-lg p-4 space-y-4"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-lg font-semibold text-primary">
                              {sharedEvent.eventName}
                            </h3>
                            {sharedEvent.listKey && (
                              <Badge variant="outline" className="uppercase">
                                {sharedEvent.listKey}
                              </Badge>
                            )}
                          </div>
                          {sharedEvent.eventSecondaryTitle && (
                            <p className="text-sm text-muted-foreground">
                              {sharedEvent.eventSecondaryTitle}
                            </p>
                          )}
                          {sharedEvent.eventDate && (
                            <p className="text-xs text-muted-foreground">
                              {formatEventDateTime(
                                sharedEvent.eventDate,
                                sharedEvent.eventTimezone,
                              )}
                            </p>
                          )}
                          {smsSenderDisplayName && (
                            <p className="text-xs text-muted-foreground">
                              SMS sender: {smsSenderDisplayName} (delivered via Dojo Pomodoro)
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
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                          Shared fields
                        </p>
                        {sharedFieldValues.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {sharedFieldValues.map((field) => (
                              <Badge
                                key={`${sharedEvent.rsvpId}-${field.key}`}
                                variant="secondary"
                                className="text-xs font-medium px-2.5 py-1"
                              >
                                <span className="pr-1 text-muted-foreground">{field.label}:</span>
                                <span>{field.value}</span>
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            You have not shared any custom fields for this event.
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 flex flex-col">
            <Link href="/tickets">
              <Button variant="outline" className="w-full justify-start">
                View My Tickets
              </Button>
            </Link>
            <div className="flex items-center gap-3 p-3 border rounded-lg">
              <UserButton
                appearance={{
                  elements: {
                    userButtonAvatarBox: "w-8 h-8"
                  }
                }}
              />
              <span className="text-sm">Manage Account Settings</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={editingRsvpId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setEditingRsvpId(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Update shared details</DialogTitle>
            <DialogDescription>
              Adjust the information you are sharing with the host for this event. Clearing a field removes it from your shared details.
            </DialogDescription>
          </DialogHeader>
          {editingEvent ? (
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <h3 className="text-base font-semibold">{editingEvent.eventName}</h3>
                {editingEvent.eventSecondaryTitle && (
                  <p className="text-sm text-muted-foreground">
                    {editingEvent.eventSecondaryTitle}
                  </p>
                )}
              </div>
              {editingEvent.customFields.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This event does not request additional custom fields.
                </p>
              ) : (
                <div className="space-y-3">
                  {editingEvent.customFields.map((field) => (
                    <div key={field.key} className="space-y-2">
                      <Label htmlFor={`shared-${field.key}`}>{field.label}</Label>
                      <div className="flex gap-2">
                        <Input
                          id={`shared-${field.key}`}
                          value={pendingFieldValues[field.key] ?? ""}
                          placeholder="Not shared"
                          onChange={(event) =>
                            handleFieldChange(field.key, event.target.value)
                          }
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
