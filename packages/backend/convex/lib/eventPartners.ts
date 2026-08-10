import {
  EventPartnerValidationError,
  sanitizeEventPartners,
} from "@coucou/sdk/shared/event-partners";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { ValidationError } from "./types";

export const eventPartnerValidator = v.object({
  label: v.string(),
  logoStorageId: v.id("_storage"),
  url: v.optional(v.string()),
});

export interface EventPartnerInput {
  label: string;
  logoStorageId: Id<"_storage">;
  url?: string;
}

export function sanitizeOptionalEventPartners(
  partners: EventPartnerInput[] | undefined,
): EventPartnerInput[] | undefined {
  try {
    return sanitizeEventPartners(partners);
  } catch (error) {
    if (error instanceof EventPartnerValidationError) {
      throw new ValidationError(error.message);
    }
    throw error;
  }
}
