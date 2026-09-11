import { sanitizeOptionalApprovalMessage } from "@coucou/sdk/shared/approval-messages";
import { sanitizeOptionalAutomatedEventMessage } from "@coucou/sdk/shared/automated-event-messages";
import type { WorkspaceEventDefaults } from "@coucou/sdk/shared/primary-fields";
import { sanitizeOptionalRsvpConfirmationMessage } from "@coucou/sdk/shared/rsvp-confirmation-messages";
import { type Infer, ConvexError as PublicConvexError, v } from "convex/values";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  applyEventChanges,
  insertEventWithCredentials,
  publishEventChanges,
  reconcileEventRouting,
  saveEventLists,
} from "./events";
import { mutation } from "./functions";
import { validateAutoApproveDelayMinutes, validateAutoApproveLimit } from "./lib/autoApproval";
import { normalizeCredentialPassword } from "./lib/credentialPasswords";
import {
  createEventArgs,
  type EventEditorSaveResult,
  eventUpdateActionArgs,
} from "./lib/eventEditorArgs";
import {
  type EventActInput,
  sanitizeOptionalEventActs,
  sanitizeOptionalEventDescription,
} from "./lib/eventMetadata";
import { type EventPartnerInput, sanitizeOptionalEventPartners } from "./lib/eventPartners";
import {
  primaryFieldConfigFromWorkspaceDefaults,
  sanitizePrimaryFieldConfig,
} from "./lib/primaryFields";
import {
  type CredentialData,
  ConvexError as DomainError,
  DuplicateError,
  type EventPatch,
  ValidationError,
} from "./lib/types";
import { requireWorkspaceHost } from "./lib/workspaceAuth";

const HEX_COLOR_PATTERN = /^#(?:[0-9A-Fa-f]{6})$/;

type HostCredentialData = {
  _id: Id<"listCredentials">;
  eventId: Id<"events">;
  listKey: string;
  password?: string;
  hasPassword?: boolean;
  generateQR?: boolean;
  defersQrDelivery?: boolean;
  sendQrOnApproval?: boolean;
  includeTicketLinkOnApproval?: boolean;
  approvalMessage?: string;
  autoApproveLimit?: number;
  autoApproveDelayMinutes?: number;
  autoApprovedCount?: number;
  createdAt: number;
};

type WorkspaceDefaultsSource = {
  eventDefaults?: WorkspaceEventDefaults;
};

type EventPasswordCandidate = {
  credentialId?: Id<"listCredentials">;
  listKey: string;
  password: string;
};

function normalizeOptionalHexColor(
  input: string | null | undefined,
  validationLabel: string,
): string | undefined {
  if (!input) return undefined;
  const trimmedInput = input.trim();
  if (trimmedInput.length === 0) return undefined;
  const prefixedInput = trimmedInput.startsWith("#") ? trimmedInput : `#${trimmedInput}`;
  if (!HEX_COLOR_PATTERN.test(prefixedInput)) {
    throw new ValidationError(`${validationLabel} must be a 6-digit hex color (e.g. #FF0000)`);
  }
  return `#${prefixedInput.slice(1).toUpperCase()}`;
}

function validateLocalPasswordUniqueness(candidates: EventPasswordCandidate[]): void {
  const normalizedPasswords = new Set<string>();

  for (const candidate of candidates) {
    if (!candidate.password.trim()) continue;
    const normalizedPassword = normalizeCredentialPassword(candidate.password);
    if (normalizedPasswords.has(normalizedPassword)) {
      throw new ValidationError("List passwords must be unique within the event");
    }
    normalizedPasswords.add(normalizedPassword);
  }
}

async function ensureActiveEventPasswordsAreUnique(
  ctx: Pick<MutationCtx, "runQuery">,
  options: {
    eventId?: Id<"events">;
    candidates: EventPasswordCandidate[];
    previousCredentials?: HostCredentialData[];
  },
): Promise<void> {
  const previousPasswords = new Map(
    options.previousCredentials?.map((credential) => [
      credential._id,
      normalizeCredentialPassword(credential.password ?? ""),
    ]),
  );
  const changedCandidates = options.candidates.filter(
    (candidate) =>
      !candidate.credentialId ||
      previousPasswords.get(candidate.credentialId) !==
        normalizeCredentialPassword(candidate.password),
  );
  for (const candidate of changedCandidates) {
    if (
      options.candidates.some(
        (otherCandidate) =>
          otherCandidate !== candidate &&
          normalizeCredentialPassword(otherCandidate.password) ===
            normalizeCredentialPassword(candidate.password),
      )
    ) {
      throw new ValidationError("List passwords must be unique within the event");
    }
    if (!candidate.password.trim()) continue;
    const matchingCredentials = await ctx.runQuery(api.credentials.getByPassword, {
      password: candidate.password,
    });

    for (const matchingCredential of matchingCredentials) {
      if (candidate.credentialId && matchingCredential._id === candidate.credentialId) {
        continue;
      }
      if (options.eventId && matchingCredential.eventId === options.eventId) {
        continue;
      }

      const matchingEvent = await ctx.runQuery(api.events.get, {
        eventId: matchingCredential.eventId,
      });
      if (matchingEvent?.status === "active") {
        throw new DuplicateError("Password already in use by an active event");
      }
    }
  }
}

export const create = mutation({
  args: createEventArgs,
  handler: async (ctx, args): Promise<{ eventId: Id<"events"> }> => {
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const now = Date.now();
    if (args.eventDate < now) throw new Error("Event date must be in the future");

    // Validate maxAttendees
    if (args.maxAttendees !== undefined) {
      if (args.maxAttendees < 1 || args.maxAttendees > 6) {
        throw new Error("Maximum attendees must be between 1 and 6");
      }
    }

    const eventStatus = args.status ?? "active";
    const passwordCandidates = args.lists.map((list) => ({
      listKey: list.listKey,
      password: list.password,
    }));
    if (eventStatus === "active") {
      await ensureActiveEventPasswordsAreUnique(ctx, {
        candidates: passwordCandidates,
      });
    } else {
      validateLocalPasswordUniqueness(passwordCandidates);
    }

    const derivedCredentials: CredentialData[] = args.lists.map(
      ({
        listKey,
        displayName,
        password,
        generateQR,
        sendQrOnApproval,
        includeTicketLinkOnApproval,
        approvalMessage,
        autoApproveLimit,
        autoApproveDelayMinutes,
      }) => {
        validateAutoApproveLimit(autoApproveLimit);
        validateAutoApproveDelayMinutes(autoApproveDelayMinutes);
        const trimmedPassword = password.trim();
        const hasPassword = trimmedPassword.length > 0;
        return {
          listKey,
          displayName,
          password: hasPassword ? trimmedPassword : undefined,
          passwordNormalized: hasPassword
            ? normalizeCredentialPassword(trimmedPassword)
            : undefined,
          generateQR,
          sendQrOnApproval,
          includeTicketLinkOnApproval,
          approvalMessage: sanitizeOptionalApprovalMessage(approvalMessage),
          autoApproveLimit,
          autoApproveDelayMinutes,
        };
      },
    );

    const workspaceDefaults = args.workspaceSlug
      ? ((await ctx.runQuery(api.workspaces.getWorkspaceBySlug, {
          slug: args.workspaceSlug,
        })) as WorkspaceDefaultsSource | null)
      : null;
    const workspaceEventDefaults = workspaceDefaults?.eventDefaults;
    const normalizedThemeBackgroundColor = normalizeOptionalHexColor(
      args.themeBackgroundColor ?? workspaceEventDefaults?.themeBackgroundColor,
      "Background color",
    );
    const normalizedThemeTextColor = normalizeOptionalHexColor(
      args.themeTextColor ?? workspaceEventDefaults?.themeTextColor,
      "Text color",
    );
    const normalizedThemeAccentColor = normalizeOptionalHexColor(
      args.themeAccentColor ?? workspaceEventDefaults?.themeAccentColor,
      "Accent color",
    );
    const primaryFieldConfig =
      sanitizePrimaryFieldConfig(args.primaryFieldConfig) ??
      primaryFieldConfigFromWorkspaceDefaults(workspaceEventDefaults);
    const referralSharingEnabled = args.referralSharingEnabled ?? false;
    const trimmedGuestPortalLinkLabel = args.guestPortalLinkLabel?.trim() ?? "";
    const trimmedGuestPortalLinkUrl = args.guestPortalLinkUrl?.trim() ?? "";
    const hasGuestPortalLinkLabel = trimmedGuestPortalLinkLabel.length > 0;
    const hasGuestPortalLinkUrl = trimmedGuestPortalLinkUrl.length > 0;

    if (hasGuestPortalLinkLabel && !hasGuestPortalLinkUrl) {
      throw new ValidationError("Guest experience link URL is required when a label is provided");
    }
    if (hasGuestPortalLinkUrl && !hasGuestPortalLinkLabel) {
      throw new ValidationError("Guest experience link label is required when a URL is provided");
    }

    let normalizedGuestPortalLinkUrl: string | undefined;
    if (hasGuestPortalLinkUrl) {
      try {
        const parsedUrl = new URL(trimmedGuestPortalLinkUrl);
        if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
          throw new ValidationError("Guest experience link must use http or https");
        }
        normalizedGuestPortalLinkUrl = parsedUrl.toString();
      } catch (_error) {
        throw new ValidationError("Guest experience link must be a valid URL");
      }
    }
    const normalizedGuestPortalLinkLabel = hasGuestPortalLinkLabel
      ? trimmedGuestPortalLinkLabel
      : undefined;

    const result = await insertEventWithCredentials(ctx, {
      workspaceSlug: args.workspaceSlug,
      siteKey: args.siteKey,
      name: args.name,
      secondaryTitle: args.secondaryTitle,
      description: sanitizeOptionalEventDescription(args.description),
      acts: sanitizeOptionalEventActs(args.acts),
      eventPartners: sanitizeOptionalEventPartners(args.eventPartners),
      sponsors: sanitizeOptionalEventPartners(args.sponsors),
      hosts: args.hosts,
      productionCompany: args.productionCompany,
      location: args.location,
      flyerUrl: args.flyerUrl,
      flyerStorageId: args.flyerStorageId,
      openGraphImageSource: args.openGraphImageSource,
      customIconStorageId: args.customIconStorageId ?? null,
      guestPortalImageStorageId: args.guestPortalImageStorageId,
      guestPortalLinkLabel: normalizedGuestPortalLinkLabel,
      guestPortalLinkUrl: normalizedGuestPortalLinkUrl,
      eventDate: args.eventDate,
      eventEndDate: args.eventEndDate,
      eventTimezone: args.eventTimezone,
      status: eventStatus,
      maxAttendees: args.maxAttendees ?? 1,
      sendQrOnApproval: args.sendQrOnApproval,
      attendanceQuestionEnabled: args.attendanceQuestionEnabled,
      referralSharingEnabled,
      customFields: args.customFields,
      primaryFieldConfig,
      themeBackgroundColor: normalizedThemeBackgroundColor,
      themeTextColor: normalizedThemeTextColor,
      themeAccentColor: normalizedThemeAccentColor,
      approvalMessage: args.approvalMessage,
      rsvpConfirmationMessageEnabled: args.rsvpConfirmationMessageEnabled,
      rsvpConfirmationMessage: sanitizeOptionalRsvpConfirmationMessage(
        args.rsvpConfirmationMessage,
      ),
      smsOptInConfirmationMessage: sanitizeOptionalAutomatedEventMessage(
        args.smsOptInConfirmationMessage,
      ),
      smsOptOutConfirmationMessage: sanitizeOptionalAutomatedEventMessage(
        args.smsOptOutConfirmationMessage,
      ),
      qrDeliveryMessage: sanitizeOptionalAutomatedEventMessage(args.qrDeliveryMessage),
      qrCodeColor: normalizeOptionalHexColor(args.qrCodeColor, "QR code color"),
      creds: derivedCredentials,
    });
    return result;
  },
});

const updateArgsValidator = v.object(eventUpdateActionArgs);
export async function applyEventEditorChanges(
  ctx: MutationCtx,
  args: Infer<typeof updateArgsValidator>,
): Promise<EventEditorSaveResult> {
  const { eventId, patch, unsetFields, lists, siteKey, workspaceSlug } = args;
  await requireWorkspaceHost(ctx, { siteKey, workspaceSlug });

  const currentEvent = await ctx.db.get(eventId);
  if (!currentEvent) {
    throw new ValidationError("Event not found");
  }

  if (
    patch?.eventEndDate !== undefined ||
    (patch?.eventDate !== undefined && currentEvent.eventEndDate !== undefined)
  ) {
    const targetEventDate = patch.eventDate ?? currentEvent.eventDate;
    const targetEventEndDate = patch.eventEndDate ?? currentEvent.eventEndDate;
    if (targetEventEndDate !== undefined && targetEventEndDate <= targetEventDate) {
      throw new ValidationError("Event end must be after the event start");
    }
  }

  // Update event base fields via mutation to keep server/runtime separation
  if (patch && Object.keys(patch).length > 0) {
    const sanitizedPatch: EventPatch = { ...patch };
    if (patch.description !== undefined) {
      sanitizedPatch.description = sanitizeOptionalEventDescription(patch.description) ?? "";
    }
    if (patch.acts !== undefined) {
      sanitizedPatch.acts = sanitizeOptionalEventActs(patch.acts as EventActInput[]) ?? [];
    }
    if (patch.eventPartners !== undefined) {
      sanitizedPatch.eventPartners =
        sanitizeOptionalEventPartners(patch.eventPartners as EventPartnerInput[]) ?? [];
    }
    if (patch.sponsors !== undefined) {
      sanitizedPatch.sponsors =
        sanitizeOptionalEventPartners(patch.sponsors as EventPartnerInput[]) ?? [];
    }
    if (patch.themeBackgroundColor !== undefined) {
      sanitizedPatch.themeBackgroundColor = normalizeOptionalHexColor(
        patch.themeBackgroundColor,
        "Background color",
      );
    }
    if (patch.themeTextColor !== undefined) {
      sanitizedPatch.themeTextColor = normalizeOptionalHexColor(patch.themeTextColor, "Text color");
    }
    if (patch.themeAccentColor !== undefined) {
      sanitizedPatch.themeAccentColor = normalizeOptionalHexColor(
        patch.themeAccentColor,
        "Accent color",
      );
    }
    if (patch.approvalMessage !== undefined) {
      sanitizedPatch.approvalMessage = sanitizeOptionalApprovalMessage(patch.approvalMessage);
    }
    if (patch.rsvpConfirmationMessage !== undefined) {
      sanitizedPatch.rsvpConfirmationMessage = sanitizeOptionalRsvpConfirmationMessage(
        patch.rsvpConfirmationMessage,
      );
    }
    if (patch.smsOptInConfirmationMessage !== undefined) {
      sanitizedPatch.smsOptInConfirmationMessage = sanitizeOptionalAutomatedEventMessage(
        patch.smsOptInConfirmationMessage,
      );
    }
    if (patch.smsOptOutConfirmationMessage !== undefined) {
      sanitizedPatch.smsOptOutConfirmationMessage = sanitizeOptionalAutomatedEventMessage(
        patch.smsOptOutConfirmationMessage,
      );
    }
    if (patch.qrDeliveryMessage !== undefined) {
      sanitizedPatch.qrDeliveryMessage = sanitizeOptionalAutomatedEventMessage(
        patch.qrDeliveryMessage,
      );
    }
    if (patch.qrCodeColor !== undefined) {
      sanitizedPatch.qrCodeColor = normalizeOptionalHexColor(patch.qrCodeColor, "QR code color");
    }
    if (patch.customIconStorageId !== undefined) {
      sanitizedPatch.customIconStorageId = patch.customIconStorageId ?? null;
    }
    if (patch.primaryFieldConfig !== undefined) {
      sanitizedPatch.primaryFieldConfig = sanitizePrimaryFieldConfig(patch.primaryFieldConfig);
    }
    if (patch.guestPortalImageStorageId !== undefined) {
      sanitizedPatch.guestPortalImageStorageId = patch.guestPortalImageStorageId ?? undefined;
    }
    const unsetsGuestPortalLinkLabel = unsetFields?.includes("guestPortalLinkLabel") ?? false;
    const unsetsGuestPortalLinkUrl = unsetFields?.includes("guestPortalLinkUrl") ?? false;
    if (
      patch.guestPortalLinkLabel !== undefined ||
      patch.guestPortalLinkUrl !== undefined ||
      unsetsGuestPortalLinkLabel ||
      unsetsGuestPortalLinkUrl
    ) {
      const targetLinkLabel = unsetsGuestPortalLinkLabel
        ? ""
        : (patch.guestPortalLinkLabel ?? currentEvent.guestPortalLinkLabel ?? "");
      const targetLinkUrl = unsetsGuestPortalLinkUrl
        ? ""
        : (patch.guestPortalLinkUrl ?? currentEvent.guestPortalLinkUrl ?? "");
      const trimmedLinkLabel = targetLinkLabel.trim();
      const trimmedLinkUrl = targetLinkUrl.trim();
      const hasLabel = trimmedLinkLabel.length > 0;
      const hasUrl = trimmedLinkUrl.length > 0;

      if (hasLabel && !hasUrl) {
        throw new ValidationError("Guest experience link URL is required when a label is provided");
      }
      if (hasUrl && !hasLabel) {
        throw new ValidationError("Guest experience link label is required when a URL is provided");
      }

      let normalizedLinkUrl: string | undefined;
      if (hasUrl) {
        try {
          const parsedUrl = new URL(trimmedLinkUrl);
          if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
            throw new ValidationError("Guest experience link must use http or https");
          }
          normalizedLinkUrl = parsedUrl.toString();
        } catch (_error) {
          throw new ValidationError("Guest experience link must be a valid URL");
        }
      }

      if (patch.guestPortalLinkLabel !== undefined) {
        sanitizedPatch.guestPortalLinkLabel = trimmedLinkLabel;
      }
      if (patch.guestPortalLinkUrl !== undefined) {
        sanitizedPatch.guestPortalLinkUrl = normalizedLinkUrl;
      }
    }
    await applyEventChanges(
      ctx,
      {
        eventId,
        siteKey,
        workspaceSlug,
        unsetFields,
        ...sanitizedPatch,
      },
      true,
    );
  } else if (unsetFields && unsetFields.length > 0) {
    await applyEventChanges(
      ctx,
      {
        eventId,
        siteKey,
        workspaceSlug,
        unsetFields,
      },
      true,
    );
  }

  if (!lists) {
    await reconcileEventRouting(ctx, currentEvent);
    return { ok: true as const };
  }

  const savedLists = await saveEventLists(ctx, {
    eventId,
    siteKey,
    workspaceSlug,
    lists,
    expectedListsRevision: args.expectedListsRevision,
  });
  await reconcileEventRouting(ctx, currentEvent);

  return savedLists;
}
async function serializeEventWriteError<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (error instanceof DomainError)
      throw new PublicConvexError({
        code: error.code ?? "VALIDATION_ERROR",
        message: error.message,
      });
    throw error;
  }
}
export const update = mutation({
  args: eventUpdateActionArgs,
  handler: (ctx, args) => serializeEventWriteError(() => applyEventEditorChanges(ctx, args)),
});

export const updateAndPublish = mutation({
  args: eventUpdateActionArgs,
  handler: async (ctx, args): Promise<EventEditorSaveResult> => {
    return serializeEventWriteError(async () => {
      const saved = await applyEventEditorChanges(ctx, args);
      await publishEventChanges(ctx, {
        eventId: args.eventId,
        siteKey: args.siteKey,
        workspaceSlug: args.workspaceSlug,
      });
      return saved;
    });
  },
});
