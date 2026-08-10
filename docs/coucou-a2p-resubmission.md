# Coucou A2P 10DLC Resubmission

Use this package only after the updated Coucou and Danza Organica pages are deployed and publicly
reachable without authentication. Soluo LLC is the registered legal business. Coucou is the
consumer-facing messaging service operated by Soluo LLC and is the sender for this campaign.
Danza Organica and other organizers are event context, not separate senders under this campaign.

This documentation pass does not change production SMS templates or Twilio routing. Before moving
associative organizer traffic onto the approved Coucou Campaign, confirm the actual production
messages match the approved samples and that the correct Coucou sender is used.

## Campaign description

```text
Coucou, a messaging service operated by Soluo LLC, sends recurring operational SMS messages to guests who explicitly opt in on Coucou or Coucou-powered RSVP pages. Coucou is the sender and messaging-program operator. The organizer shown on an RSVP page supplies event context only. Messages include account notifications, RSVP and guest-list confirmations, tickets or QR-code links, event schedule or venue updates, and two-way responses to guest-initiated questions about events or reservations. This campaign does not send marketing or promotional offers, does not transfer consent to organizers for their own marketing, and does not use purchased, rented, or scraped lists.
```

## Message flow / opt-in

```text
End users opt in through a website form. A public live example is https://danzaorganica.coucou.events/events/dxhl99v/rsvp/full. Public program evidence is available at https://coucou.events/sms, with a directly hosted image at https://coucou.events/sms-opt-in-evidence.svg. The user enters a mobile number and may affirmatively select a separate optional checkbox that is unchecked by default. The RSVP can be submitted without selecting the checkbox. The checkbox states: “I agree to receive recurring SMS messages from Coucou, a Soluo LLC service, about Danza Organica events.” The adjacent disclosure states that Coucou may send account notifications, RSVP and guest-list updates, tickets or QR codes, event updates, and replies about Danza Organica events or reservations; that Danza Organica supplies the event context while Coucou is the sender and operates the messaging program; that message frequency varies; that message and data rates may apply; that users may reply STOP to opt out or HELP for help; and that consent is not a condition of purchase, RSVP, or admission. The disclosure links directly to Coucou’s Terms at https://coucou.events/terms and Privacy Policy at https://coucou.events/privacy. The Privacy Policy states that mobile phone numbers, mobile opt-in information, and messaging consent data are not shared, sold, or provided to third parties or affiliates for marketing or promotional purposes. Coucou records the organizer, event, form source, timestamp, IP address, phone number, consent status, and disclosure version. Initial enrollment is website-only. START and UNSTOP are used only to resubscribe after a prior opt-out. Coucou does not use purchased, rented, or scraped lists.
```

## Sample messages

```text
COUCOU for Danza Organica: You’re subscribed to recurring Coucou texts about RSVPs, guest-list status, tickets, event updates, and replies to your requests. Message frequency varies. Message and data rates may apply. Reply HELP for help or STOP to opt out.
```

```text
COUCOU for Danza Organica: Your RSVP for [Event Name] on [MM/DD/YYYY] is confirmed. View your status at https://danzaorganica.coucou.events/events/[EventID]/status. Reply STOP to opt out.
```

```text
COUCOU for Danza Organica: You’re on the guest list for [Event Name]. View your ticket or QR code: https://danzaorganica.coucou.events/redeem/[TicketCode]. Reply STOP to opt out.
```

```text
COUCOU for Danza Organica: The venue or schedule for [Event Name] has changed. View current details at https://danzaorganica.coucou.events/events/[EventID]. Reply STOP to opt out.
```

```text
COUCOU for Danza Organica: The organizer replied to your question about [Event Name]: “[Message Preview].” Reply here or view the conversation at https://danzaorganica.coucou.events/events/[EventID]/status. Reply STOP to opt out.
```

## Program fields

- Registered legal business / brand: Soluo LLC
- Consumer-facing service and sender: Coucou
- Website: https://coucou.events
- Privacy Policy URL: https://coucou.events/privacy
- Terms and Conditions URL: https://coucou.events/terms
- Public SMS program evidence: https://coucou.events/sms
- Hosted opt-in image: https://coucou.events/sms-opt-in-evidence.svg
- Live opt-in example: https://danzaorganica.coucou.events/events/dxhl99v/rsvp/full
- Initial opt-in method: Website only
- Opt-in keywords: Leave empty unless Twilio requires the resubscription keywords to be listed.
- Resubscription keywords: START, UNSTOP
- Opt-out keywords: STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT
- Help keywords: HELP, INFO

## Opt-out message

```text
COUCOU: You have been unsubscribed and will receive no more Coucou messages. Reply START to resubscribe.
```

## Help message

```text
COUCOU: For help, contact hello@coucou.events or visit https://coucou.events. Message frequency varies. Message and data rates may apply. Reply STOP to opt out.
```

## Pre-resubmission checklist

- Deploy the code and verify /, /sms, /terms, and /privacy on coucou.events return 200 while signed out.
- Verify the live Danza Organica RSVP URL returns 200 while signed out and visibly shows the unchecked Coucou checkbox, full disclosure, and Coucou policy links.
- Verify both hosted evidence SVGs reflect Coucou as sender.
- Confirm every submitted sample begins with COUCOU for Danza Organica: and matches the non-marketing operational use case.
- Use only the Coucou Terms and Privacy URLs in the campaign fields and message flow.
- Edit and resubmit the existing rejected campaign rather than deleting and recreating it.
- If Twilio still treats the traffic as organizer-authored customer traffic instead of Coucou service traffic, stop using the general campaign for that organizer and register the organizer through Twilio’s ISV secondary-customer Brand and Campaign flow.
