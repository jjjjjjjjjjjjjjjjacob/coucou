# Club Chlorine A2P 10DLC Resubmission

Use this package only after the public Club Chlorine SMS, Terms, and Privacy pages are deployed.
Club Chlorine must be the exact approved Brand name or a documented DBA belonging to the legal
entity in the Twilio Customer Profile. Club Chlorine is an independent organizer and SMS sender.
Coucou is an event-management and messaging service operated by Soluo LLC; Soluo LLC does not own
or operate Club Chlorine or its events.

This documentation pass does not change production SMS templates or Twilio routing. Do not activate
Club Chlorine-branded traffic until its secondary customer profile, Brand, Campaign, and sender
routing are approved and the actual messages match the approved samples.

## Campaign settings

- **Campaign use case:** Low Volume Mixed, provided Club Chlorine remains eligible for Twilio's
  low-volume tier. Otherwise select the corresponding standard Mixed use case.
- **Embedded links:** Yes
- **Embedded phone numbers:** No
- **Direct lending or loan content:** No
- **Age-gated content:** Select Yes if messages or linked events require guests to be 21 or older.
  Do not select or submit an age-gated campaign until the website and opt-in flow perform compliant
  age verification. Select No only if the website, linked events, samples, and actual traffic do not
  contain age-restricted or alcohol-related content.

## Campaign description

```text
Club Chlorine is the sender of this recurring operational event-management SMS program. Messages are sent through Coucou, an event-management and messaging service operated by Soluo LLC, to Club Chlorine guests who enter their mobile number and affirmatively select a separate, optional SMS consent checkbox on a Club Chlorine RSVP page. Consenting guests receive enrollment confirmations, account and RSVP notifications, guest-list status, tickets or QR codes, event schedule, time, or venue changes, and replies from Club Chlorine staff to guest-initiated event or reservation questions. Club Chlorine determines the event content and communicates with its guests; Coucou supplies the software, consent-recording tools, and messaging technology. Messages do not include marketing or promotional offers, and no purchased, rented, or scraped contact lists are used.
```

## Sample messages

### Sample message 1

```text
CLUB CHLORINE: You’re subscribed to recurring Club Chlorine texts about RSVPs, guest-list status, tickets, event updates, and replies to your requests. Message frequency varies. Message and data rates may apply. Reply HELP for help or STOP to opt out.
```

### Sample message 2

```text
CLUB CHLORINE: You’re on the VIP list for [Event Name] on [MM/DD/YYYY]. View your entry QR code: https://clubchlorine.party/redeem/[TicketCode]. Reply STOP to opt out.
```

### Sample message 3

```text
CLUB CHLORINE: [Organizer Name] sent you a message about [Event Name]: “[Message Preview].” Reply here or view the conversation at https://clubchlorine.party/events/[EventID]/status. Reply STOP to opt out.
```

### Sample message 4

```text
CLUB CHLORINE: We received your table request for [Event Name] on [MM/DD/YYYY]. A Club Chlorine organizer will follow up with availability and pricing. Reply STOP to opt out.
```

### Sample message 5

```text
CLUB CHLORINE: The schedule for [Event Name] has been updated. View the latest event details at https://clubchlorine.party/events/[EventID]. Reply STOP to opt out.
```

## Public URLs

- **Website:** https://clubchlorine.party
- **Opt-in evidence:** https://clubchlorine.party/sms
- **Direct opt-in evidence image:** https://clubchlorine.party/sms-opt-in-evidence.svg
- **Privacy Policy:** https://clubchlorine.party/privacy
- **Terms and Conditions:** https://clubchlorine.party/terms

## How do end users consent to receive messages?

```text
End users opt in on Club Chlorine RSVP pages at https://clubchlorine.party. Public opt-in evidence and the complete SMS program disclosure are available at https://clubchlorine.party/sms, with a directly hosted evidence image at https://clubchlorine.party/sms-opt-in-evidence.svg. The user enters a mobile phone number and may affirmatively select a separate optional checkbox that is unchecked by default. The RSVP can be submitted without selecting the checkbox. The checkbox states: “I agree to receive recurring SMS messages from Club Chlorine.” The accompanying disclosure explains that Club Chlorine is the organizer and SMS sender; that Coucou, a service operated by Soluo LLC, provides the event-management and messaging technology; that messages may include account notifications, RSVP and guest-list updates, tickets or QR codes, event updates, and replies about events or reservations; that message frequency varies; that message and data rates may apply; that users may reply STOP to opt out or HELP for help; and that consent is not a condition of purchase, RSVP, or admission. The disclosure links directly to Club Chlorine’s Terms at https://clubchlorine.party/terms and Privacy Policy at https://clubchlorine.party/privacy. Users who opt in receive an immediate confirmation message. Club Chlorine does not use purchased, rented, or scraped lists. Initial enrollment is through the website only; START and UNSTOP are used only to resubscribe after a prior opt-out.
```

## Keywords and automatic responses

### Opt-in keywords

`START,UNSTOP`

### Opt-in confirmation

```text
CLUB CHLORINE: You’re subscribed to recurring Club Chlorine texts about RSVPs, guest-list status, tickets, event updates, and replies to your requests. Message frequency varies. Message and data rates may apply. Reply HELP for help or STOP to opt out.
```

### Opt-out keywords

`STOP,STOPALL,UNSUBSCRIBE,CANCEL,END,QUIT,OPTOUT,REVOKE`

### Opt-out message

```text
CLUB CHLORINE: You have been unsubscribed and will receive no more Club Chlorine messages. Reply START to resubscribe.
```

### Help keywords

`HELP,INFO`

### Help message

```text
CLUB CHLORINE: For help, contact support@clubchlorine.party or visit https://clubchlorine.party. Message frequency varies. Message and data rates may apply. Reply STOP to opt out.
```

## Approval checklist

- Confirm the Twilio Brand is exactly `Club Chlorine`, or that Club Chlorine is a documented DBA.
- Confirm `support@clubchlorine.party` exists and is monitored.
- Open the website, `/sms`, `/terms`, and `/privacy` URLs in a signed-out browser.
- Confirm the production RSVP checkbox is unchecked for a guest with no existing Club Chlorine
  consent and that the RSVP can be submitted without selecting it.
- Confirm opt-in sends the submitted confirmation message immediately.
- Configure Twilio Advanced Opt-Out with the exact STOP, START, and HELP responses above.
- Confirm production messages use `CLUB CHLORINE:` and Club Chlorine-domain links.
- Confirm the age-gated answer matches the real website, opt-in controls, linked content, and
  traffic. Alcohol-related traffic requires a robust 21+ age gate; do not rely on a yes/no checkbox.
- Do not include event-host-as-sender, marketing, offers, purchased lists, or Coucou as the Brand.

## Dojo Pomodoro follow-on

The separate, Dojo-specific copy and approval gates are in
[`dojo-pomodoro-a2p-follow-on.md`](./dojo-pomodoro-a2p-follow-on.md). Do not reuse Club Chlorine
screenshots or URLs. Danza Organica is out of scope.
