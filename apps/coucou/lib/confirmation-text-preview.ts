import { createTimestamp } from "@/lib/date-utils";
import {
  formatEventDateForMessageTemplate,
  formatEventTitleForMessageTemplate,
  type MessageTemplateVariables,
} from "@/lib/text-blast-message";

export function buildConfirmationPreviewVariables(values: {
  name?: string;
  secondaryTitle?: string;
  eventDate?: string;
  eventTime?: string;
  eventTimezone?: string;
  location?: string;
}): MessageTemplateVariables {
  let eventDate = "12.31.2024";
  if (values.eventDate) {
    try {
      eventDate = formatEventDateForMessageTemplate(
        createTimestamp(
          values.eventDate,
          values.eventTime || "19:00",
          values.eventTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
        ),
        values.eventTimezone,
      );
    } catch {
      eventDate = values.eventDate;
    }
  }

  return {
    firstName: "John",
    eventName: formatEventTitleForMessageTemplate({
      name: values.name || "Sample Event",
      secondaryTitle: values.secondaryTitle,
    }),
    eventDate,
    eventLocation: values.location?.trim() || "Sample Location",
    qrCodeUrl: "https://example.com/ticket",
  };
}
