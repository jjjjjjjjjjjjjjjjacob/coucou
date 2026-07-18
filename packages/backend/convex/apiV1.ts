import { internal } from "./_generated/api";
import { httpAction } from "./_generated/server";
import {
  API_EVENTS_DEFAULT_PAGE_SIZE,
  API_EVENTS_MAX_PAGE_SIZE,
} from "./apiV1Data";
import {
  authenticateApiRequest,
  buildApiErrorResponse,
  buildApiJsonResponse,
} from "./lib/apiRequestAuth";

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

  return buildApiErrorResponse("not_found", "Unknown API route");
});

const VALID_ATTENDANCE_STATUSES = ["yes", "no", "maybe"] as const;
type ApiAttendanceStatus = (typeof VALID_ATTENDANCE_STATUSES)[number];

function isApiAttendanceStatus(value: unknown): value is ApiAttendanceStatus {
  return (
    typeof value === "string" && (VALID_ATTENDANCE_STATUSES as readonly string[]).includes(value)
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
  const { phone, name, listKey, attendees, attendanceStatus, note } = parsedBody.body;

  if (typeof phone !== "string" || phone.trim().length === 0) {
    return buildApiErrorResponse("invalid_request", "phone is required");
  }
  if (typeof name !== "string" || name.trim().length === 0) {
    return buildApiErrorResponse("invalid_request", "name is required");
  }
  if (typeof listKey !== "string" || listKey.length === 0) {
    return buildApiErrorResponse("invalid_request", "listKey is required");
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

  const writeResult = await ctx.runMutation(internal.apiV1Data.createRsvpFromApiClient, {
    apiClientId: authResult.apiClient._id,
    workspaceSlug: authResult.workspaceSlug,
    eventRouteId: pathSegments[0],
    phone,
    name,
    listKey,
    attendees,
    attendanceStatus,
    note,
  });
  if (!writeResult.ok) {
    return buildApiErrorResponse(writeResult.errorCode, writeResult.message);
  }
  return buildApiJsonResponse(
    { created: writeResult.created, rsvp: writeResult.rsvp },
    writeResult.created ? 201 : 200,
  );
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

export { EVENTS_PATH_PREFIX, RSVPS_PATH_PREFIX, parsePathSegmentsAfterPrefix };
