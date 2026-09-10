# Text RSVP ownership and source rollout

Text, form, and API submissions share the existing approval rules. A text response does not grant approval. Signing in links only RSVPs and their guest records; it does not merge accounts or transfer organization roles.

## Release order

1. Run `bun run quality` at the repository root.
2. Deploy the additive Convex schema, SMS association writes, source fields, and `rsvps:reconcileCurrentUserRsvps` before releasing dependent clients. The existing production workflow deploys the backend after CI. Keep `CLERK_SECRET_KEY` configured for the same Clerk instance used by guests.
3. Release Dojo, Club Chlorine, Danza Orgánica, and Coucou. Their shared recovery boundary waits for Clerk and Convex authentication, verifies phone ownership with Clerk, reconciles matching RSVPs, and invalidates queries before mounting guest pages.
4. Review and apply the historical repair below. Revisit a previously affected account after repair to reconcile its newly recovered associations.

Existing message copy and enabled settings are unchanged. Hosts opt in to the status link with **Insert sign-in CTA** in the event request/approval message editors. `{{eventStatusUrl}}` resolves to the destination workspace's public domain and `/events/{shortId-or-eventId}/status`, using the existing tenant sign-in return flow.

## Historical repair

Use a Coucou platform maintenance identity as documented in the root README. Run from `packages/backend` against the intended deployment. The examples below explicitly target production; omit `--prod` for development.

Dry-run the two evidence streams independently:

```sh
bunx --no-install convex run --prod identityConsolidation:repairTextRsvpAssociations '{"evidence":"reply_attempts","batchSize":100,"dryRun":true}' --identity "$COUCOU_PLATFORM_IDENTITY"
bunx --no-install convex run --prod identityConsolidation:repairTextRsvpAssociations '{"evidence":"sessions","batchSize":100,"dryRun":true}' --identity "$COUCOU_PLATFORM_IDENTITY"
```

For each stream, pass `nextCursor` as `cursor` on subsequent calls until `isDone` is true. Save every report. Each proposed update includes its evidence ID, RSVP ID, whether a phone association/session link is needed, and whether text source is proven. `unresolved` counts evidence that could not safely identify a destination.

After reviewing the reports, repeat both streams from the beginning with `dryRun:false`, following their returned cursors. Every mutation is atomic and repeatable. An interrupted pass can resume at the last completed cursor or restart from the beginning. A subsequent dry-run should have no updates for the same evidence; new submissions may add new evidence during rollout.

The repair follows retired RSVP aliases but does not infer the retained record's source from a discarded duplicate. A successful legacy reply attempt proves text creation only for its original destination RSVP. Legacy sessions without a disposition need a successful receipt matching the phone, event, and creation timestamp to prove text origin. Successful sessions can still restore phone associations without proving origin. “Already exists” evidence associates the sender without relabeling form/API submissions. Uncertain origins stay Unknown. Repairs record the previous RSVP and evidence ID in the audit log and do not enqueue confirmation messages.

## Verification

Check text RSVP → sign-in → event entry, direct RSVP URL, status URL, and My Tickets on all four sites. Approved guests reach tickets, pending guests see status, and denied guests reach the denied page. An explicit list change still opens that flow. A phone without a matching RSVP gets an explanation, switch-account control, and link to the event.

Regression suites cover verified/unverified and mismatched phones, canonical aliases, legacy guest IDs, older same-phone accounts, duplicate replies, collisions, redeemed tickets, revoked sharing, organizer consent, queued approval delivery, reconciliation retries, source exports, API/webhook payloads, and CTA rendering. SMS delivery is mocked in tests. Check pending, immediate approval, and deferred-ticket templates with the CTA without changing their QR or enabled settings.

To roll back client behavior, restore the previous client deployment while leaving the additive backend fields and RSVP aliases intact. Do not clear recorded source or phone associations, rerun account consolidation, or resend approval messages as part of rollback. Repair audit entries retain previous RSVP snapshots for investigating any specific disputed record.
