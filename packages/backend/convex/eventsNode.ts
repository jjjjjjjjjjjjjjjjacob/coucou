"use node";
import { action } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { api } from "./_generated/api";
import {
  ValidationError,
  DuplicateError,
  type EventPatch,
  type ListCredentialPatch,
  type CredentialData,
} from "./lib/types";
import type { Id } from "./_generated/dataModel";
import { sanitizeOptionalApprovalMessage } from "@coucou/sdk/shared/approval-messages";
import type { WorkspaceEventDefaults } from "@coucou/sdk/shared/primary-fields";
import { requireWorkspaceHost } from "./lib/workspaceAuth";
import { normalizeCredentialPassword } from "./lib/credentialPasswords";
import {
  eventActValidator,
  eventStatusValidator,
  sanitizeOptionalEventActs,
  sanitizeOptionalEventDescription,
  type EventActInput,
  type EventStatus,
} from "./lib/eventMetadata";
import {
  primaryFieldConfigFromWorkspaceDefaults,
  primaryFieldConfigValidator,
  sanitizePrimaryFieldConfig,
} from "./lib/primaryFields";

const HEX_COLOR_PATTERN = /^#(?:[0-9A-Fa-f]{6})$/;

type HostCredentialData = {
  _id: Id<"listCredentials">;
  eventId: Id<"events">;
  listKey: string;
  password?: string;
  generateQR?: boolean;
  approvalMessage?: string;
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
  const prefixedInput = trimmedInput.startsWith("#")
    ? trimmedInput
    : `#${trimmedInput}`;
  if (!HEX_COLOR_PATTERN.test(prefixedInput)) {
    throw new ValidationError(
      `${validationLabel} must be a 6-digit hex color (e.g. #FF0000)`,
    );
  }
  return `#${prefixedInput.slice(1).toUpperCase()}`;
}

function validateLocalPasswordUniqueness(
  candidates: EventPasswordCandidate[],
): void {
  const normalizedPasswords = new Set<string>();

  for (const candidate of candidates) {
    const normalizedPassword = normalizeCredentialPassword(candidate.password);
    if (normalizedPasswords.has(normalizedPassword)) {
      throw new ValidationError("List passwords must be unique within the event");
    }
    normalizedPasswords.add(normalizedPassword);
  }
}

async function ensureActiveEventPasswordsAreUnique(
  ctx: ActionCtx,
  options: {
    eventId?: Id<"events">;
    candidates: EventPasswordCandidate[];
  },
): Promise<void> {
  validateLocalPasswordUniqueness(options.candidates);

  for (const candidate of options.candidates) {
    const matchingCredentials = await ctx.runQuery(
      api.credentials.getByPassword,
      { password: candidate.password },
    );

    for (const matchingCredential of matchingCredentials) {
      if (
        candidate.credentialId &&
        matchingCredential._id === candidate.credentialId
      ) {
        continue;
      }
      if (options.eventId && matchingCredential.eventId === options.eventId) {
        continue;
      }

      const matchingEvent = await ctx.runQuery(api.events.get, {
        eventId: matchingCredential.eventId,
      });
      if (matchingEvent?.status === "active") {
        throw new DuplicateError(
          "Password already in use by an active event",
        );
      }
    }
  }
}

function buildFinalPasswordCandidates(
  existingCredentials: HostCredentialData[],
  lists:
    | Array<{
        id?: Id<"listCredentials">;
        listKey: string;
        password?: string;
      }>
    | undefined,
): EventPasswordCandidate[] {
  if (!lists) {
    return existingCredentials
      .filter((credential) => Boolean(credential.password?.trim()))
      .map((credential) => ({
        credentialId: credential._id,
        listKey: credential.listKey,
        password: credential.password!.trim(),
      }));
  }

  const existingById = new Map<Id<"listCredentials">, HostCredentialData>(
    existingCredentials.map((credential) => [credential._id, credential]),
  );

  return lists.flatMap((list) => {
      const currentCredential = list.id ? existingById.get(list.id) : undefined;
      const password = list.password?.trim() || currentCredential?.password?.trim();
      if (!password) return [];

      const candidate: EventPasswordCandidate = {
        credentialId: currentCredential?._id,
        listKey: list.listKey,
        password,
      };
      return [candidate];
    });
}

export const create = action({
  args: {
    workspaceSlug: v.optional(v.string()),
    siteKey: v.optional(v.string()),
    name: v.string(),
    secondaryTitle: v.optional(v.string()),
    description: v.optional(v.string()),
    acts: v.optional(v.array(eventActValidator)),
    hosts: v.optional(v.array(v.string())),
    productionCompany: v.optional(v.string()),
    location: v.string(),
    flyerUrl: v.optional(v.string()),
    flyerStorageId: v.optional(v.id("_storage")),
    customIconStorageId: v.optional(v.union(v.id("_storage"), v.null())),
    guestPortalImageStorageId: v.optional(v.id("_storage")),
    guestPortalLinkLabel: v.optional(v.string()),
    guestPortalLinkUrl: v.optional(v.string()),
    eventDate: v.number(),
    eventEndDate: v.number(),
    eventTimezone: v.optional(v.string()),
    status: v.optional(eventStatusValidator),
    maxAttendees: v.optional(v.number()),
    lists: v.array(
      v.object({
        listKey: v.string(),
        password: v.string(),
        generateQR: v.optional(v.boolean()),
        approvalMessage: v.optional(v.string()),
      }),
    ),
    customFields: v.optional(
      v.array(
        v.object({
          key: v.string(),
          label: v.string(),
          placeholder: v.optional(v.string()),
          required: v.optional(v.boolean()),
          copyEnabled: v.optional(v.boolean()),
          prependUrl: v.optional(v.string()),
          trimWhitespace: v.optional(v.boolean()),
        }),
      ),
    ),
    primaryFieldConfig: v.optional(primaryFieldConfigValidator),
    themeBackgroundColor: v.optional(v.string()),
    themeTextColor: v.optional(v.string()),
    approvalMessage: v.optional(v.string()),
    qrCodeColor: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ eventId: Id<"events"> }> => {
    await requireWorkspaceHost(ctx, {
      siteKey: args.siteKey,
      workspaceSlug: args.workspaceSlug,
    });

    const now = Date.now();
    if (args.eventDate < now)
      throw new Error("Event date must be in the future");
    if (args.eventEndDate <= args.eventDate) {
      throw new Error("Event end must be after the event start");
    }

    // Validate maxAttendees
    if (args.maxAttendees !== undefined) {
      if (args.maxAttendees < 1 || args.maxAttendees > 6) {
        throw new Error("Maximum attendees must be between 1 and 6");
      }
    }

    const eventStatus = args.status ?? "inactive";
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
      ({ listKey, password, generateQR, approvalMessage }) => {
        return {
          listKey,
          password,
          passwordNormalized: normalizeCredentialPassword(password),
          generateQR,
          approvalMessage: sanitizeOptionalApprovalMessage(approvalMessage),
        };
      },
    );

    const workspaceDefaults =
      args.workspaceSlug
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
    const primaryFieldConfig =
      sanitizePrimaryFieldConfig(args.primaryFieldConfig) ??
      primaryFieldConfigFromWorkspaceDefaults(workspaceEventDefaults);
    const trimmedGuestPortalLinkLabel =
      args.guestPortalLinkLabel?.trim() ?? "";
    const trimmedGuestPortalLinkUrl =
      args.guestPortalLinkUrl?.trim() ?? "";
    const hasGuestPortalLinkLabel = trimmedGuestPortalLinkLabel.length > 0;
    const hasGuestPortalLinkUrl = trimmedGuestPortalLinkUrl.length > 0;

    if (hasGuestPortalLinkLabel && !hasGuestPortalLinkUrl) {
      throw new ValidationError(
        "Guest experience link URL is required when a label is provided",
      );
    }
    if (hasGuestPortalLinkUrl && !hasGuestPortalLinkLabel) {
      throw new ValidationError(
        "Guest experience link label is required when a URL is provided",
      );
    }

    let normalizedGuestPortalLinkUrl: string | undefined;
    if (hasGuestPortalLinkUrl) {
      try {
        const parsedUrl = new URL(trimmedGuestPortalLinkUrl);
        if (
          parsedUrl.protocol !== "http:" &&
          parsedUrl.protocol !== "https:"
        ) {
          throw new ValidationError(
            "Guest experience link must use http or https",
          );
        }
        normalizedGuestPortalLinkUrl = parsedUrl.toString();
      } catch (error) {
        throw new ValidationError(
          "Guest experience link must be a valid URL",
        );
      }
    }
    const normalizedGuestPortalLinkLabel = hasGuestPortalLinkLabel
      ? trimmedGuestPortalLinkLabel
      : undefined;

    const result = await ctx.runMutation(api.events.insertWithCreds, {
      workspaceSlug: args.workspaceSlug,
      siteKey: args.siteKey,
      name: args.name,
      secondaryTitle: args.secondaryTitle,
      description: sanitizeOptionalEventDescription(args.description),
      acts: sanitizeOptionalEventActs(args.acts),
      hosts: args.hosts,
      productionCompany: args.productionCompany,
      location: args.location,
      flyerUrl: args.flyerUrl,
      flyerStorageId: args.flyerStorageId,
      customIconStorageId: args.customIconStorageId ?? null,
      guestPortalImageStorageId: args.guestPortalImageStorageId,
      guestPortalLinkLabel: normalizedGuestPortalLinkLabel,
      guestPortalLinkUrl: normalizedGuestPortalLinkUrl,
      eventDate: args.eventDate,
      eventEndDate: args.eventEndDate,
      eventTimezone: args.eventTimezone,
      status: eventStatus,
      maxAttendees: args.maxAttendees ?? 1,
      customFields: args.customFields,
      primaryFieldConfig,
      themeBackgroundColor: normalizedThemeBackgroundColor,
      themeTextColor: normalizedThemeTextColor,
      approvalMessage: args.approvalMessage,
      qrCodeColor: normalizeOptionalHexColor(args.qrCodeColor, "QR code color"),
      creds: derivedCredentials,
    });
    return result;
  },
});

export const update = action({
  args: {
    eventId: v.id("events"),
    siteKey: v.optional(v.string()),
    workspaceSlug: v.optional(v.string()),
    patch: v.optional(
      v.object({
        name: v.optional(v.string()),
        secondaryTitle: v.optional(v.string()),
        description: v.optional(v.string()),
        acts: v.optional(v.array(eventActValidator)),
        hosts: v.optional(v.array(v.string())),
        productionCompany: v.optional(v.string()),
        location: v.optional(v.string()),
        flyerStorageId: v.optional(v.id("_storage")),
        customIconStorageId: v.optional(v.union(v.id("_storage"), v.null())),
        guestPortalImageStorageId: v.optional(v.id("_storage")),
        guestPortalLinkLabel: v.optional(v.string()),
        guestPortalLinkUrl: v.optional(v.string()),
        eventDate: v.optional(v.number()),
        eventEndDate: v.optional(v.number()),
        eventTimezone: v.optional(v.string()),
        maxAttendees: v.optional(v.number()),
        status: v.optional(eventStatusValidator),
        customFields: v.optional(
          v.array(
            v.object({
              key: v.string(),
              label: v.string(),
              placeholder: v.optional(v.string()),
              required: v.optional(v.boolean()),
              copyEnabled: v.optional(v.boolean()),
              prependUrl: v.optional(v.string()),
              trimWhitespace: v.optional(v.boolean()),
            }),
          ),
        ),
        primaryFieldConfig: v.optional(primaryFieldConfigValidator),
        themeBackgroundColor: v.optional(v.string()),
        themeTextColor: v.optional(v.string()),
        approvalMessage: v.optional(v.string()),
        qrCodeColor: v.optional(v.string()),
      }),
    ),
    lists: v.optional(
      v.array(
        v.object({
          id: v.optional(v.id("listCredentials")),
          listKey: v.string(),
          password: v.optional(v.string()),
          generateQR: v.optional(v.boolean()),
          approvalMessage: v.optional(v.string()),
        }),
      ),
    ),
  },
  handler: async (ctx, args): Promise<{ ok: true }> => {
    const { eventId, patch, lists, siteKey, workspaceSlug } = args;
    await requireWorkspaceHost(ctx, { siteKey, workspaceSlug });

    const currentEvent = await ctx.runQuery(api.events.get, {
      eventId,
      siteKey,
      workspaceSlug,
    });
    if (!currentEvent) {
      throw new ValidationError("Event not found");
    }

    if (patch?.eventDate !== undefined || patch?.eventEndDate !== undefined) {
      const targetEventDate = patch.eventDate ?? currentEvent.eventDate;
      const targetEventEndDate =
        patch.eventEndDate ?? currentEvent.eventEndDate ?? targetEventDate;
      if (targetEventEndDate <= targetEventDate) {
        throw new ValidationError("Event end must be after the event start");
      }
    }

    const targetStatus = (patch?.status ??
      currentEvent.status ??
      "inactive") as EventStatus;
    const shouldValidateActivePasswords =
      targetStatus === "active" &&
      (patch?.status === "active" || lists !== undefined);
    const existingCredentials =
      lists || shouldValidateActivePasswords
        ? ((await ctx.runQuery(api.credentials.getHostCredsForEvent, {
            eventId,
            siteKey,
            workspaceSlug,
          })) as HostCredentialData[])
        : [];

    if (shouldValidateActivePasswords) {
      await ensureActiveEventPasswordsAreUnique(ctx, {
        eventId,
        candidates: buildFinalPasswordCandidates(existingCredentials, lists),
      });
    }

    // Update event base fields via mutation to keep server/runtime separation
    if (patch && Object.keys(patch).length > 0) {
      const sanitizedPatch: EventPatch = { ...patch };
      if (patch.description !== undefined) {
        sanitizedPatch.description =
          sanitizeOptionalEventDescription(patch.description) ?? "";
      }
      if (patch.acts !== undefined) {
        sanitizedPatch.acts = sanitizeOptionalEventActs(
          patch.acts as EventActInput[],
        ) ?? [];
      }
      if (patch.themeBackgroundColor !== undefined) {
        sanitizedPatch.themeBackgroundColor = normalizeOptionalHexColor(
          patch.themeBackgroundColor,
          "Background color",
        );
      }
      if (patch.themeTextColor !== undefined) {
        sanitizedPatch.themeTextColor = normalizeOptionalHexColor(
          patch.themeTextColor,
          "Text color",
        );
      }
      if (patch.approvalMessage !== undefined) {
        sanitizedPatch.approvalMessage = sanitizeOptionalApprovalMessage(
          patch.approvalMessage,
        );
      }
      if (patch.qrCodeColor !== undefined) {
        sanitizedPatch.qrCodeColor = normalizeOptionalHexColor(
          patch.qrCodeColor,
          "QR code color",
        );
      }
      if (patch.customIconStorageId !== undefined) {
        sanitizedPatch.customIconStorageId = patch.customIconStorageId ?? null;
      }
      if (patch.primaryFieldConfig !== undefined) {
        sanitizedPatch.primaryFieldConfig = sanitizePrimaryFieldConfig(
          patch.primaryFieldConfig,
        );
      }
      if (patch.guestPortalImageStorageId !== undefined) {
        sanitizedPatch.guestPortalImageStorageId =
          patch.guestPortalImageStorageId ?? undefined;
      }
      if (
        patch.guestPortalLinkLabel !== undefined ||
        patch.guestPortalLinkUrl !== undefined
      ) {
        const trimmedLinkLabel = (patch.guestPortalLinkLabel ?? "").trim();
        const trimmedLinkUrl = (patch.guestPortalLinkUrl ?? "").trim();
        const hasLabel = trimmedLinkLabel.length > 0;
        const hasUrl = trimmedLinkUrl.length > 0;

        if (hasLabel && !hasUrl) {
          throw new ValidationError(
            "Guest experience link URL is required when a label is provided",
          );
        }
        if (hasUrl && !hasLabel) {
          throw new ValidationError(
            "Guest experience link label is required when a URL is provided",
          );
        }

        let normalizedLinkUrl: string | undefined;
        if (hasUrl) {
          try {
            const parsedUrl = new URL(trimmedLinkUrl);
            if (
              parsedUrl.protocol !== "http:" &&
              parsedUrl.protocol !== "https:"
            ) {
              throw new ValidationError(
                "Guest experience link must use http or https",
              );
            }
            normalizedLinkUrl = parsedUrl.toString();
          } catch (error) {
            throw new ValidationError(
              "Guest experience link must be a valid URL",
            );
          }
        }

        sanitizedPatch.guestPortalLinkLabel = hasLabel
          ? trimmedLinkLabel
          : undefined;
        sanitizedPatch.guestPortalLinkUrl = normalizedLinkUrl;
      }
      await ctx.runMutation(api.events.update, {
        eventId,
        siteKey,
        workspaceSlug,
        ...sanitizedPatch,
      });
    }

    if (!lists) return { ok: true as const };

    const existingById = new Map<Id<"listCredentials">, HostCredentialData>(
      existingCredentials.map((credential) => [
        credential._id,
        credential,
      ]),
    );

    // For deletions: any existing not present in incoming by id
    const incomingIds = new Set<Id<"listCredentials">>(
      lists.flatMap((list) => (list.id ? [list.id] : [])),
    );
    for (const credential of existingCredentials) {
      if (!incomingIds.has(credential._id)) {
        await ctx.runMutation(api.events.removeListCredential, {
          id: credential._id,
          siteKey,
          workspaceSlug,
        });
      }
    }

    for (const list of lists) {
      const currentCredential = list.id ? existingById.get(list.id) : undefined;
      const wantsPasswordUpdate = list.password && list.password.length > 0;
      const nextGenerateQrCodeEnabled = list.generateQR ?? false;
      const nextApprovalMessage = sanitizeOptionalApprovalMessage(
        list.approvalMessage,
      );
      const credentialPatch: ListCredentialPatch = {};

      if (currentCredential) {
        if (list.listKey !== currentCredential.listKey) {
          credentialPatch.listKey = list.listKey;
        }
        if (wantsPasswordUpdate) {
          const passwordNormalized = normalizeCredentialPassword(
            list.password!,
          );

          credentialPatch.password = list.password!;
          credentialPatch.passwordNormalized = passwordNormalized;
        }
        const currentGenerateQrCodeEnabled =
          currentCredential.generateQR ?? false;
        if (nextGenerateQrCodeEnabled !== currentGenerateQrCodeEnabled) {
          credentialPatch.generateQR = nextGenerateQrCodeEnabled;
        }
        if (nextApprovalMessage !== currentCredential.approvalMessage) {
          credentialPatch.approvalMessage = nextApprovalMessage;
        }
        if (Object.keys(credentialPatch).length > 0) {
          await ctx.runMutation(api.events.updateListCredential, {
            id: currentCredential._id,
            patch: credentialPatch,
            siteKey,
            workspaceSlug,
          });
        }
      } else {
        // New credential - require password
        if (!wantsPasswordUpdate) continue; // skip if no password provided
        await ctx.runMutation(api.events.addListCredential, {
          eventId,
          siteKey,
          workspaceSlug,
          listKey: list.listKey,
          password: list.password!,
          passwordNormalized: normalizeCredentialPassword(list.password!),
          generateQR: nextGenerateQrCodeEnabled,
          approvalMessage: nextApprovalMessage,
        });
      }
    }

    return { ok: true as const };
  },
});
