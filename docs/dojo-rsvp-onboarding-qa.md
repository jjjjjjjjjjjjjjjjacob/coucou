# Dojo RSVP onboarding checks

The expected order for a new guest is:

1. Submit the RSVP form. This saves a 15-minute draft; it does not create an RSVP, enroll the phone in SMS, reserve an automatic approval, or send a confirmation.
2. Open Dojo's branded verification screen headed “Verify your number to RSVP,” with the phone already populated. If Clerk already has an unexpired pending code for that phone, go directly to code entry. Otherwise, request the first code automatically. If Clerk displays a CAPTCHA, complete it here.
3. Show code entry only after Clerk confirms that the verification code was sent.
4. Enter a valid code and establish the Clerk session. The backend checks the account's verified phone against the draft, then submits the RSVP and schedules the applicable confirmation or approval text.
5. Return to the ticket, pending status, or denied page. Retrying completion with the same draft cannot create another RSVP or confirmation.

Opening sign-in from the tomato menu keeps the “Sign in to Dojo Pomodoro” heading.

Guests who retain their already verified, signed-in phone submit directly. Changing the phone starts verification for that number.

## Local environment prerequisites

- Run `bun run dev` from the repository root and wait for Convex to finish syncing the functions and schema. Keep Dojo, Coucou, and Convex on the same development environment.
- With the default local ports, Dojo uses `http://localhost:5678` and authentication uses `http://localhost:5680/clients/dojo/sign-in`. The return URL stays on localhost and preserves event, password, referral, and other query parameters.
- Use the matching development Clerk instance. Its webhook endpoint must point to that development Convex deployment's `/webhooks/clerk` route and subscribe to `user.created`, `user.updated`, and `user.deleted`.
- The Convex environment needs the matching `CLERK_WEBHOOK_SECRET` for webhook signature verification and `CLERK_SECRET_KEY` for verified-phone lookup. Check webhook delivery results in Clerk; HTTP 200 confirms that the handler completed.
- Real confirmation texts require the development SMS configuration to allow sending. Automated tests disable SMS and assert which messages are scheduled; they do not send live texts.

## Fresh account reset

Delete the test account in Clerk and wait for its `user.deleted` delivery to succeed before creating the replacement account. Do not delete only the `users` row: SMS preferences, guest identities, and RSVP records live in other tables.

The deletion handler clears account and associated guest RSVP records, approvals, ticket redemptions, social/profile values, workspace profile grants, memberships, organizer SMS preferences, unfinished handoffs, guest contacts, and SMS RSVP sessions. Contact-directory consent and profile prefill are reset. Queued RSVP/consent/approval messages for the deleted identity are canceled. Repeated deletion deliveries are safe, and deleting a retired identity does not erase a different live canonical account.

Historical SMS delivery records and STOP opt-outs remain. Deleting an account does not reset Clerk or carrier rate limits. The sign-in form enforces a 30-second code-request cooldown across back navigation and reloads, and honors a longer Clerk retry interval when supplied. Successful code verification clears the local cooldown before session activation, so signing out and back in does not inherit it. Clerk's server-side limits are separate from this local timer. Explicit resends use the current verification attempt. Anonymous RSVP drafts restore form entries but require fresh SMS consent.

## Manual scenarios

| Scenario | Expected result |
| --- | --- |
| New phone, no visible CAPTCHA | Populated phone while sending, then code entry; no CAPTCHA fallback button or prompt. |
| New phone, visible CAPTCHA | Real challenge and populated phone; no code-entry screen until the code is sent. |
| Wrong code or abandoned verification | No new RSVP or RSVP confirmation text. |
| Sign in or sign up, sign out, then sign in again | The completed code was verified through Clerk, and its local cooldown is cleared; one new code request is made. |
| Existing unexpired code for the RSVP phone | Resume code entry without sending another code. Completed, expired, or different-phone attempts are not reused. |
| Successful verification | One RSVP, the applicable confirmation/approval text, and the correct destination without resubmission. |
| Edit phone or reload immediately after requesting a code | Countdown remains; another request is blocked until it expires. |
| Clerk returns a longer retry interval | Countdown respects that interval. A rate-limit error is not presented as a CAPTCHA requirement. |
| Expired draft or event closed during verification | No RSVP; an error and a return-to-RSVP link preserve the form/navigation context. |
| Completion request interrupted | Retry completes the same draft; no duplicate confirmation. |
| Deleted Clerk account, then fresh signup with the same phone | No inherited SMS enrollment or previous RSVP. Check a new consent selection before enabling texts. |
| Admin visits `/` | The event homepage remains available. |
| Local, development-domain, and production entry | Authentication and return URLs stay in the matching environment. |

Also check the public-only, mixed public/private, and private-only event entry paths, and inspect the form and verification screen on mobile and desktop. CAPTCHA challenges are controlled by Clerk and cannot be guaranteed on every real signup.

Run `bun run quality` from the repository root for the full formatting/lint, test, and production-build gate. The new lifecycle regressions are in `packages/backend/__tests__/rsvp-verification-lifecycle.test.ts`; UI regressions cover CAPTCHA visibility, cooldowns, draft recovery, and post-verification routing.
