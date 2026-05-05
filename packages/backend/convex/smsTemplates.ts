/**
 * SMS message templates for different types of notifications
 */

export interface SmsTemplateData {
  firstName?: string;
  eventName: string;
  eventDate: string;
  eventLocation: string;
  ticketUrl?: string;
  unsubscribeUrl?: string;
}

export class SmsTemplates {
  static approval(data: SmsTemplateData): string {
    return `🎉 ${data.firstName || 'Hi'}! Your RSVP for ${data.eventName} is approved!

📅 ${data.eventDate}
📍 ${data.eventLocation}

🎫 Your ticket: ${data.ticketUrl}

Show this at the door for entry.${data.unsubscribeUrl ? `\n\nText STOP to opt out: ${data.unsubscribeUrl}` : ''}`;
  }

  static reminder(data: SmsTemplateData): string {
    return `⏰ Reminder: ${data.eventName} starts soon!

📅 ${data.eventDate}
📍 ${data.eventLocation}

See you there! 🎉${data.unsubscribeUrl ? `\n\nText STOP to opt out: ${data.unsubscribeUrl}` : ''}`;
  }

  static lastCall(data: SmsTemplateData): string {
    return `🚨 Last call for ${data.eventName}!

📅 ${data.eventDate}
📍 ${data.eventLocation}

RSVP now or miss out!${data.unsubscribeUrl ? `\n\nText STOP to opt out: ${data.unsubscribeUrl}` : ''}`;
  }

  static eventUpdate(data: SmsTemplateData & { updateMessage: string }): string {
    return `📢 Update for ${data.eventName}:

${(data as any).updateMessage}

📅 ${data.eventDate}
📍 ${data.eventLocation}${data.unsubscribeUrl ? `\n\nText STOP to opt out: ${data.unsubscribeUrl}` : ''}`;
  }

  static cancellation(data: SmsTemplateData): string {
    return `❌ Event Cancelled: ${data.eventName}

We're sorry to inform you that ${data.eventName} scheduled for ${data.eventDate} has been cancelled.

We'll notify you of any rescheduled dates.${data.unsubscribeUrl ? `\n\nText STOP to opt out: ${data.unsubscribeUrl}` : ''}`;
  }
}

export type SmsTemplateType = 'approval' | 'reminder' | 'lastCall' | 'eventUpdate' | 'cancellation';