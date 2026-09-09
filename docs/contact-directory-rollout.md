# Contact directory and audience rollout

Contacts, command-palette search, and text-blast targeting share the stored workspace contact directory. An account enters a workspace directory through an RSVP or workspace guest profile; a global account alone is insufficient.

## Deployment order

1. Run `bun run quality` from the repository root.
2. Deploy the additive backend schema and synchronization functions. Keep the previous `getAvailableListsForEvent` and `getAvailableListsForEvents` functions in the first deployment for browsers still using the previous frontend. They are removed after the dashboard switch.
3. From `packages/backend`, enumerate workspaces using `bunx --no-install convex run --prod contactRollout:workspaces '{}'`. Follow `nextCursor` when present.
4. Start each workspace with `bunx --no-install convex run --prod contactSync:startBackfillInternal '{"workspaceSlug":"dojo-pomodoro"}'`. Repeating this command leaves a building/ready backfill unchanged and resumes a failed backfill from its saved cursor.
5. Wait for every workspace's directory state to be `ready`. Run `contactRollout:auditWorkspace` with the workspace slug. Require zero invalid aliases, pending merges, and duplicate active phone contacts. The audit counts canonical contacts, retained aliases, and distinct contact/event relationships using bounded queries.
6. Exercise `contactRollout:verifyDirectoryPage` with and without multiple `eventIds`. It calls the same query and contact-summary helpers as the public directory and returns only counts and continuation state.
7. Run `contactRollout:prepareVerificationPreview` with the workspace slug and selected event IDs. Poll `contactRollout:verificationStatus` using the returned preview ID. Require `ready` and reconcile `eligible + excluded = processed`. These operator functions never create a blast or schedule SMS delivery.
8. Promote the dashboard deployment after readiness and verification. Contacts, search, and the blast picker switch in the same frontend release. Deploy the final backend to remove the obsolete list-scan endpoints.

## Backfill and recovery

The backfill processes at most 40 source records per mutation. It covers RSVPs, workspace guest profiles, existing blasts, successful deliveries, notifications, conversation threads/messages, and legacy event workspace scope. Saved phase/cursor state makes retries resumable. Contact relationships, identity aliases, facets, and delivery projections use stable source IDs and idempotent updates.

Contact merges retain the original contact ID as an alias and move relationships/deliveries in batches. Old explicit contact selections resolve through that alias. Legacy draft RSVP selections are canonicalized in batches before filtering, preserving their original event/list/status constraints.

Inspect failed directory state before retrying. Application errors retain the current cursor and an error description. If a platform interruption leaves a job in `building`, inspect its scheduled function in Convex before resuming that exact `contactSync:backfillBatch` state ID; avoid launching competing backfill jobs.

## Monitoring and verification

Use `bunx --no-install convex logs --prod --success --jsonl` during rollout. Inspect `contactSync:backfillBatch`, `contacts:list`, `contactAudiences:prepareBatch`, and the operator probes for failures, database read documents/bytes, duration, and progress. Stop the frontend switch if any workspace is incomplete or probes fail. The previous dashboard can remain on its existing deployment while the backend finishes.

Filtering uses indexed contact ordering and bounded candidate/history continuation. An empty intermediate batch means the query must continue, not that the directory is empty. Events constrain which people match; separate paginated contact event/message histories retain their full workspace history.

New audiences start unselected. Explicit contacts persist across pages/sorts; filter changes clear selection. “Select all matching” stores the filter specification. Preview preparation freezes unique eligible phone recipients in a reusable snapshot. Sending checks current workspace consent, opt-outs, phone identity, and QR eligibility again immediately before delivery. Successful deliveries are not retried. A pending provider request of uncertain outcome is not sent again automatically. Expired send leases make interrupted jobs retryable without discarding the reviewed snapshot.

## Regression coverage

Backend regressions include 4,200 contacts and 33,600 RSVPs across eight events, bounded directory/filter/preview/send preparation reads, guest/account merges, profile-only membership, legacy RSVP aliases, full paginated history, eventless workspace sending and reply routing, consent/opt-out changes, preview invalidation, and retry leases. SMS delivery is mocked. Frontend regressions cover selection across pages, all-matching/empty selection, errors, incomplete filters, and URL state.

The large fixture exercises bounded preview continuation; smaller fixtures exercise complete preview and delivery workflows. It does not send 4,200 test messages.
