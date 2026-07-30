import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import { API_EVENTS_DEFAULT_PAGE_SIZE, API_EVENTS_MAX_PAGE_SIZE } from "./apiV1Data";
import {
  authenticateApiRequest,
  buildApiErrorResponse,
  buildApiJsonResponse,
} from "./lib/apiRequestAuth";
import { formatPhoneNumberForSms } from "./lib/phoneUtils";

const EVENTS_PATH_PREFIX = "/api/v1/events/";
const RSVPS_PATH_PREFIX = "/api/v1/rsvps/";

function parsePathSegmentsAfterPrefix(request: Request, prefix: string): string[] {
  const pathname = new URL(request.url).pathname;
  if (!pathname.startsWith(prefix)) {
    return [];
  }
  return pathname
    .slice(prefix.length)
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => decodeURIComponent(segment));
}

export const listEvents = httpAction(async (ctx, request) => {
  const authResult = await authenticateApiRequest(ctx, request, "events:read");
  if (!authResult.ok) {
    return authResult.response;
  }

  const url = new URL(request.url);
  const statusParam = url.searchParams.get("status") ?? "published";
  if (statusParam !== "published" && statusParam !== "all") {
    return buildApiErrorResponse("invalid_request", 'status must be "published" or "all"');
  }

  const limitParam = url.searchParams.get("limit");
  let limit = API_EVENTS_DEFAULT_PAGE_SIZE;
  if (limitParam !== null) {
    const parsedLimit = Number.parseInt(limitParam, 10);
    if (Number.isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > API_EVENTS_MAX_PAGE_SIZE) {
      return buildApiErrorResponse(
        "invalid_request",
        `limit must be an integer between 1 and ${API_EVENTS_MAX_PAGE_SIZE}`,
      );
    }
    limit = parsedLimit;
  }

  const result = await ctx.runQuery(internal.apiV1Data.listEventsForApiClient, {
    apiClientId: authResult.apiClient._id,
    workspaceSlug: authResult.workspaceSlug,
    statusFilter: statusParam,
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit,
  });

  return buildApiJsonResponse(result);
});

export const handleEventSubresourceGet = httpAction(async (ctx, request) => {
  const pathSegments = parsePathSegmentsAfterPrefix(request, EVENTS_PATH_PREFIX);

  // GET /api/v1/events/{eventRouteId}
  if (pathSegments.length === 1) {
    const authResult = await authenticateApiRequest(ctx, request, "events:read");
    if (!authResult.ok) {
      return authResult.response;
    }

    const event = await ctx.runQuery(internal.apiV1Data.getEventForApiClient, {
      apiClientId: authResult.apiClient._id,
      workspaceSlug: authResult.workspaceSlug,
      eventRouteId: pathSegments[0],
    });
    if (!event) {
      return buildApiErrorResponse("not_found", "Event not found");
    }
    return buildApiJsonResponse(event);
  }

  // GET /api/v1/events/{eventRouteId}/rsvps/lookup?phone=E164
  if (pathSegments.length === 3 && pathSegments[1] === "rsvps" && pathSegments[2] === "lookup") {
    const authResult = await authenticateApiRequest(ctx, request, "rsvps:read");
    if (!authResult.ok) {
      return authResult.response;
    }

    const phone = new URL(request.url).searchParams.get("phone");
    if (!phone) {
      return buildApiErrorResponse("invalid_request", "phone query parameter is required");
    }

    const lookupResult = await ctx.runQuery(internal.apiV1Data.lookupRsvpForPhoneForApiClient, {
      apiClientId: authResult.apiClient._id,
      workspaceSlug: authResult.workspaceSlug,
      eventRouteId: pathSegments[0],
      phone,
    });
    if (!lookupResult.eventFound) {
      return buildApiErrorResponse("not_found", "Event not found");
    }
    if (!lookupResult.rsvp) {
      return buildApiErrorResponse("not_found", "No RSVP found for this phone number");
    }
    return buildApiJsonResponse(lookupResult.rsvp);
  }

  // GET /api/v1/events/{eventRouteId}/rsvps/sms-consent?phone=E164
  if (
    pathSegments.length === 3 &&
    pathSegments[1] === "rsvps" &&
    pathSegments[2] === "sms-consent"
  ) {
    const authResult = await authenticateApiRequest(ctx, request, "rsvps:read");
    if (!authResult.ok) {
      return authResult.response;
    }

    const phone = new URL(request.url).searchParams.get("phone")?.trim() || undefined;
    if (phone) {
      try {
        formatPhoneNumberForSms(phone);
      } catch (error) {
        return buildApiErrorResponse(
          "invalid_request",
          error instanceof Error ? error.message : "Invalid phone number",
          "phone",
        );
      }
    }

    const consentResult = await ctx.runQuery(internal.apiV1Data.getSmsConsentForApiClient, {
      apiClientId: authResult.apiClient._id,
      workspaceSlug: authResult.workspaceSlug,
      eventRouteId: pathSegments[0],
      phone,
    });
    if (!consentResult.eventFound) {
      return buildApiErrorResponse("not_found", "Event not found");
    }
    return buildApiJsonResponse({
      smsConsent: consentResult.smsConsent,
      smsConsentTimestamp: consentResult.smsConsentTimestamp,
      smsProgram: consentResult.smsProgram,
    });
  }

  // GET /api/v1/events/{eventRouteId}/rsvps
  if (pathSegments.length === 2 && pathSegments[1] === "rsvps") {
    const authResult = await authenticateApiRequest(ctx, request, "rsvps:read");
    if (!authResult.ok) {
      return authResult.response;
    }

    const url = new URL(request.url);
    const limitParam = url.searchParams.get("limit");
    let limit = API_EVENTS_DEFAULT_PAGE_SIZE;
    if (limitParam !== null) {
      const parsedLimit = Number.parseInt(limitParam, 10);
      if (Number.isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > API_EVENTS_MAX_PAGE_SIZE) {
        return buildApiErrorResponse(
          "invalid_request",
          `limit must be an integer between 1 and ${API_EVENTS_MAX_PAGE_SIZE}`,
        );
      }
      limit = parsedLimit;
    }

    const listResult = await ctx.runQuery(internal.apiV1Data.listRsvpsForApiClient, {
      apiClientId: authResult.apiClient._id,
      workspaceSlug: authResult.workspaceSlug,
      eventRouteId: pathSegments[0],
      cursor: url.searchParams.get("cursor") ?? undefined,
      limit,
    });
    if (!listResult.eventFound) {
      return buildApiErrorResponse("not_found", "Event not found");
    }
    return buildApiJsonResponse({
      data: listResult.data,
      nextCursor: listResult.nextCursor,
    });
  }

  return buildApiErrorResponse("not_found", "Unknown API route");
});

const VALID_ATTENDANCE_STATUSES = ["yes", "no", "maybe"] as const;
type ApiAttendanceStatus = (typeof VALID_ATTENDANCE_STATUSES)[number];

function isApiAttendanceStatus(value: unknown): value is ApiAttendanceStatus {
  return (
    typeof value === "string" && (VALID_ATTENDANCE_STATUSES as readonly string[]).includes(value)
  );
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

function isSubmittedSocialProfiles(
  value: unknown,
): value is Array<{ platformKey: string; handle: string }> {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        !Array.isArray(entry) &&
        typeof (entry as Record<string, unknown>).platformKey === "string" &&
        typeof (entry as Record<string, unknown>).handle === "string",
    )
  );
}

async function parseJsonRequestBody(
  request: Request,
): Promise<{ ok: true; body: Record<string, unknown> } | { ok: false; response: Response }> {
  try {
    const body = await request.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return {
        ok: false,
        response: buildApiErrorResponse("invalid_request", "Request body must be a JSON object"),
      };
    }
    return { ok: true, body: body as Record<string, unknown> };
  } catch {
    return {
      ok: false,
      response: buildApiErrorResponse("invalid_request", "Request body must be valid JSON"),
    };
  }
}

// POST /api/v1/events/{eventRouteId}/rsvps
export const handleEventSubresourcePost = httpAction(async (ctx, request) => {
  const pathSegments = parsePathSegmentsAfterPrefix(request, EVENTS_PATH_PREFIX);
  if (pathSegments.length !== 2 || pathSegments[1] !== "rsvps") {
    return buildApiErrorResponse("not_found", "Unknown API route");
  }

  const authResult = await authenticateApiRequest(ctx, request, "rsvps:write");
  if (!authResult.ok) {
    return authResult.response;
  }

  const parsedBody = await parseJsonRequestBody(request);
  if (!parsedBody.ok) {
    return parsedBody.response;
  }
  const {
    phone,
    name,
    listKey,
    listPassword,
    attendees,
    attendanceStatus,
    note,
    customFieldValues,
    socialProfiles,
    invitedByName,
    smsConsent,
    smsConsentIpAddress,
  } = parsedBody.body;

  if (typeof phone !== "string" || phone.trim().length === 0) {
    return buildApiErrorResponse("invalid_request", "phone is required");
  }
  if (typeof name !== "string" || name.trim().length === 0) {
    return buildApiErrorResponse("invalid_request", "name is required");
  }
  if (listKey !== undefined && typeof listKey !== "string") {
    return buildApiErrorResponse("invalid_request", "listKey must be a string", "listKey");
  }
  if (listPassword !== undefined && typeof listPassword !== "string") {
    return buildApiErrorResponse(
      "invalid_request",
      "listPassword must be a string",
      "listPassword",
    );
  }
  if (attendees !== undefined && typeof attendees !== "number") {
    return buildApiErrorResponse("invalid_request", "attendees must be a number");
  }
  if (attendanceStatus !== undefined && !isApiAttendanceStatus(attendanceStatus)) {
    return buildApiErrorResponse(
      "invalid_request",
      'attendanceStatus must be "yes", "no", or "maybe"',
    );
  }
  if (note !== undefined && typeof note !== "string") {
    return buildApiErrorResponse("invalid_request", "note must be a string");
  }
  if (customFieldValues !== undefined && !isStringRecord(customFieldValues)) {
    return buildApiErrorResponse(
      "invalid_request",
      "customFieldValues must be an object whose values are strings",
      "customFieldValues",
    );
  }
  if (socialProfiles !== undefined && !isSubmittedSocialProfiles(socialProfiles)) {
    return buildApiErrorResponse(
      "invalid_request",
      "socialProfiles must contain platformKey and handle strings",
      "socialProfiles",
    );
  }
  if (invitedByName !== undefined && typeof invitedByName !== "string") {
    return buildApiErrorResponse(
      "invalid_request",
      "invitedByName must be a string",
      "invitedByName",
    );
  }
  if (smsConsent !== undefined && typeof smsConsent !== "boolean") {
    return buildApiErrorResponse("invalid_request", "smsConsent must be a boolean", "smsConsent");
  }
  if (smsConsentIpAddress !== undefined && typeof smsConsentIpAddress !== "string") {
    return buildApiErrorResponse(
      "invalid_request",
      "smsConsentIpAddress must be a string",
      "smsConsentIpAddress",
    );
  }

  const writeResult = await ctx.runMutation(internal.apiV1Data.createRsvpFromApiClient, {
    apiClientId: authResult.apiClient._id,
    workspaceSlug: authResult.workspaceSlug,
    eventRouteId: pathSegments[0],
    phone,
    name,
    listKey: listKey as string | undefined,
    listPassword: listPassword as string | undefined,
    attendees,
    attendanceStatus,
    note,
    customFieldValues: customFieldValues as Record<string, string> | undefined,
    socialProfiles: socialProfiles as Array<{ platformKey: string; handle: string }> | undefined,
    invitedByName: invitedByName as string | undefined,
    smsConsent: smsConsent as boolean | undefined,
    smsConsentIpAddress: smsConsentIpAddress as string | undefined,
  });
  if (!writeResult.ok) {
    return buildApiErrorResponse(writeResult.errorCode, writeResult.message, writeResult.field);
  }
  return buildApiJsonResponse(
    { created: writeResult.created, rsvp: writeResult.rsvp },
    writeResult.created ? 201 : 200,
  );
});

// PATCH /api/v1/events/{eventRouteId}
export const handleEventPatch = httpAction(async (ctx, request) => {
  const pathSegments = parsePathSegmentsAfterPrefix(request, EVENTS_PATH_PREFIX);
  if (pathSegments.length !== 1) {
    return buildApiErrorResponse("not_found", "Unknown API route");
  }

  const authResult = await authenticateApiRequest(ctx, request, "events:write");
  if (!authResult.ok) {
    return authResult.response;
  }

  const parsedBody = await parseJsonRequestBody(request);
  if (!parsedBody.ok) {
    return parsedBody.response;
  }
  const {
    name,
    secondaryTitle,
    description,
    location,
    eventDate,
    eventEndDate,
    eventTimezone,
    maxAttendees,
    flyerUrl,
  } = parsedBody.body;

  const stringFieldValidations: [string, unknown][] = [
    ["name", name],
    ["location", location],
  ];
  for (const [fieldName, fieldValue] of stringFieldValidations) {
    if (fieldValue !== undefined && typeof fieldValue !== "string") {
      return buildApiErrorResponse("invalid_request", `${fieldName} must be a string`);
    }
  }
  const nullableStringFieldValidations: [string, unknown][] = [
    ["secondaryTitle", secondaryTitle],
    ["description", description],
    ["eventTimezone", eventTimezone],
    ["flyerUrl", flyerUrl],
  ];
  for (const [fieldName, fieldValue] of nullableStringFieldValidations) {
    if (fieldValue !== undefined && fieldValue !== null && typeof fieldValue !== "string") {
      return buildApiErrorResponse("invalid_request", `${fieldName} must be a string or null`);
    }
  }
  if (eventDate !== undefined && typeof eventDate !== "number") {
    return buildApiErrorResponse("invalid_request", "eventDate must be a number (ms epoch)");
  }
  if (eventEndDate !== undefined && eventEndDate !== null && typeof eventEndDate !== "number") {
    return buildApiErrorResponse(
      "invalid_request",
      "eventEndDate must be a number (ms epoch) or null",
    );
  }
  if (maxAttendees !== undefined && typeof maxAttendees !== "number") {
    return buildApiErrorResponse("invalid_request", "maxAttendees must be a number");
  }

  const writeResult = await ctx.runMutation(internal.apiV1Data.updateEventFromApiClient, {
    apiClientId: authResult.apiClient._id,
    workspaceSlug: authResult.workspaceSlug,
    eventRouteId: pathSegments[0],
    name: name as string | undefined,
    secondaryTitle: secondaryTitle as string | null | undefined,
    description: description as string | null | undefined,
    location: location as string | undefined,
    eventDate: eventDate as number | undefined,
    eventEndDate: eventEndDate as number | null | undefined,
    eventTimezone: eventTimezone as string | null | undefined,
    maxAttendees: maxAttendees as number | undefined,
    flyerUrl: flyerUrl as string | null | undefined,
  });
  if (!writeResult.ok) {
    return buildApiErrorResponse(writeResult.errorCode, writeResult.message);
  }
  return buildApiJsonResponse({ changed: writeResult.changed, event: writeResult.event });
});

// PATCH /api/v1/rsvps/{rsvpId}
export const handleRsvpPatch = httpAction(async (ctx, request) => {
  const pathSegments = parsePathSegmentsAfterPrefix(request, RSVPS_PATH_PREFIX);
  if (pathSegments.length !== 1) {
    return buildApiErrorResponse("not_found", "Unknown API route");
  }

  const authResult = await authenticateApiRequest(ctx, request, "rsvps:write");
  if (!authResult.ok) {
    return authResult.response;
  }

  const parsedBody = await parseJsonRequestBody(request);
  if (!parsedBody.ok) {
    return parsedBody.response;
  }
  const { attendanceStatus } = parsedBody.body;
  if (!isApiAttendanceStatus(attendanceStatus)) {
    return buildApiErrorResponse(
      "invalid_request",
      'attendanceStatus must be "yes", "no", or "maybe"',
    );
  }

  const writeResult = await ctx.runMutation(internal.apiV1Data.updateAttendanceFromApiClient, {
    apiClientId: authResult.apiClient._id,
    workspaceSlug: authResult.workspaceSlug,
    rsvpId: pathSegments[0],
    attendanceStatus,
  });
  if (!writeResult.ok) {
    return buildApiErrorResponse(writeResult.errorCode, writeResult.message);
  }
  return buildApiJsonResponse({ rsvp: writeResult.rsvp });
});

// DELETE /api/v1/rsvps/{rsvpId} — soft cancel (attendanceStatus="no").
// No hard delete via the API: the RSVP stays visible to hosts and aggregate
// counts remain consistent.
export const handleRsvpDelete = httpAction(async (ctx, request) => {
  const pathSegments = parsePathSegmentsAfterPrefix(request, RSVPS_PATH_PREFIX);
  if (pathSegments.length !== 1) {
    return buildApiErrorResponse("not_found", "Unknown API route");
  }

  const authResult = await authenticateApiRequest(ctx, request, "rsvps:write");
  if (!authResult.ok) {
    return authResult.response;
  }

  const writeResult = await ctx.runMutation(internal.apiV1Data.updateAttendanceFromApiClient, {
    apiClientId: authResult.apiClient._id,
    workspaceSlug: authResult.workspaceSlug,
    rsvpId: pathSegments[0],
    attendanceStatus: "no",
  });
  if (!writeResult.ok) {
    return buildApiErrorResponse(writeResult.errorCode, writeResult.message);
  }
  return buildApiJsonResponse({ cancelled: true, rsvp: writeResult.rsvp });
});

export { EVENTS_PATH_PREFIX, parsePathSegmentsAfterPrefix, RSVPS_PATH_PREFIX };
